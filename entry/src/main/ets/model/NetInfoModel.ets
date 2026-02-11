/**
 * 网络基础信息数据模型
 * 作为 Service 层向 UI 层传输数据的标准契约 (DTO)
 */
import { TestPhase } from '../service/SpeedTestEngine';
import { INetInfo, IPhaseStats } from './INetInfo';

// 定义一个小的统计结构体
export class PhaseStats implements IPhaseStats {
  public max: number;
  public min: number;
  public avg: number;

  constructor(max: number = 0, min: number = 0, avg: number = 0) {
    this.max = max;
    this.min = min;
    this.avg = avg;
  }
}

export class NetInfoModel implements INetInfo {
  ipAddress: string = '0.0.0.0';
  gateway: string = '0.0.0.0';
  netType: string = '待检测';
  signalLevel: number = 0;
  frequency: number = 0;

  linkDownSpeed: number = 0;
  linkUpSpeed: number = 0;

  downStats: PhaseStats;
  upStats: PhaseStats;

  testPhase: TestPhase = TestPhase.IDLE;
  testProgress: number = 0;
  isCongested: boolean = false;
  hasFinishedTest: boolean = false;

  // 顶层统计字段 (保留用于 Service 逻辑，UI 主要用上面的 PhaseStats)
  lastTestMax: number = 0;
  lastTestMin: number = 0;
  lastTestAvg: number = 0;

  constructor() {
    this.downStats = new PhaseStats(); // 初始化好了
    this.upStats = new PhaseStats();
  }

  clone(): NetInfoModel {
    let target = new NetInfoModel();

    // 基础信息
    target.ipAddress = this.ipAddress;
    target.gateway = this.gateway;
    target.netType = this.netType;
    target.signalLevel = this.signalLevel;
    target.frequency = this.frequency;

    // 瞬时速度
    target.linkDownSpeed = this.linkDownSpeed;
    target.linkUpSpeed = this.linkUpSpeed;

    // 状态
    target.testPhase = this.testPhase;
    target.testProgress = this.testProgress;
    target.isCongested = this.isCongested;
    target.hasFinishedTest = this.hasFinishedTest;

    return target;
  }
}

// 默认值工厂方法
export function createDefaultNetInfo(): NetInfoModel {
  return new NetInfoModel();
}