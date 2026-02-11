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

  testPhase: TestPhase;
  testProgress: number;
  isCongested: boolean;
  hasFinishedTest: boolean;
}