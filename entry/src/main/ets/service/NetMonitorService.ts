import connection from '@ohos.net.connection';
import Logger from '../common/utils/Logger';
import {NetInfoModel, DEFAULT_NET_INFO} from '../model/NetInfoModel';
import { SpeedTestEngine, TestPhase, PhaseStats, SpeedCallback } from './SpeedTestEngine';
import { RdbManager } from '../common/database/RdbManager';
import relationalStore from '@ohos.data.relationalStore';
import { HISTORY_TABLE } from '../model/HistoryRecord';

// 定义 AppStorage 的 Key，UI 组件将通过这个 Key 监听数据变化
export const APP_STORAGE_KEY_NET_INFO = 'AppStorage_NetInfo';
// 功能开关 Key
export const APP_STORAGE_KEY_SPEED_TEST_ENABLED = 'AppStorage_SpeedTestEnabled';

/**
 * 网络监控服务 (单例模式)
 * 职责：
 * 1. 维护网络连接句柄
 * 2. 监听网络状态变更 (Availability, Capabilities)
 * 3. 包含 Mock 机制以适配模拟器环境
 * 4. 更新全局 AppStorage
 */
export class NetMonitorService{
  // 单例实例
  private static instance: NetMonitorService;

  // 实例化引擎
  private speedEngine: SpeedTestEngine = new SpeedTestEngine();

  // 系统网络连接对象
  private netConnection: connection.NetConnection | null = null;

  private isSpeedTestEnabled: boolean = true; // 默认开启测速功能入口

  // 控制数据库写入频率
  private lastSaveTime: number = 0;
  private readonly SAVE_INTERVAL = 5000; // 5秒存一次

  /**
   * 私有构造函数，防止外部直接 new
   * 在这里初始化 AppStorage
   */
  private constructor() {
    Logger.info('Service', 'Initializing NetMonitorService...');
    // 初始化全局状态，确保 UI 绑定时有默认值
    AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, DEFAULT_NET_INFO);
    AppStorage.setOrCreate(APP_STORAGE_KEY_SPEED_TEST_ENABLED, this.isSpeedTestEnabled);
  }

  /**
   * 获取单例入口
   */
  public static getInstance(): NetMonitorService{
    if(!NetMonitorService.instance){
      NetMonitorService.instance = new NetMonitorService();
    }
    return NetMonitorService.instance;
  }

  /**
   * 启动监控流程
   */
  public startMonitor(): void {
    this.cleanOldData(); // 清理旧数据
    this.startBasicNetworkMonitor(); // 启动基础连接监听 (IP, Type...)
  }

  /**
   * 停止监控 (通常在 Ability 销毁时调用)
   */
  public stopMonitor(): void {
    if (this.netConnection) {
      this.netConnection.unregister(() => {});
      this.netConnection = null;
    }
    this.speedEngine.stopTest(); // 强行停止测速
  }

  /**
   * 功能开关切换 (对应设置页的 Toggle)
   */
  public switchSpeedTestFeature(enabled: boolean) {
    this.isSpeedTestEnabled = enabled;
    AppStorage.setOrCreate(APP_STORAGE_KEY_SPEED_TEST_ENABLED, enabled);

    // 如果关闭了功能且正在测速，强制停止
    if (!enabled) {
      this.speedEngine.stopTest();
      this.resetSpeedState();
    }
  }

  // ==================== 2. 基础网络监听 (Passive) ====================
  // 负责：IP, 网关, 信号强度, 网络类型
  // 这部分逻辑始终运行，不消耗流量
  private startBasicNetworkMonitor() {
    this.netConnection = connection.createNetConnection();

    this.netConnection.on('netAvailable', (handle) => this.refreshBasicInfo(handle));
    this.netConnection.on('netCapabilitiesChange', (data) => this.refreshBasicInfo(data.netHandle));
    this.netConnection.on('netLost', () => this.updateToLostState());

    this.netConnection.register((err) => {
      if (!err) this.getActiveNetworkInfo();
    });
  }

  private async getActiveNetworkInfo() {
    try {
      const handle = await connection.getDefaultNet();
      this.refreshBasicInfo(handle);
    } catch (e) { /* ignore */ }
  }

  private async refreshBasicInfo(handle: connection.NetHandle) {
    try {
      // 获取当前 AppStorage 中的数据副本 (保留之前的测速结果，只更新基础信息)
      let currentInfo = AppStorage.Get<NetInfoModel>(APP_STORAGE_KEY_NET_INFO) || { ...DEFAULT_NET_INFO };

      // 获取系统底层信息
      const [cap, props] = await Promise.all([
        connection.getNetCapabilities(handle),
        connection.getConnectionProperties(handle)
      ]);

      // 更新基础字段
      currentInfo.ipAddress = props.linkAddresses?.[0]?.address?.address || '0.0.0.0';
      currentInfo.gateway = props.routes?.[0]?.gateway?.address || '0.0.0.0';

      let typeStr = 'UNKNOWN';
      if (cap.bearerTypes.includes(connection.NetBearType.BEARER_WIFI)){
        typeStr = 'WIFI';
      }else if(cap.bearerTypes.includes(connection.NetBearType.BEARER_CELLULAR)){
        typeStr = 'CELLULAR';
      } else if (cap.bearerTypes.includes(connection.NetBearType.BEARER_ETHERNET)) {
        // 适配模拟器或有线网
        typeStr = 'ETHERNET';
      } else {
        // 兜底显示
        typeStr = 'OTHER';
      }
      currentInfo.netType = typeStr;

      // TODO真实环境 cap.signalStrength 可能拿不到，这里暂且保留
      currentInfo.signalLevel = 4;

      // 4. 写回 AppStorage
      AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, currentInfo);

    } catch (e) {
      Logger.error('Service', 'Refresh basic info failed', e);
    }
  }

  private updateToLostState() {
    let currentInfo = AppStorage.get<NetInfoModel>(APP_STORAGE_KEY_NET_INFO) || { ...DEFAULT_NET_INFO };
    currentInfo.netType = '无网络';
    currentInfo.ipAddress = '0.0.0.0';
    AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, currentInfo);
  }

  // ==================== 3. 主动测速逻辑 (Active) ====================
  // 负责：下载/上传测速，更新瞬时速度，保存结果

  /**
   * UI 点击"开始测速"时调用
   */
  public startOneTimeTest() {
    if (!this.isSpeedTestEnabled) return;

    // 重置之前的测试结果
    this.resetTestResult();

    Logger.info('Service', 'Starting One-Time Speed Test...');

    // 启动引擎
    this.speedEngine.startTest((currentKbps: number, progress: number, phase: TestPhase, stats: PhaseStats) => {
      this.handleSpeedCallback(currentKbps, progress, phase, stats);
    });
  }

  private resetTestResult() {
    let currentInfo = AppStorage.get<NetInfoModel>(APP_STORAGE_KEY_NET_INFO) || { ...DEFAULT_NET_INFO };
    currentInfo.downStats = { max: 0, min: 0, avg: 0 };
    currentInfo.upStats = { max: 0, min: 0, avg: 0 };
    currentInfo.hasFinishedTest = false;
    AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, currentInfo);
  }

  /**
   * 处理测速引擎的回调
   */
  private handleSpeedCallback(currentKbps: number, progress: number, phase: TestPhase, stats: PhaseStats) {
    // 获取当前数据副本
    let oldInfo  = AppStorage.get<NetInfoModel>(APP_STORAGE_KEY_NET_INFO) || { ...DEFAULT_NET_INFO };

    let currentInfo = { ...oldInfo };

    // 同步阶段和进度
    currentInfo.testPhase = phase;
    currentInfo.testProgress = progress;

    // 根据阶段分流数据
    if (phase === TestPhase.DOWNLOAD) {
      currentInfo.linkDownSpeed = currentKbps;
      currentInfo.linkUpSpeed = 0;
      // 更新下载统计
      currentInfo.downStats = { ...stats };
      // 拥塞判断
      currentInfo.isCongested = (currentKbps > 0 && currentKbps < 500);
    } else if (phase === TestPhase.UPLOAD) {
      currentInfo.linkDownSpeed = 0; // 或者保持下载均值，看你UI设计
      currentInfo.linkUpSpeed = currentKbps;
      // 更新上传统计
      currentInfo.upStats = { ...stats };
      currentInfo.isCongested = false; // 上传不判拥塞
    }

    // 处理结束状态
    if (phase === TestPhase.FINISHED) {
      Logger.info('Service', 'Speed Test Finished. Saving result...');
      // 归零瞬时
      currentInfo.linkDownSpeed = 0;
      currentInfo.linkUpSpeed = 0;
      currentInfo.hasFinishedTest = true;
      // 保存历史记录
      this.saveHistoryRecord(currentInfo);
    }

    currentInfo = {...currentInfo};

    // 刷新 UI
    AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, currentInfo);

  }

  private resetSpeedState() {
    let currentInfo = AppStorage.get<NetInfoModel>(APP_STORAGE_KEY_NET_INFO) || { ...DEFAULT_NET_INFO };
    currentInfo.testPhase = TestPhase.IDLE;
    currentInfo.linkDownSpeed = 0;
    currentInfo.linkUpSpeed = 0;
    AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, currentInfo);
  }

  // ==================== 数据持久化 (Persistence) ====================

  /**
   * 保存测速报告
   */
  private async saveHistoryRecord(info: NetInfoModel) {
    // 读取 downStats.avg
    const finalDownSpeed = info.downStats.avg;

    // 防御性检查：如果速度为0，说明可能测速失败或中断，不存
    if (finalDownSpeed <= 0) {
      Logger.warn('Service', 'Test result is 0, skip saving.');
      return;
    }

    await RdbManager.getInstance().insertRecord({
      timestamp: Date.now(),
      downSpeed: finalDownSpeed, // 存入数据库
      netType: info.netType,
      isCongested: info.isCongested ? 1 : 0
    });

    Logger.info('Service', `History Saved: ${finalDownSpeed} kbps`);
  }

  /**
   * 自动清理 1 年前的数据
   */
  private async cleanOldData() {
    try {
      const now = new Date().getTime();
      // 1年 = 365天  * 24小时 * ...
      const oneYearsAgo = now - (365 * 24 * 60 * 60 * 1000);

      const predicates = new relationalStore.RdbPredicates(HISTORY_TABLE.tableName);
      // 删除 timestamp < oneYearsAgo
      predicates.lessThan(HISTORY_TABLE.columns.TIMESTAMP, oneYearsAgo);

      // 执行删除 (不阻塞主流程，异步执行)
      const count = await RdbManager.getInstance().deleteRecords(predicates);
      if (count > 0) {
        Logger.info('Service', `Housekeeping: Cleaned ${count} old records.`);
      }
    } catch (e) {
      Logger.error('Service', 'Auto clean failed', e);
    }
  }

}
