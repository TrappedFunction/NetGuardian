// 仪表盘组件
import Logger from '../common/utils/Logger'
import { NetInfoModel, DEFAULT_NET_INFO, PhaseStats } from '../model/NetInfoModel';
import {
  APP_STORAGE_KEY_NET_INFO,
  APP_STORAGE_KEY_SPEED_TEST_ENABLED } from '../service/NetMonitorService';
import { InfoItemComponent } from './InfoItemComponent'
import { TrafficWaveComponent } from './TrafficWaveComponent';
import { NetMonitorService } from '../service/NetMonitorService';
import { TestPhase } from '../service/SpeedTestEngine';

@Component
export struct DashboardComponent{
  /**
   * 【核心绑定】
   * @StorageProp: 单向同步。
   * 当 Service 层修改 AppStorage 中的数据时，这里会自动更新。
   * 不需要在 UI 层修改网络数据（网络数据是只读的），所以用 Prop 而不是 Link。
   */
  @StorageProp(APP_STORAGE_KEY_NET_INFO) netInfo: NetInfoModel = DEFAULT_NET_INFO;

  // 监听功能开关 (是否显示测速入口)
  @StorageProp(APP_STORAGE_KEY_SPEED_TEST_ENABLED) isSpeedTestEnabled: boolean = true;

  /**
   * 页面显示时的生命周期
   * 用于调试，确认组件被正确加载
   */
  aboutToAppear(): void {
    Logger.info('DashboardView', 'Component initialized, waiting for data...');
  }

  build() {
    // 纵向布局
    Column(){
      Scroll(){ //以此包裹，防止小屏幕内容溢出
        Column(){
          // 顶部状态卡片 (Header Card)
          this.buildHeaderCard()

          // 测速控制区域 (核心交互区)
          if (this.isSpeedTestEnabled) {
            this.buildSpeedControlArea()
          }

          // 统计报告卡片 (只有测过才有数据)
          if (this.netInfo.testPhase !== TestPhase.IDLE || this.netInfo.hasFinishedTest) {
            this.buildFullReportCard(this.netInfo.downStats, this.netInfo.upStats)
          }

          // 详细数据网格 (Detail Grid)
          Text('详细数据')
            .fontSize(14)
            .fontColor('#999999')
            .width('100%')
            .padding({ left: 16, top: 20, bottom: 8 })

          this.buildInfoGrid()
        }
        .padding({ bottom: 20 })
      }
      .scrollBar(BarState.Off)
      .width('100%')
      .height('100%')
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F1F3F5') // 浅灰底色，突显卡片白
  }

  /**
   * 辅助方法：获取主标题文字
   */
  private getStatusText(): string {
    switch (this.netInfo.testPhase) {
      case TestPhase.IDLE:
        return this.netInfo.netType;
      case TestPhase.DOWNLOAD:
        return '下载测试中...';
      case TestPhase.UPLOAD:
        return '上传测试中...';
      case TestPhase.FINISHED:
        return '测速完成';
      default:
        return '待检测';
    }
  }

  /**
   * 辅助方法：获取副标题文字
   */
  private getSubText(): string {
    // 拥塞覆盖逻辑
    if (this.netInfo.isCongested && this.netInfo.testPhase !== TestPhase.UPLOAD) {
      return '检测到网络拥塞';
    }

    switch (this.netInfo.testPhase) {
      case TestPhase.IDLE:
        return '系统就绪';

      case TestPhase.DOWNLOAD:
        // 【修复】：引用 linkDownSpeed
        return `下载瞬时: ${this.netInfo.linkDownSpeed} kbps`;

      case TestPhase.UPLOAD:
        // 【修复】：引用 linkUpSpeed
        return `上传瞬时: ${this.netInfo.linkUpSpeed} kbps`;

      case TestPhase.FINISHED:
        // 【修复】：引用 downStats.avg (以所测下载均值为准)
        return `平均下载: ${this.netInfo.downStats.avg} kbps`;

      default:
        return '等待测速';
    }
  }

  /**
   * 辅助方法：获取卡片背景颜色
   */
  private getCardColor(): string {
    // 拥塞覆盖逻辑
    if (this.netInfo.isCongested && this.netInfo.testPhase !== TestPhase.UPLOAD) {
      return '#FF5C5C'; // 红色
    }

    switch (this.netInfo.testPhase) {
      case TestPhase.DOWNLOAD:
        return '#00C853'; // 绿色
      case TestPhase.UPLOAD:
        return '#6200EA'; // 紫色
      default:
        return '#007DFF'; // 默认蓝 (IDLE / FINISHED)
    }
  }

  /**
   * 构建顶部大卡片
   * 展示：网络类型 + 拥塞状态
   * 根据 isCongested 动态变色
   */
  @Builder
  buildHeaderCard() {
    Column() {
      Row() {
        Column() {
          Text(this.getStatusText())
            .fontSize(28)
            .fontWeight(FontWeight.Bolder)
            .fontColor(Color.White)

          Text(this.getSubText())
            .fontSize(14)
            .fontColor(Color.White)
            .opacity(0.8)
            .margin({ top: 4 })
        }
        .alignItems(HorizontalAlign.Start)

        Blank()

        Image($r('app.media.ic_tab_monitor'))
          .size({ width: 48, height: 48 })
          .fillColor(Color.White)
          .opacity(0.5)
      }
      .width('100%')
      .justifyContent(FlexAlign.SpaceBetween)

      // 进度条 (仅在测速时显示)
      if (this.netInfo.testPhase === TestPhase.DOWNLOAD || this.netInfo.testPhase === TestPhase.UPLOAD) {
        Progress({ value: this.netInfo.testProgress, total: 100, type: ProgressType.Linear })
          .color(Color.White)
          .style({ strokeWidth: 4 })
          .margin({ top: 20 })
      }
    }
    .width('92%')
    .padding(24)
    .borderRadius(20)
    .margin({ top: 16 })
    .backgroundColor(this.getCardColor())
    .shadow({ radius: 10, color: '#40000000', offsetY: 5 })
    .animation({ duration: 300 }) // 颜色切换动画
  }

  /**
   * 测速控制区：按钮 vs 波形图
   */
  @Builder
  buildSpeedControlArea() {
    Column() {
      // 如果正在测速，显示波形图；否则显示开始按钮
      if (this.netInfo.testPhase === TestPhase.DOWNLOAD || this.netInfo.testPhase === TestPhase.UPLOAD) {

        // 1. 波形图组件
        TrafficWaveComponent()
          .margin({ top: 16 })

        // 2. 阶段提示
        Text(this.netInfo.testPhase === TestPhase.DOWNLOAD ? 'Downloading Data...' : 'Uploading Data...')
          .fontSize(12)
          .fontColor('#999999')
          .margin({ top: 8 })

      } else {
        // 空闲或结束状态 -> 显示按钮
        Button('开始测速')
          .width('60%')
          .height(48)
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .backgroundColor(Color.White)
          .fontColor('#007DFF')
          .border({ width: 1, color: '#007DFF' })
          .margin({ top: 30, bottom: 10 })
          .shadow({ radius: 4, color: '#10000000', offsetY: 2 })
          .onClick(() => {
            // 调用 Service 开始测速
            NetMonitorService.getInstance().startOneTimeTest();
          })
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
    // 加上 transition 动画，让按钮和波形图切换时更自然
    .animation({ duration: 300, curve: Curve.EaseInOut })
  }

  /**
   * 统计报告卡片 (Max/Min/Avg)
   */
  @Builder
  buildFullReportCard(downStats: PhaseStats, upStats: PhaseStats) {
    Column() {
      Text('本轮测速报告 (Detailed Report)')
        .fontSize(14)
        .fontWeight(FontWeight.Bold)
        .fontColor('#182431')
        .margin({ bottom: 16 }) // 增加间距
        .width('100%')

      Row() {
        // 左列：下载数据 (绿色)
        this.buildStatColumn('下载 (Download)', downStats, '#00C853')

        // 中间分割线
        Divider()
          .vertical(true)
          .height(50) // 调整高度适配内容
          .color('#E0E0E0')

        // 右列：上传数据 (紫色)
        this.buildStatColumn('上传 (Upload)', upStats, '#6200EA')
      }
      .width('100%')
      .justifyContent(FlexAlign.SpaceEvenly) // 均匀分布
    }
    .width('92%')
    .padding(16)
    .backgroundColor(Color.White)
    .borderRadius(16)
    .margin({ top: 16 })
    .shadow({ radius: 8, color: '#0D000000', offsetY: 2 })
  }

  @Builder
  buildStatColumn(title: string, stats: PhaseStats, color: string) {
    Column() {
      // 标题
      Text(title)
        .fontSize(14)
        .fontColor(color)
        .fontWeight(FontWeight.Bold)
        .margin({ bottom: 12 })

      // 详细数据行
      // 这里直接传 stats 对象里的具体数值，确保值是基本类型，容易触发更新
      this.buildMiniRow('最高', stats.max, color)
      this.buildMiniRow('平均', stats.avg, color)
      this.buildMiniRow('最低', stats.min, color)
    }
    .width('40%') // 限制宽度
  }

  @Builder
  buildMiniRow(label: string, value: number, color: string) {
    Row() {
      Text(label)
        .fontSize(12)
        .fontColor('#999999')

      Blank()

      // 拼接单位 kbps
      Text(`${value}`)
        .fontSize(14)
        .fontWeight(FontWeight.Bolder)
        .fontColor('#182431')

      Text(' kbps')
        .fontSize(10)
        .fontColor('#999999')
        .margin({ left: 2, top: 2 }) // 微调对齐
    }
    .width('100%')
    .margin({ bottom: 6 }) // 行间距
    .alignItems(VerticalAlign.Bottom) // 底部对齐
  }

  /**
   * 构建详细信息网格
   * 展示：IP, 网关, 上下行速率
   */
  @Builder
  buildInfoGrid(){
    Grid(){
      // 使用 GridItem 封装每个数据块
      GridItem() {
        InfoItemComponent({
          title: 'IP 地址',
          value: this.netInfo.ipAddress
        })
      }
      GridItem() {
        InfoItemComponent({
          title: '默认网关',
          value: this.netInfo.gateway
        })
      }
      GridItem() {
        InfoItemComponent({
          title: '下行速率',
          value: `${this.netInfo.linkDownSpeed} kbps`
        })
      }
      GridItem() {
        InfoItemComponent({
          title: '上行速率',
          value: `${this.netInfo.linkUpSpeed} kbps`
        })
      }
    }
    .columnsTemplate('1fr 1fr') // 两列等宽
    .rowsGap(12)
    .columnsGap(12)
    .padding({ left: 16, right: 16 })
    .height(180) // 固定高度，防止被内容撑乱
  }

}