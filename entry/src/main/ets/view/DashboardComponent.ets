// 仪表盘组件
import Logger from '../common/utils/Logger'
import { NetInfoModel, DEFAULT_NET_INFO } from '../model/NetInfoModel';
import { APP_STORAGE_KEY_NET_INFO } from '../service/NetMonitorService';
import { InfoItemComponent } from './InfoItemComponent'
import { TrafficWaveComponent } from './TrafficWaveComponent';

@Component
export struct DashboardComponent{
  /**
   * 【核心绑定】
   * @StorageProp: 单向同步。
   * 当 Service 层修改 AppStorage 中的数据时，这里会自动更新。
   * 不需要在 UI 层修改网络数据（网络数据是只读的），所以用 Prop 而不是 Link。
   */
  @StorageProp(APP_STORAGE_KEY_NET_INFO) netInfo: NetInfoModel = DEFAULT_NET_INFO;

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
      // 顶部状态卡片 (Header Card)
      this.buildHeaderCard()

      // 波形图组件
      TrafficWaveComponent()
        .margin({ top: 12 }) // 加点间距

      // 详细数据网格 (Detail Grid)
      Text('详细数据')
        .fontSize(14)
        .fontColor('#999999')
        .width('100%')
        .padding({ left: 16, top: 20, bottom: 8 })
      // 【调试专用】：直接显示数值，排除 Grid 布局导致的刷新问题
      // Text(`Debug Speed: ${this.netInfo.linkDownSpeed}`).fontColor(Color.Red)
      this.buildInfoGrid()

      // 动态告警区域 (Alert Zone)
      // 条件渲染：只有在拥塞时才显示
      if(this.netInfo.isCongested){
        this.buildCongestionAlert()
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F1F3F5') // 浅灰底色，突显卡片白
  }

  /**
   * 构建顶部大卡片
   * 展示：网络类型 + 拥塞状态
   * 根据 isCongested 动态变色
   */
  @Builder
  buildHeaderCard(){
    Column(){
      Row(){
        // 左侧：网络类型
        Column(){
          Text(this.netInfo.netType)
            .fontSize(32)
            .fontWeight(FontWeight.Bolder)
            .fontColor(Color.White)

          Text(this.netInfo.isCongested ? '网络拥塞 (Congested)' : '网络流畅 (Fluid)')
            .fontSize(14)
            .fontColor(Color.White)
            .opacity(0.8) // 稍微透明，通过层次感区分主次
            .margin({top: 4})
        }
        .alignItems(HorizontalAlign.Start)

        Blank() // 撑开空间，把图标挤到右边

        // 右侧：信号图标 (模拟)
        Image($r('app.media.signal'))
          .size({width: 48, height: 48})
          .fillColor(Color.White)
          .opacity(0.5)
      }
      .width('100%')
      .justifyContent(FlexAlign.SpaceBetween)

      // 底部：简单的波浪装饰或频段信息
      Text(this.netInfo.frequency > 0 ? `频段: ${this.netInfo.frequency} MHz` : 'Signal Stable')
        .fontSize(12)
        .fontColor(Color.White)
        .opacity(0.6)
        .margin({top: 24})
        .width('100%')
        .textAlign(TextAlign.End)
    }
    .width('92%') // 左右留白
    .padding(24)
    .borderRadius(20) // 大圆角
    .margin({ top: 16 })
    // 【动态样式】：拥塞变红，流畅变蓝
    .backgroundColor(this.netInfo.isCongested ? '#FF5C5C' : '#007DFF')
    // 添加阴影，增加悬浮感
    .shadow({ radius: 10, color: '#40000000', offsetY: 5 })
    // 增加动画，让颜色切换更平滑
    .animation({ duration: 500, curve: Curve.EaseInOut })
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




  /**
   * 拥塞告警条
   */
  @Builder
  buildCongestionAlert(){
    Row(){
      Image($r('app.media.ic_alert'))
        .size({width: 16, height: 16})
        .fillColor('#D93025')
        .margin({right: 8})

      Text('检测到网络拥塞，建议检查后台下载任务')
        .fontSize(12)
        .fontColor('#D93025')
    }
    .width('92%')
    .padding(12)
    .backgroundColor('#FEEFC3') // 浅黄/浅红背景
    .borderRadius(8)
    .margin({top: 16})
    .justifyContent(FlexAlign.Center)
    // 入场动画：从下往上浮出
    .transition({ type: TransitionType.Insert, translate: { y: 20 }, opacity: 0 })
  }


}