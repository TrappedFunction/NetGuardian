export interface TrafficStats {
  instantKbps: number; // 瞬时速度 (画波形图用)
  maxKbps: number;     // 全局峰值
  minKbps: number;     // 全局谷值 (稳定后)
  avgKbps: number;     // 全局均值 (总流量/总时间)
  jitter: number;      // 抖动
  totalBytes: number;  // 总流量
}

export const analyzeTraffic: (buffer: ArrayBuffer) => TrafficStats;
export const analyzeLength: (byteLength: number) => TrafficStats;
export const resetState: () => void;