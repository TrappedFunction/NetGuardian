/**
 * 网络基础信息数据模型
 * 作为 Service 层向 UI 层传输数据的标准契约 (DTO)
 */
import { TestPhase } from '../service/SpeedTestEngine';

// 定义一个小的统计结构体
@Observed
export class PhaseStats {
  public max: number;
  public min: number;
  public avg: number;

  constructor(max: number = 0, min: number = 0, avg: number = 0) {
    this.max = max;
    this.min = min;
    this.avg = avg;
  }
}

@Observed
export class NetInfoModel{
  /**
   * 当前IP地址（IPv4）
   */
  ipAddress: string;

  /** 网关地址 (例如: 192.168.1.1) */
  gateway: string;

  /**
   * 网络类型 (WiFi / 5G / 4G / None)
   */
  netType: string;

  /**
   * 信号强度 (0-5)
   */
  signalLevel: number;

  /** 频段 (仅WiFi有效, 单位MHz, 5800 代表 5.8G) */
  frequency: number;

  /** 下行链路带宽 (单位: kbps) */
  linkDownSpeed: number;

  /** 上行链路带宽 (单位: kbps) */
  linkUpSpeed: number;

  downStats: PhaseStats; // 下载统计
  upStats: PhaseStats;   // 上传统计

  // --- 测速状态控制 ---
  testPhase: TestPhase; // 当前阶段
  testProgress: number; // 当前阶段进度 (0-100)
  isCongested: boolean; // 是否拥塞

  // 标记是否完成过一次完整的测速 (用于控制报告卡片的显示)
  hasFinishedTest: boolean;
}

/**
 * 提供一个默认的空对象，UI 初始化时的占位符，防止页面渲染出现 undefined 报错
 */
export const DEFAULT_NET_INFO: NetInfoModel = {
  ipAddress: '0.0.0.0',
  gateway: '0.0.0.0',
  netType: '待检测',
  signalLevel: 0,
  frequency: 0,
  linkDownSpeed: 0,
  linkUpSpeed: 0,
  downStats: { max: 0, min: 0, avg: 0 },
  upStats: { max: 0, min: 0, avg: 0 },
  testPhase: TestPhase.IDLE, // 默认空闲
  testProgress: 0,
  isCongested: false,
  hasFinishedTest: false
};