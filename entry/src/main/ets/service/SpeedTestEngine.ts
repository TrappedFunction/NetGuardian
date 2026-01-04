import { http } from '@kit.NetworkKit';
import Logger from '../common/utils/Logger';

/**
 * 测速回调接口定义
 * speedKbps: 当前瞬时速度 (kbps)
 * progress: 下载进度 (0-100)
 */
export type SpeedCallback = (speedKbps: number, progress: number) => void;

/**
 * 真实网络测速引擎
 * 原理：通过 HTTP GET 请求下载大文件，计算单位时间内的接收字节数
 * 策略：使用“时间窗口聚合”算法计算瞬时速度，避免 UI 抖动
 */
export class SpeedTestEngine {
  private httpRequest: http.HttpRequest | null = null;
  private  isRunning: boolean = false;

  // 使用华为云测速源的 10MB - 100MB 文件
  // 备选：https://speed.cloudflare.com/__down?bytes=10000000
  private readonly TARGET_URL = 'http://speedtest.tele2.net/10MB.zip';

  // 状态变量
  private totalBytesReceived: number = 0; // 总接收字节
  private totalFileSize: number = 0; // 文件总大小

  // 瞬时速度计算相关变量
  private lastCalcTime: number = 0; // 上次计算时间
  private cycleBytesReceived: number = 0; // 当前计算周期内累积的字节数
  private readonly CALC_INTERVAL = 500; // 计算间隔，单位ms

  // 回调函数引用
  private onSpeedUpdate: SpeedCallback | null = null;

  /**
   * 开始测速
   * @param callback 速度更新回调
   */
  public startTest(callback: SpeedCallback): void {
    if(this.isRunning){
      Logger.warn('SpeedEngine', 'Test is already running.');
      return;
    }

    this.isRunning = true;
    this.onSpeedUpdate = callback;
    this.resetState();

    this.httpRequest = http.createHttp();
    Logger.info('SpeedEngine', 'Starting download test...');

    // 订阅 HTTP 事件
    this.subscribeEvents();

    // 检查原 URL 是否已经包含 '?'
    const separator = this.TARGET_URL.includes('?') ? '&' : '?';
    // 添加时间戳防止缓存,来避开缓存
    const finalUrl = `${this.TARGET_URL}${separator}t=${new Date().getTime()}`;

    Logger.info('SpeedEngine', `Requesting: ${finalUrl}`);

    // 发起请求
    this.httpRequest.requestInStream(finalUrl, {
      method: http.RequestMethod.GET,
      // 必须指定接收类型为 ARRAY_BUFFER，否则二进制文件会转字符串导致崩溃
      expectDataType: http.HttpDataType.ARRAY_BUFFER,
      // 禁用系统缓存
      usingCache: false,
      priority: 1, // 高优先级
      // 设置较大的超时时间
      connectTimeout: 10000,
      readTimeout: 60000
    }).then((responseCode) => {
      Logger.info('SpeedEngine', `Download finished with code: ${responseCode}`);
      this.stopTest(); // 下载完自动停止
    }).catch((err) => {
      // 常见错误：如果是 SSL 错误，说明模拟器时间不对或证书问题
      Logger.error('SpeedEngine', 'Download failed:', JSON.stringify(err));
      this.stopTest();
    });
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

    // 最后回调一次 0，让 UI 归零
    if(this.onSpeedUpdate){
      this.onSpeedUpdate(0, 100);
      this.onSpeedUpdate = null;
    }
  }

  /**
   * 重置状态
   */
  private resetState(): void{
    this.totalBytesReceived = 0;
    this.totalFileSize = 0;
    this.cycleBytesReceived = 0;
    this.lastCalcTime = new Date().getTime();
  }

  /**
   * 订阅 HTTP 流事件
   */
  private subscribeEvents(): void {
    if(!this.httpRequest) return;

    // 监听下载进度
    this.httpRequest.on('dataReceiveProgress', (data: http.DataReceiveProgressInfo) => {
      if (!this.isRunning) return;
      // data.downloadSize: 已经下载的字节数
      // data.totalSize: 总字节数 (如果服务器没返回 content-length，这里可能是 -1)
      // 更新总大小，供计算百分比使用
      if (data.totalSize > 0) {
        this.totalFileSize = data.totalSize;
      }
      // 校准 totalBytesReceived，防止丢包导致的计数偏差
      this.totalBytesReceived = data.receiveSize;
    });

    // 监听数据流
    // data 是 ArrayBuffer
    this.httpRequest.on('dataReceive', (data: ArrayBuffer) => {
      // 如果这行日志没出来，说明系统根本没给数据
      // Logger.debug('SpeedEngine', `Chunk received: ${data.byteLength} bytes`);

      if(!this.isRunning) return;

      const currentBytes = data.byteLength;
      this.totalBytesReceived += currentBytes;
      this.cycleBytesReceived += currentBytes;

      // 尝试计算瞬时速度
      this.tryCalculateSpeed();
    });
  }

  /**
   * 计算瞬时速度 (Time Window Aggregation Algorithm)
   */

  private tryCalculateSpeed(): void{
    const now = new Date().getTime();
    const timeDiff = now - this.lastCalcTime;

    // 查看累积情况
    // Logger.debug('SpeedEngine', `TimeDiff: ${timeDiff}ms, CycleBytes: ${this.cycleBytesReceived}`);

    // 如果距离上次计算不足 500ms，则只累积数据，不计算，减少 CPU 消耗和 UI 刷新频率
    if(timeDiff < this.CALC_INTERVAL){return;}

    // 计算这 500ms 内收到的 bits
    // 1 Byte = 8 bits
    const bitsReceived = this.cycleBytesReceived * 8;

    // 计算速度 (bps = bits per second)
    // speed_bps = bits / (time_ms / 1000)
    const speedBps = (bitsReceived / timeDiff) * 1000;

    // 转换为 kbps
    const speedKbps = Math.floor(speedBps / 1024);

    // 计算进度
    let progress = 0;
    if (this.totalFileSize > 0) {
      progress = Math.floor((this.totalBytesReceived / this.totalFileSize) * 100);
    }

    // 看到这行日志，UI 才会动
    // Logger.info('SpeedEngine', `UPDATE -> Speed: ${speedKbps} kbps, Progress: ${progress}%`);

    // 回调给 Service
    if (this.onSpeedUpdate) {
      this.onSpeedUpdate(speedKbps, progress);
    }

    // 重置周期状态，开启下一个时间窗口
    this.lastCalcTime = now;
    this.cycleBytesReceived = 0;
  }

}