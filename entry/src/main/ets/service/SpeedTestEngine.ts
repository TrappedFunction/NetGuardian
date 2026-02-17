import { http } from '@kit.NetworkKit';
import Logger from '../common/utils/Logger';
import nativeGuardian, { TrafficStats } from 'libnet_guardian.so';

/**
 * 测速阶段枚举
 */
export enum TestPhase {
  IDLE, // 等待用户点击
  DOWNLOAD, // 测下载，持续 N 秒或 N MB
  UPLOAD, // 测上传，持续 N 秒
  FINISHED // 生成本轮报告（Max/Min/Avg）
}

// PhaseStats 导出
export interface PhaseStats {
  max: number;
  min: number;
  avg: number;
}

/**
 * 测速结果统计实体
 */
export interface SpeedStats {
  currentKbps: number;
  maxKbps: number;
  minKbps: number;
  avgKbps: number;
  progress: number; // 0-100 (当前阶段的进度)
  phase: TestPhase;
}

/**
 * 测速回调接口定义
 */
export type SpeedCallback = (
  currentKbps: number,
  progress: number,
  phase: TestPhase,
  currentStats: PhaseStats // 当前阶段的实时统计
) => void;

/**
 * 真实网络测速引擎
 * 原理：通过 HTTP GET 请求下载大文件，计算单位时间内的接收字节数
 * 策略：使用“时间窗口聚合”算法计算瞬时速度，避免 UI 抖动
 */
export class SpeedTestEngine {
  private httpRequest: http.HttpRequest | null = null;
  private  isRunning: boolean = false;

  private readonly UPLOAD_SIZE = 100 * 1024 * 1024;

  // 使用华为云测速源的 10MB - 100MB 文件
  // 备选：https://speed.cloudflare.com/__down?bytes=10000000
  private readonly DOWN_URL  = 'http://speedtest.tele2.net/100MB.zip';
  // tele2 的测速接口
  private readonly UP_URL = 'http://speedtest.tele2.net/upload.php';

  // 状态变量
  private totalBytesReceived: number = 0; // 总接收字节
  private totalFileSize: number = 0; // 文件总大小

  // 统计相关变量
  private samples: number[] = [];
  private totalBytes: number = 0;
  private startTime: number = 0;
  private lastCalcTime: number = 0;
  private cycleBytes: number = 0;
  private lastTotalSent: number = 0;

  // 临时保存下载结果，以便最终汇总
  private downResult: number = 0;

  // 瞬时速度计算相关变量
  private cycleBytesReceived: number = 0; // 当前计算周期内累积的字节数
  private readonly CALC_INTERVAL = 500; // 计算间隔，单位ms

  private onSpeedUpdate: SpeedCallback | null = null; // 回调函数引用
  private currentPhase: TestPhase = TestPhase.IDLE; // 当前正在进行的阶段 (用于门禁检查)
  private phaseTimer: number = -1; // 定时器句柄 (用于清除僵尸定时器)
  private currentSessionId: number = 0; // 会话 ID，用于隔离不同次测速

  /**
   * 启动完整测速流程 (Download -> Upload)
   * @param callback 速度更新回调
   */
  public async startTest(callback: SpeedCallback): Promise<void> {
    if(this.isRunning){
      Logger.warn('SpeedEngine', 'Test is already running.');
      return;
    }

    this.isRunning = true;
    this.currentSessionId++;
    const sessionId = this.currentSessionId;

    // 1. 开始下载测试
    Logger.info('SpeedEngine', '>>> Starting DOWNLOAD Phase <<<');
    this.currentPhase = TestPhase.DOWNLOAD;
    await this.runPhase(TestPhase.DOWNLOAD, callback, sessionId);

    if (!this.isRunning || this.currentSessionId !== sessionId) return; // 检查会话有效性：如果中途被停止或开始了新会话，立即中断

    // 稍微停顿，给 UI 喘息
    await new Promise(r => setTimeout(r, 500));

    // 2. 开始上传测试
    Logger.info('SpeedEngine', '>>> Starting UPLOAD Phase <<<');
    this.currentPhase = TestPhase.UPLOAD;
    await this.runPhase(TestPhase.UPLOAD, callback, sessionId);

    // 3. 结束
    if (this.currentSessionId === sessionId) {
      Logger.info('SpeedEngine', 'Test Finished');
      this.cleanup();
      callback(0, 100, TestPhase.FINISHED, { max: 0, min: 0, avg: 0 });
    }
  }

  /**
   * 停止测速
   */
  public stopTest(): void {
    if(!this.isRunning) return;
    Logger.info('SpeedEngine', 'Stopping test...');
    this.cleanup();
  }

  // 统一清理函数
  private cleanup() {
    this.isRunning = false;
    this.currentPhase = TestPhase.IDLE;

    // 清除僵尸定时器
    if (this.phaseTimer !== -1) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = -1;
    }

    // 销毁请求
    if (this.httpRequest) {
      try {
        this.httpRequest.off('dataReceive'); // 移除监听，防止幽灵回调
        this.httpRequest.off('dataSendProgress');
        this.httpRequest.destroy();
      } catch (e) {}
      this.httpRequest = null;
    }
  }

  /**
   * 执行单个阶段 (下载或上传)
   * 逻辑：运行固定时长
   */
  private runPhase(phase: TestPhase, callback: SpeedCallback, sessionId: number): Promise<void> {
    return new Promise((resolve) => {
      // 如果会话已过期，直接结束
      if (this.currentSessionId !== sessionId) {
        resolve();
        return;
      }

      this.resetStats();
      nativeGuardian.resetState();
      this.lastTotalSent = 0;
      this.httpRequest = http.createHttp();

      // 保存定时器 ID
      this.phaseTimer = setTimeout(() => {
        if (this.currentSessionId === sessionId) {
          Logger.info('SpeedEngine', 'Phase timeout, finishing...');
          this.finishPhase(resolve, sessionId);
        }
      }, 8000);

      if (phase === TestPhase.DOWNLOAD) {
        this.setupDownload(phase, callback, resolve, sessionId);
      } else {
        this.setupUpload(phase, callback, resolve, sessionId);
      }

      // 监听错误，防止卡死
      this.httpRequest.on('headersReceive', () => {}); // 占位，防止报错
    });
  }

  private setupDownload(phase: TestPhase, callback: SpeedCallback, resolve: Function, sessionId: number) {
    const url = `${this.DOWN_URL}?nocache=${Date.now()}_${Math.random()}`;

    // 订阅进度事件
    this.httpRequest!.on('dataReceive', (data: ArrayBuffer) => {
      if (!this.isRunning || this.currentSessionId !== sessionId || this.currentPhase !== TestPhase.DOWNLOAD) {
        return; // 丢弃僵尸数据
      }
      try{
        const stats = nativeGuardian.analyzeTraffic(data);

        // stats 可能为空（第一个包），做个保护
        if (stats && stats.instantKbps !== undefined) {
          // 将 C++ 计算的总字节数同步回来
          this.totalBytes = stats.totalBytes;
          this.cycleBytes += data.byteLength;
          this.notifyStats(phase, callback, stats);

          // Logger.debug('Native', `Jitter: ${stats.jitter.toFixed(2)}, Avg: ${stats.avgKbps.toFixed(2)}`);
        }
      } catch (e) {
        Logger.error('SpeedEngine', 'Native call failed', e);
        // 降级处理：如果在非真机环境或 so 加载失败，回退到 JS 逻辑
        this.recordData(data.byteLength);
      }

    });

    this.httpRequest!.requestInStream(url, {
      method: http.RequestMethod.GET,
      connectTimeout: 100000,
      readTimeout: 160000,
      usingCache: false,
      header: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    }).then((code) => {
      Logger.info('SpeedEngine', `Download finished naturaly: ${code}`);
      // 如果文件下完了，时间还没到，也应该结束本阶段
      if (this.currentSessionId === sessionId) {
        Logger.info('SpeedEngine', `Download finished: ${code}`);
        this.finishPhase(resolve, sessionId);
      }
    }).catch(e => {
      Logger.error('SpeedEngine', 'Download error', e);
      this.finishPhase(resolve, sessionId);
    });
  }

  private setupUpload(phase: TestPhase, callback: SpeedCallback, resolve: Function, sessionId: number) {
    // 生成一个 5MB 的垃圾数据用于上传
    const dummyData = new ArrayBuffer(this.UPLOAD_SIZE);
    if (!this.isRunning || this.currentSessionId !== sessionId) {
      resolve();
      return;
    }

    // 监听上传进度
    const url = `${this.UP_URL}?nocache=${Date.now()}_${Math.random()}`;
    this.httpRequest!.request(url, {
      method: http.RequestMethod.POST,
      extraData: dummyData, // 上传数据
      connectTimeout: 100000,
      readTimeout: 160000,
      usingCache: false,
      header: { 'Cache-Control': 'no-cache' }
    }).then((code) => {
      Logger.info('SpeedEngine', `UPload finished naturaly: ${code}`);
      if (this.currentSessionId === sessionId) {
        this.finishPhase(resolve, sessionId);
      }
    }).catch(e => {
      Logger.error('SpeedEngine', 'Upload error', e);
      this.finishPhase(resolve, sessionId);
    });

    this.httpRequest!.on('dataSendProgress', (data) => {
      if (!this.isRunning || this.currentSessionId !== sessionId || this.currentPhase !== TestPhase.UPLOAD) {
        return;
      }
      const currentTotal = data.sendSize;
      const delta = currentTotal - this.lastTotalSent;
      this.lastTotalSent = currentTotal;

      if (delta > 0) {
        try {
          // 调用 analyzeLength 传入增量
          const stats = nativeGuardian.analyzeLength(delta);

          if (stats && stats.instantKbps !== undefined) {
            // 同步总字节数
            this.totalBytes = stats.totalBytes;
            // 传递 stats 给 UI
            this.notifyStats(phase, callback, stats);
          }
        } catch (e) {
          Logger.error('SpeedEngine', 'Native analyzeLength failed', e);
        }
      }
    });
  }

  private finishPhase(resolve: Function, sessionId: number) {
    if (this.currentSessionId !== sessionId) {
      Logger.warn('SpeedEngine', 'Zombie finishPhase ignored.');
      return;
    }

    // 清除定时器，防止它在未来再次触发
    if (this.phaseTimer !== -1) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = -1;
    }

    if (this.httpRequest) {
      this.httpRequest.destroy();
      this.httpRequest = null;
    }
    resolve();
  }

  /**
   * 重置状态
   */
  private resetStats(): void{
    this.samples = [];
    this.totalBytes = 0;
    this.startTime = Date.now();
    this.lastCalcTime = this.startTime;
    this.cycleBytes = 0;
  }

  private recordData(byteLength: number) {
    this.totalBytes += byteLength;
    this.cycleBytes += byteLength;
  }

  private notifyStats(phase: TestPhase, callback: SpeedCallback, cppStats: TrafficStats) {
    const now = Date.now();
    const totalDuration = (now - this.startTime) / 1000;

    callback(
      Math.floor(cppStats.instantKbps), // 瞬时速度给波形图
      Math.min(100, Math.floor(totalDuration / 8 * 100)),
      phase,
      {
        max: Math.floor(cppStats.maxKbps),
        min: Math.floor(cppStats.minKbps) < Math.floor(cppStats.avgKbps) ? Math.floor(cppStats.minKbps) : Math.floor(cppStats.avgKbps),
        avg: Math.floor(cppStats.avgKbps)
      }
    );

    // lastCalcTime 还是要更新，用于节流 callback 频率
    this.lastCalcTime = now;
  }
}