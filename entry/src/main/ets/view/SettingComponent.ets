// 设置组件
import Logger from '../common/utils/Logger'
import { NetMonitorService, APP_STORAGE_KEY_SPEED_TEST_ENABLED } from '../service/NetMonitorService';

@Component
export struct SettingComponent{
  // 【双向绑定】监听全局 Mock 状态
  // 当 Service 修改状态时，这里会自动变；当这里修改时，AppStorage 也会变
  @StorageLink(APP_STORAGE_KEY_SPEED_TEST_ENABLED) isSpeedTestEnabled: boolean = true;

  build() {
    // 纵向布局
    Column() {
      // 页面标题
      Text('设置 (Settings)')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .fontColor('#182431') // 鸿蒙标准黑
        .width('100%')
        .padding({ left: 24, top: 24, bottom: 12 })

      // 2. 设置列表
      List() {
        // --- 功能控制 ---
        ListItem() {
          this.buildToggleItem(
            '启用主动测速功能',
            '开启后，仪表盘将显示测速入口，允许进行下载和上传吞吐量测试。',
            this.isSpeedTestEnabled,
            (isOn: boolean) => {
              this.handleSwitchChange(isOn);
            }
          )
        }

        // --- 关于应用 ---
        ListItem() {
          this.buildNormalItem('应用版本', 'v0.0.5 (Enterprise)')
        }
        .margin({ top: 12 }) // 分组间距

        ListItem() {
          this.buildNormalItem('开发者', 'TrappedFunction - 韩术')
        }

        ListItem() {
          this.buildNormalItem('技术支持', 'OpenHarmony开源社区')
        }
      }
      .width('100%')
      .layoutWeight(1) // 占满剩余空间
      .padding({ left: 16, right: 16 })
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F1F3F5') // 浅灰背景，突显白色卡片
  }

  /**
   * 统一处理开关切换逻辑
   * 将业务逻辑从 UI 中抽离
   */
  private handleSwitchChange(isOn: boolean) {
    Logger.info('SettingView', `Speed Test Feature toggled: ${isOn}`);
    // 调用 Service 层执行真正的业务切换（如停止后台任务、重置状态等）
    NetMonitorService.getInstance().switchSpeedTestFeature(isOn);
  }

  /**
   * 构建带开关的设置项
   */
  @Builder
  buildToggleItem(title: string, desc: string, isOn: boolean, onChange: (isOn: boolean) => void) {
    Row() {
      // 左侧文本区
      Column() {
        Text(title)
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor('#182431')

        Text(desc)
          .fontSize(13)
          .fontColor('#999999')
          .margin({ top: 6 })
          .lineHeight(18) // 增加行高，提升多行文本可读性
      }
      .layoutWeight(1) // 占据左侧所有空间
      .alignItems(HorizontalAlign.Start)
      .padding({ right: 12 }) // 防止文字贴到开关上

      // 右侧开关
      Toggle({ type: ToggleType.Switch, isOn: isOn })
        .selectedColor('#007DFF') // 激活颜色
        .switchPointColor('#FFFFFF')
        .onChange((value: boolean) => {
          onChange(value);
        })
    }
    .width('100%')
    .padding({ top: 16, bottom: 16, left: 16, right: 16 })
    .backgroundColor(Color.White)
    .borderRadius(16) // 大圆角
    .shadow({ radius: 2, color: '#0D000000', offsetY: 1 }) // 微阴影
  }

  /**
   * 构建普通设置项 (展示用)
   */
  @Builder
  buildNormalItem(title: string, value: string) {
    Row() {
      Text(title)
        .fontSize(16)
        .fontWeight(FontWeight.Regular)
        .fontColor('#182431')

      Blank()

      Text(value)
        .fontSize(14)
        .fontColor('#999999')
    }
    .width('100%')
    .height(56) // 标准列表高度
    .padding({ left: 16, right: 16 })
    .backgroundColor(Color.White)
    .borderRadius(16)
    .margin({ bottom: 8 }) // 项之间的间距
  }
}