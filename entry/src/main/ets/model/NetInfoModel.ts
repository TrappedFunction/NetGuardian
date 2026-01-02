/**
 * 网络基础信息数据模型
 * 使用 interface 定义数据契约
 */

export interface NetInfoModel{
  /**
   * 当前IP地址（IPv4）
   */
  ipAddress: string;

  /**
   * 网络类型 (WiFi / 5G / 4G / None)
   */
  netType: string;

  /**
   * 信号强度 (0-5)
   */
  signalLevel: number;

  /**
   * 上行带宽 (单位: kbps)
   */
  upLinkSpeed: number;

  /**
   * 下行带宽 (单位: kbps)
   */
  downLinkSpeed: number;
}

/**
 * 提供一个默认的空对象，防止 UI 渲染时空指针报错
 */
export function createDefaultNetInfo(): NetInfoModel{
  return {
    ipAddress: '0.0.0.0',
    netType: 'Detecting...',
    signalLevel: 0,
    upLinkSpeed: 0,
    downLinkSpeed: 0
  };
}