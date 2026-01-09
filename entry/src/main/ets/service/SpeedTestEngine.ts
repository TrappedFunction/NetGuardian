import { http } from '@kit.NetworkKit';
import Logger from '../common/utils/Logger';

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

  // 临时保存下载结果，以便最终汇总
  private downResult: number = 0;

  // 瞬时速度计算相关变量
  private cycleBytesReceived: number = 0; // 当前计算周期内累积的字节数
  private readonly CALC_INTERVAL = 500; // 计算间隔，单位ms

  // 回调函数引用
  private onSpeedUpdate: SpeedCallback | null = null;

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
    // 1. 开始下载测试
    Logger.info('SpeedEngine', '>>> Starting DOWNLOAD Phase <<<');
    await this.runPhase(TestPhase.DOWNLOAD, callback);

    // 稍微停顿，给 UI 喘息
    await new Promise(r => setTimeout(r, 500));

    // 2. 开始上传测试
    Logger.info('SpeedEngine', '>>> Starting UPLOAD Phase <<<');
    await this.runPhase(TestPhase.UPLOAD, callback);

    // 3. 结束
    Logger.info('SpeedEngine', 'Test Finished');
    this.isRunning = false;
    // 回调最后一次，Phase 设为 FINISHED
    callback(0, 100, TestPhase.FINISHED, { max: 0, min: 0, avg: 0 });
  }

  /**
   * 停止测速
   */
  public stopTest(): void {
    if(!this.isRunning) return;

    Logger.info('SpeedEngine', 'Stopping test...');
    this.isRunning = false;

    // 销毁请求，释放资源
    if(this.httpRequest){
      try{
        this.httpRequest.off('dataReceiveProgress');
        this.httpRequest.off('dataReceive');
        this.httpRequest.destroy(); // 防止内存泄漏
      } catch (e) {
        // 忽略销毁时的错误
      }
      this.httpRequest = null;
    }
  }

  /**
   * 执行单个阶段 (下载或上传)
   * 逻辑：运行固定时长
   */
  private runPhase(phase: TestPhase, callback: SpeedCallback): Promise<void> {
    return new Promise((resolve) => {
      this.resetStats();
      this.httpRequest = http.createHttp();

      // 自动停止的定时器 (防止测太久)
      const MAX_DURATION = 8000; // 8秒后强制结束本阶段
      const timer = setTimeout(() => {
        Logger.info('SpeedEngine', 'Phase timeout, finishing...');
        this.finishPhase(resolve);
      }, MAX_DURATION);

      if (phase === TestPhase.DOWNLOAD) {
        this.setupDownload(phase, callback);
      } else {
        this.setupUpload(phase, callback);
      }

      // 监听错误，防止卡死
      this.httpRequest.on('headersReceive', () => {}); // 占位，防止报错
    });
  }

  private setupDownload(phase: TestPhase, callback: SpeedCallback) {
    const url = `${this.DOWN_URL}?t=${Date.now()}`;

    // 订阅进度事件
    this.httpRequest!.on('dataReceive', (data) => {
      this.recordData(data.byteLength);
      this.notifyStats(phase, callback);
    });

    this.httpRequest!.requestInStream(url, {
      method: http.RequestMethod.GET,
      connectTimeout: 100000,
      readTimeout: 160000,
      usingCache: false
    }).then(() => {
      // 下载自然结束
    }).catch(e => {
      Logger.error('SpeedEngine', 'Download error', e);
    });
  }

  private setupUpload(phase: TestPhase, callback: SpeedCallback) {
    // 生成一个 5MB 的垃圾数据用于上传
    const dummyData = new ArrayBuffer(this.UPLOAD_SIZE);

    // 监听上传进度
    const url = `${this.UP_URL}?t=${Date.now()}`;
    this.httpRequest!.request(url, {
      method: http.RequestMethod.POST,
      extraData: dummyData, // 上传数据
      connectTimeout: 100000,
      readTimeout: 160000,
    }).then(() => {
      // 上传完成
    }).catch(e => {
      Logger.error('SpeedEngine', 'Upload error', e);
    });

    this.httpRequest!.on('dataSendProgress', (data) => {
      if (!this.isRunning) return; // 如果已经停止，忽略后续回调
      // data.sendSize 是累计发送量, 将其视为 totalBytes，让 notifyStats 去计算时间差分
      this.totalBytes = data.sendSize;
      this.notifyStats(phase, callback);
    });
  }

  private finishPhase(resolve: Function) {
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

  private notifyStats(phase: TestPhase, callback: SpeedCallback) {
    const now = Date.now();
    const diff = now - this.lastCalcTime;
    if (diff < 500) return; // 500ms 刷新一次

    // 计算瞬时速度 (针对下载)
    let instantBps = 0;

    if (phase === TestPhase.DOWNLOAD) {
      // 下载逻辑：依靠 cycleBytes (增量)
      instantBps = (this.cycleBytes * 8) / (diff / 1000);
    } else {
      instantBps = (this.totalBytes * 8) / ((now - this.startTime) / 1000); // 这是平均速度，上传瞬时较难获取
    }

    let instantKbps = Math.floor(instantBps / 1024);
    if (instantKbps > 0) this.samples.push(instantKbps);

    // --- 计算实时统计 ---
    const max = this.samples.length > 0 ? Math.max(...this.samples) : 0;
    const min = this.samples.length > 5 ? Math.min(...this.samples.slice(2)) : 0;
    const totalDuration = (now - this.startTime) / 1000;
    const avg = totalDuration > 0 ? Math.floor((this.totalBytes * 8 / 1024) / totalDuration) : 0;

    // --- 回调 ---
    callback(
      instantKbps,
      Math.min(100, Math.floor(totalDuration / 8 * 100)), // 假定8秒进度
      phase,
      { max, min, avg } // 传出当前统计
    );

    this.lastCalcTime = now;
    this.cycleBytes = 0;
  }
}