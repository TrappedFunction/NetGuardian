/**
 * IP 地址处理工具类
 * static 方法设计，无需实例化即可调用
 */
export class IpUtils{
  /**
   * 将 32位整数 IP 转换为点分十进制字符串
   * @param ipInt 例如: 167772162
   * @returns "192.168.0.1"
   */
  public static numberToString(ipInt: number): string {
    if(ipInt <= 0){
      return '0.0.0.0';
    }

    // >>> 无符号右移，& 0xFF 取低8位
    const part1 = (ipInt >>> 24) & 0xFF;
    const part2 = (ipInt >>> 16) & 0xFF;
    const part3 = (ipInt >>> 8) & 0xFF;
    const part4 = ipInt & 0xFF;

    return `${part1}.${part2}.${part3}.${part4}`;
  }

}