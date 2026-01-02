import { hilog } from '@kit.PerformanceAnalysisKit';

/**
 * 统一日志管理工具类
 */

class Logger{
  private domain: number;
  private prefix: string;
  private format: string = '%{public}s';

  constructor(prefix: string) {
    this.prefix = prefix;
    this.domain = 0xFF00; // 0x0000-0xFFFF 是开发者业务保留段
  }

  debug(...args: any[]): void {
    hilog.debug(this.domain, this.prefix, this.format, this.argsToString(args));
  }

  info(...args: any[]): void {
    hilog.info(this.domain, this.prefix, this.format, this.argsToString(args));
  }

  warn(...args: any[]): void {
    hilog.warn(this.domain, this.prefix, this.format, this.argsToString(args));
  }

  error(...args: any[]): void {
    hilog.error(this.domain, this.prefix, this.format, this.argsToString(args));
  }

  // 将参数数组拼接成字符串
  private argsToString(args: any[]): string {
    // 将所有参数转换为字符串，并用空格连接
    // 例 Logger.info('Index', 'Init') -> "Index Init"
    return args.map((arg) => {
      if (typeof arg === 'object') {
        // 如果是对象，尝试序列化，方便看日志
        return JSON.stringify(arg);
      }
      return String(arg);
    }).join(' ');
  }
}

// 导出单例，全局直接使用 NetGuardianLogger.info(...)
export default new Logger('[NetGuardian]');

