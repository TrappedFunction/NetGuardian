import { HistoryRecord, HISTORY_TABLE  } from '../model/HistoryRecord';
import { RdbManager } from '../common/database/RdbManager';
import { HistoryDataSource } from '../model/HistoryDataSource';
import { DateUtils } from '../common/utils/DateUtils';
import Logger from '../common/utils/Logger';
import relationalStore from '@ohos.data.relationalStore';
import { ClearHistoryDialog } from './ClearHistoryDialog';

@Component
export struct HistoryComponent {
  // 使用自定义的 DataSource
  @State dataSource: HistoryDataSource = new HistoryDataSource();
  @State isLoading: boolean = false;
  @State isEmpty: boolean = true;
  @Prop @Watch('onTabSelected') isSelected: boolean;

  // 实例化自定义弹窗控制器
  dialogController: CustomDialogController = new CustomDialogController({
    builder: ClearHistoryDialog({
      onConfirm: (type: number) => {
        // 接收弹窗传回来的 type，执行删除逻辑
        this.deleteHistory(type);
      }
    }),
    alignment: DialogAlignment.Bottom, // 底部弹出
    offset: { dx: 0, dy: -20 },
    customStyle: true, // 自定义样式(去掉了默认的方框背景)
    autoCancel: true
  });

  /**
   * 刷新机制
   * 当组件显示时 (Tab 切换过来时)，自动查询数据库
   */
  aboutToAppear() {
    this.loadHistoryData();
  }

  /**
   * 从数据库加载数据
   */
  async loadHistoryData() {
    this.isLoading = true;
    try {
      // 查询最近 100 条
      const records = await RdbManager.getInstance().queryHistory(100);

      if (records.length > 0) {
        this.dataSource.setData(records); // 更新数据源
        this.isEmpty = false;
      } else {
        this.dataSource.setData([]);
        this.isEmpty = true;
      }
      Logger.info('History', `Loaded ${records.length} records`);
    } catch (e) {
      Logger.error('History', 'Load failed', e);
    } finally {
      this.isLoading = false;
    }
  }

  build() {
    Column() {
      // 标题栏 + 手动刷新按钮
      Row() {
        Text('历史记录 (History)')
          .fontSize(20)
          .fontWeight(FontWeight.Bold)

        Blank()

        Button({ type: ButtonType.Circle, stateEffect: true}) {
          Image($r('app.media.ic_delete'))
            .size({width: 20, height: 20})
            .fillColor(Color.White)
        }
        .width(36)
        .height(36)
        .margin({ right: 8 }) // 和刷新按钮隔开一点
        .backgroundColor('#FF5C5C') // 红色背景示警
        .onClick(() => {
          this.dialogController.open();
        })

        // 刷新按钮
        Button({ type: ButtonType.Circle, stateEffect: true }) {
          Image($r('app.media.ic_refresh'))
            .size({ width: 20, height: 20 })
            .fillColor(Color.White)
        }
        .width(36)
        .height(36)
        .onClick(() => {
          this.loadHistoryData(); // 点击手动刷新
        })
      }
      .width('100%')
      .padding(16)
      .backgroundColor(Color.White)

      // 核心内容区
      if (this.isLoading) {
        // 加载中状态
        LoadingProgress()
          .width(50)
          .height(50)
          .margin({ top: 100 })
      } else if (this.isEmpty) {
        // 空状态 (Empty State) - 提升 UX 的关键
        this.buildEmptyView()
      } else {
        // 使用 List + LazyForEach
        List({ space: 10 }) {
          LazyForEach(this.dataSource, (item: HistoryRecord) => {
            ListItem() {
              this.buildHistoryItem(item)
            }
          }, (item: HistoryRecord) => item.id?.toString() || JSON.stringify(item)) // 键值生成器
        }
        .width('100%')
        .layoutWeight(1) // 占满剩余空间
        .padding({ left: 16, right: 16, bottom: 16 })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F1F3F5')
  }

  /**
   * 构建单条记录 UI
   */
  @Builder
  buildHistoryItem(item: HistoryRecord) {
    Row() {
      // 左侧：时间与类型
      Column() {
        Text(DateUtils.format(item.timestamp))
          .fontSize(14)
          .fontColor('#333333')

        Row() {
          Text(item.netType)
            .fontSize(12)
            .fontColor('#999999')
            .margin({ right: 8 })

          // 拥塞标记
          if (item.isCongested === 1) {
            Text('拥塞')
              .fontSize(10)
              .fontColor(Color.White)
              .backgroundColor('#FF5C5C')
              .padding({ left: 4, right: 4, top: 2, bottom: 2 })
              .borderRadius(4)
          }
        }
        .margin({ top: 4 })
      }
      .alignItems(HorizontalAlign.Start)

      Blank()

      // 右侧：网速
      Column() {
        Text(`${(item.downSpeed / 1024).toFixed(1)}`) // 转换为 Mbps
          .fontSize(20)
          .fontWeight(FontWeight.Bold)
          .fontColor('#007DFF')

        Text('Mbps')
          .fontSize(10)
          .fontColor('#999999')
      }
      .alignItems(HorizontalAlign.End)
    }
    .width('100%')
    .padding(16)
    .backgroundColor(Color.White)
    .borderRadius(12)
    .shadow({ radius: 2, color: '#10000000', offsetY: 1 })
  }

  /**
   * 构建空状态视图
   */
  @Builder
  buildEmptyView() {
    Column() {
      // 这里可以用一个灰色的图标
      Image($r('app.media.ic_tab_history'))
        .size({ width: 80, height: 80 })
        .fillColor('#DDDDDD')
        .margin({ top: 100 })

      Text('暂无测速记录')
        .fontSize(14)
        .fontColor('#999999')
        .margin({ top: 16 })

      Text('去首页跑个分吧~')
        .fontSize(12)
        .fontColor('#BBBBBB')
        .margin({ top: 8 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
  }

  /**
   * 执行删除逻辑
   * @param type 删除类型枚举
   */
  async deleteHistory(type: number){
    const now = new Date().getTime();
    let startTime = 0;

    // 构建查询谓词
    const predicates = new relationalStore.RdbPredicates(HISTORY_TABLE.tableName);

    // 时间计算逻辑
    switch (type) {
      case 1: // 最近 1 小时
        startTime = now - 60 * 60 * 1000;
        predicates.greaterThanOrEqualTo(HISTORY_TABLE.columns.TIMESTAMP, startTime);
        break;
      case 2: // 最近 1 天
        startTime = now - 24 * 60 * 60 * 1000;
        predicates.greaterThanOrEqualTo(HISTORY_TABLE.columns.TIMESTAMP, startTime);
        break;
      case 3: // 最近 1 周
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        predicates.greaterThanOrEqualTo(HISTORY_TABLE.columns.TIMESTAMP, startTime);
        break;
      case 4: // 最近 1 个月 (按30天算)
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        predicates.greaterThanOrEqualTo(HISTORY_TABLE.columns.TIMESTAMP, startTime);
        break;
      case 5: // 最近 6 个月
        startTime = now - 180 * 24 * 60 * 60 * 1000;
        predicates.greaterThanOrEqualTo(HISTORY_TABLE.columns.TIMESTAMP, startTime);
        break;
      case 6: // 最近 1 年
        startTime = now - 365 * 24 * 60 * 60 * 1000;
        predicates.greaterThanOrEqualTo(HISTORY_TABLE.columns.TIMESTAMP, startTime);
        break;
    }

    // 调用DB删除
    this.isLoading = true;
    try {
      const deletedRows = await RdbManager.getInstance().deleteRecords(predicates);

      // 提示用户
      this.getUIContext().getPromptAction().showToast({
        message: `成功清理 ${deletedRows} 条记录`,
        duration: 2000
      });

      // 刷新列表
      this.loadHistoryData();

    } catch (e) {
      Logger.error('History', 'Delete failed', e);
      this.getUIContext().getPromptAction().showToast({ message: '清理失败' });
    } finally {
      this.isLoading = false;
    }
  }

  // 监听回调
  onTabSelected() {
    // 只有当变为 true (被选中) 时，才刷新数据
    if (this.isSelected) {
      Logger.info('History', 'Tab selected, auto refreshing...');
      this.loadHistoryData();
    }
  }
}