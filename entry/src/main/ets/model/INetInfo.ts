import { TestPhase } from '../service/SpeedTestEngine';

// 定义纯数据接口
export interface IPhaseStats {
  max: number;
  min: number;
  avg: number;
}

export interface INetInfo {
  ipAddress: string;
  gateway: string;
  netType: string;
  signalLevel: number;
  frequency: number;

  linkDownSpeed: number;
  linkUpSpeed: number;

  // 下载统计
  downMax: number;
  downMin: number;
  downAvg: number;

  // 上传统计
  upMax: number;
  upMin: number;
  upAvg: number;

  testPhase: TestPhase;
  testProgress: number;
  isCongested: boolean;
  hasFinishedTest: boolean;
}