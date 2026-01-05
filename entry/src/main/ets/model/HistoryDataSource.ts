import { BasicDataSource } from '../common/utils/BasicDataSource';
import { HistoryRecord } from './HistoryRecord';

/**
 * 历史记录数据源
 * 专门服务于 HistoryComponent 的 LazyForEach
 */
export class HistoryDataSource extends BasicDataSource<HistoryRecord> {
  // 这里可以扩展特定的业务逻辑，比如数据过滤、排序等
  // 目前直接继承基类即可满足需求
}