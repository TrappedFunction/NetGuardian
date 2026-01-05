import relationalStore from '@ohos.data.relationalStore';
import Logger from '../utils/Logger';
import { HistoryRecord, HISTORY_TABLE } from '../../model/HistoryRecord';
import common from '@ohos.app.ability.common'; // 引入 Context 类型

export class RdbManager {
  private static instance: RdbManager;
  private rdbStore: relationalStore.RdbStore | null = null;

  // 数据库配置
  private readonly STORE_CONFIG: relationalStore.StoreConfig = {
    name: 'NetGuardian.db', // 数据库文件名
    securityLevel: relationalStore.SecurityLevel.S1 // 安全等级
  };

  private constructor() {}

  public static getInstance(): RdbManager {
    if(!RdbManager.instance){
      RdbManager.instance = new RdbManager();
    }
    return RdbManager.instance;
  }

  /**
   * 初始化数据库 (必须在 Ability onCreate 中调用)
   * @param context 应用上下文
   */
  public async init(context: common.Context): Promise<void> {
    if(this.rdbStore){
      Logger.info('RdbManager', 'Store already initialized');
      return;
    }

    try {
      // 获取 RdbStore 实例
      this.rdbStore = await relationalStore.getRdbStore(context, this.STORE_CONFIG);
      Logger.info('RdbManager', 'Get RdbStore success');

      // 执行建表语句
      // TODO executeSql 可能会抛异常，后续需要配合 version 管理做数据库升级
      if(this.rdbStore){
        await this.rdbStore.executeSql(HISTORY_TABLE.sqlCreate);
        Logger.info('RdbManager', 'Create table success');
      }
    } catch(err) {
      Logger.error('RdbManager', 'Init failed', err);
    }
  }

  /**
   * 插入一条测速记录
   */
  public async insertRecord(record: HistoryRecord): Promise<number> {
    if(!this.rdbStore){
      Logger.error('RdbManager', 'RdbStore is not initialized!');
      return -1;
    }

    try {
      // 组装数据桶 (ValuesBucket)
      const valueBucket: relationalStore.ValuesBucket = {
        [HISTORY_TABLE.columns.TIMESTAMP]: record.timestamp,
        [HISTORY_TABLE.columns.DOWN_SPEED]: record.downSpeed,
        [HISTORY_TABLE.columns.NET_TYPE]: record.netType,
        [HISTORY_TABLE.columns.IS_CONGESTED]: record.isCongested
      };

      // 插入数据
      const rowId = await this.rdbStore.insert(HISTORY_TABLE.tableName, valueBucket);
      Logger.debug('RdbManager', `Insert success, rowId: ${rowId}`);
      return rowId;
    } catch (err) {
      Logger.error('RdbManager', 'Insert failed', err);
      return -1;
    }
  }

  /**
   * 根据条件删除记录
   * @param predicates RdbPredicates 查询条件
   * @returns 删除的行数
   */
  public async deleteRecords(predicates: relationalStore.RdbPredicates): Promise<number> {
    if(!this.rdbStore) {
      Logger.error('RdbManager', 'RdbStore not initialized');
      return -1;
    }

    try {
      const rows = await this.rdbStore.delete(predicates);
      Logger.info('RdbManager', `Deleted ${rows} rows`);
      return rows;
    } catch (err) {
      Logger.error('RdbManager', 'Delete failed', err);
      return -1;
    }
  }

  /**
   * 查询所有记录 (按时间倒序，最新的在前)
   * @param limit 限制条数，默认查最近 50 条
   */
  public async queryHistory(limit: number = 50): Promise<HistoryRecord[]> {
    if(!this.rdbStore) return [];

    const predicates = new relationalStore.RdbPredicates(HISTORY_TABLE.tableName);
    predicates.orderByDesc(HISTORY_TABLE.columns.TIMESTAMP); // 倒序
    predicates.limitAs(limit);

    try {
      const resultSet = await this.rdbStore.query(predicates);
      const result: HistoryRecord[] = [];

      // 遍历游标
      // goToNextRow() 返回 true 表示还有下一行
      while(resultSet.goToNextRow()) {
        const record: HistoryRecord = {
          id: resultSet.getLong(resultSet.getColumnIndex(HISTORY_TABLE.columns.ID)),
          timestamp: resultSet.getLong(resultSet.getColumnIndex(HISTORY_TABLE.columns.TIMESTAMP)),
          downSpeed: resultSet.getDouble(resultSet.getColumnIndex(HISTORY_TABLE.columns.DOWN_SPEED)),
          netType: resultSet.getString(resultSet.getColumnIndex(HISTORY_TABLE.columns.NET_TYPE)),
          isCongested: resultSet.getLong(resultSet.getColumnIndex(HISTORY_TABLE.columns.IS_CONGESTED))
        };
        result.push(record);
      }

      // 关闭结果集，释放内存
      resultSet.close();
      return result;
    } catch (err) {
      Logger.error('RdbManager', 'Query failed', err);
      return [];
    }
  }
}