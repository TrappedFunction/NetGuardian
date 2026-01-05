/**
 * 历史记录实体类
 * 对应数据库中的一条记录
 */
export interface HistoryRecord {
  /** 主键 ID (自增) */
  id?: number;

  /** 记录时间戳 (存毫秒级 Number) */
  timestamp: number;

  /** 下行速度 (kbps) */
  downSpeed: number;

  /** 网络类型 (WIFI/5G) */
  netType: string;

  /** 拥塞标识 (0:流杨, 1:拥塞) - SQLite 没有 boolean，通常用 0/1 表示 */
  isCongested: number;
}

/**
 * 数据库常量定义
 */
export const HISTORY_TABLE = {
  tableName: 'net_history',
  columns: {
    ID: 'id',
    TIMESTAMP: 'timestamp',
    DOWN_SPEED: 'down_speed',
    NET_TYPE: 'net_type',
    IS_CONGESTED: 'is_congested'
  },
  // 建表 SQL 语句
  sqlCreate: `CREATE TABLE IF NOT EXISTS net_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    down_speed INTEGER,
    net_type TEXT,
    is_congested INTEGER
  )`
}