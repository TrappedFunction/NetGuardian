/**
 * 网络基础信息数据模型
 * 作为 Service 层向 UI 层传输数据的标准契约 (DTO)
 */

export interface NetInfoModel{
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

  /**
   * [业务字段] 是否拥塞
   * 当带宽/延迟达到阈值时置为 true
   */
  isCongested: boolean;
}

/**
 * 提供一个默认的空对象，UI 初始化时的占位符，防止页面渲染出现 undefined 报错
 */
export const DEFAULT_NET_INFO: NetInfoModel = {
  ipAddress: '0.0.0.0',
  gateway: '0.0.0.0',
  netType: '初始化中...',
  signalLevel: 0,
  frequency: 0,
  linkDownSpeed: 0,
  linkUpSpeed: 0,
  isCongested: false
};