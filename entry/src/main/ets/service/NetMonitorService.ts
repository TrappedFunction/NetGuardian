import connection from '@ohos.net.connection';
import Logger from '../common/utils/Logger';
import {NetInfoModel, DEFAULT_NET_INFO} from '../model/NetInfoModel';
import { SpeedTestEngine } from './SpeedTestEngine';
import { RdbManager } from '../common/database/RdbManager';
import relationalStore from '@ohos.data.relationalStore';
import { HISTORY_TABLE } from '../model/HistoryRecord';

// 定义 AppStorage 的 Key，UI 组件将通过这个 Key 监听数据变化
export const APP_STORAGE_KEY_NET_INFO = 'AppStorage_NetInfo';
// 用于 Mock 模式的状态同步
export const APP_STORAGE_KEY_IS_MOCK = 'AppStorage_IsMockMode';

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

  // 模拟器模式开关：开发阶段置为 true，真机调试置为 false
  private isMockMode: boolean = true;
  private mockTimer: number = -1;

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
    AppStorage.setOrCreate(APP_STORAGE_KEY_IS_MOCK, this.isMockMode);
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
    // 确保之前的任务都停了，防止重复启动
    this.stopMonitor();

    if(this.isMockMode){
      this.startMockGenerator();
    }else {
      this.startRealMonitor(); // 监听连接状态
      this.startRealSpeedTest(); // 启动测速引擎
    }

    // 启动时执行一次陈旧数据清理
    this.cleanOldData();
  }

  /**
   * 停止监控 (通常在 Ability 销毁时调用)
   */
  public stopMonitor(): void {
    // 停止 Mock 定时器
    if (this.mockTimer !== -1) {
      clearInterval(this.mockTimer);
      this.mockTimer = -1;
    }

    // 停止真实网络监听
    if (this.netConnection) {
      this.netConnection.unregister((err) => {});
      this.netConnection = null;
    }

    // 停止测速引擎, 断开 HTTP 连接
    this.speedEngine.stopTest();
  }

  // 监控逻辑
  private startRealMonitor() {
    Logger.info('Service', 'Starting REAL network monitor...')

    // 1. 创建默认网络连接句柄
    this.netConnection = connection.createNetConnection();

    // 2. 订阅：网络变为可用
    this.netConnection.on('netAvailable', (data: connection.NetHandle) => {
      Logger.info('Service', 'Event: netAvailable');
      this.refreshNetInfo(data);
    });

    // 3. 订阅：网络能力变化 (如信号强度改变、带宽改变)
    this.netConnection.on('netCapabilitiesChange', (data) => {
      Logger.debug('Service', 'Event: netCapabilitiesChange'); // 频率较高，用 debug
      this.refreshNetInfo(data.netHandle);
    });

    // 4. 订阅：网络丢失
    this.netConnection.on('netLost', () => {
      Logger.warn('Service', 'Event: netLost');
      this.updateToLostState();
    });

    // 5. 注册监听器
    this.netConnection.register((err) => {
      if(err){
        Logger.error('Service', 'Register failed:', err);
      }else{
        Logger.info('Service', 'Register success. Fetching initial state...');
        this.getActiveNetworkInfo();
      }
    });
  }

  /**
   * 主动拉取一次当前状态 (用于初始化)
   */
  private async getActiveNetworkInfo() {
    try{
      const handle  = await connection.getDefaultNet();
      this.refreshNetInfo(handle);
    }catch (e) {
      Logger.error('Service', 'Get default net failed:', e);
      this.updateToLostState();
    }
  }

  /**
   * 读取系统信息 -> 清洗数据 -> 写入 AppStorage
   */
  private async refreshNetInfo(handle: connection.NetHandle){
    try{
      // 并行获取能力集和连接属性
      const [cap, props] = await Promise.all([
        connection.getNetCapabilities(handle),
        connection.getConnectionProperties(handle)
      ]);

      // 使用 || 提供默认值，防止 undefined
      const ipStr = props.linkAddresses?.[0]?.address?.address || '0.0.0.0';
      const gatewayStr = props.routes?.[0]?.gateway?.address || '0.0.0.0';

      // 判断网络类型
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

        // 组装数据模型
      const netInfo: NetInfoModel = {
        ipAddress: ipStr,
        gateway: gatewayStr,
        netType: typeStr,
        // TODO：真实环境下，connection 模块拿不到 signalStrength
        // 暂时置为 4 (满格)，主要依赖 Mock 模式展示动态效果
        // 后续引入 Telephony Kit
        signalLevel: 4,
        frequency: 0, // 暂时无法通过常规API获取精确频段，留空
        linkDownSpeed: cap.linkDownBandwidthKbps,
        linkUpSpeed: cap.linkUpBandwidthKbps,
        isCongested: false
      };

      // 更新全局状态，UI会自动刷新
      AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, netInfo);
      Logger.info('Service', 'NetInfo Updated:', netInfo);
    }catch (e){
      Logger.error('Service', 'Refresh info failed:', e);
    }
  }

  private updateToLostState() {
    const lostInfo = {...DEFAULT_NET_INFO, netType: '无网络连接' };
    AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, lostInfo);
  }

  // Mock 逻辑 (适配模拟器)

  private startMockGenerator(){
    Logger.info('Service', 'Starting MOCK generator...');

    // 立即推一次数据
    this.generateMockData();

    // 启动定时器，每 2 秒刷新一次数据，模拟波动
    this.mockTimer = setInterval(() => {
      this.generateMockData();
    }, 2000);
  }

  private generateMockData() {
    // 模拟下行带宽波动 (500kbps - 15000kbps)
    const randomDown = Math.floor(Math.random() * 14500) + 500;
    // 模拟信号波动 (3-4格)
    const randomSignal = Math.floor(Math.random() * 2) + 3;

    const mockInfo: NetInfoModel = {
      ipAddress: '192.168.3.10 (Mock)',
      gateway: '192.168.3.1',
      netType: 'WIFI 6 (Simulated)',
      signalLevel: randomSignal,
      frequency: 5800,
      linkDownSpeed: randomDown,
      linkUpSpeed: Math.floor(randomDown / 8), // 上行通常比下行慢
      // 模拟业务逻辑：带宽极低时认为拥塞
      isCongested: randomDown < 2000
    };

    AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, mockInfo);
    Logger.info('Service', 'Mock Data Pushed:', mockInfo);
  }

  /**
   * 启动真实测速
   */
  private startRealSpeedTest(){
    Logger.info('Service', 'Starting Real Speed Engine...');

    this.speedEngine.startTest((speedKbps, progress) => {
      // 引擎的回调，每 500ms 触发一次
      // 从 AppStorage 取出当前的 NetInfo，更新速度字段，再存回去，AppStorage.Get 返回的也有可能是 undefined
      let currentInfo = AppStorage.get<NetInfoModel>(APP_STORAGE_KEY_NET_INFO) || { ...DEFAULT_NET_INFO };

      // 更新下行速度
      currentInfo.linkDownSpeed = speedKbps;

      // 如果速度超过 50Mbps (50000kbps)，认为非常流畅，否则...
      if (speedKbps > 0 && speedKbps < 1000) {
        currentInfo.isCongested = true;
      } else {
        currentInfo.isCongested = false;
      }

      // 更新全局状态 -> UI 刷新
      AppStorage.setOrCreate(APP_STORAGE_KEY_NET_INFO, currentInfo);

      // 持久化采样逻辑 (Throttling)
      const now = Date.now();
      if(now - this.lastSaveTime > this.SAVE_INTERVAL) {
        this.saveHistoryRecord(currentInfo);
        this.lastSaveTime = now;
      }
      Logger.debug('Service', `Real Speed: ${speedKbps} kbps, Progress: ${progress}%`);
    });
  }

  /**
   * 切换模式 (Hot Swap)
   * @param enableMock 是否开启 Mock 模式
   */
  public switchMode(enableMock: boolean): void {
    if(this.isMockMode === enableMock) return;

    Logger.info('Service', `Switching Mode to: ${enableMock ? 'MOCK' : 'REAL'}`);

    // 更新状态
    this.isMockMode = enableMock;
    // 同步到 AppStorage，让 UI (SettingComponent) 的开关状态也能更新
    AppStorage.setOrCreate(APP_STORAGE_KEY_IS_MOCK, enableMock);

    // 重启服务 (Stop -> Start), 自动释放旧资源并启动新逻辑
    this.startMonitor();
  }

  /**
   * 异步写入数据库
   */
  private async saveHistoryRecord(info: NetInfoModel) {
    // 只有在测速有数据时才存 (防止存一堆 0kbps)
    if(info.linkDownSpeed <= 0) return;

    await RdbManager.getInstance().insertRecord({
      timestamp: Date.now(),
      downSpeed: info.linkDownSpeed,
      netType: info.netType,
      isCongested: info.isCongested ? 1 : 0 // boolean 转 number
    });
    Logger.debug('Service', 'History record saved to DB');
  }

  /**
   * 清理 1 年以前的历史数据
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
