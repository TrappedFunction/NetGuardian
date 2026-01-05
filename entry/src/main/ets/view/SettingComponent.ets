// 设置组件
import Logger from '../common/utils/Logger'
import { NetMonitorService, APP_STORAGE_KEY_IS_MOCK } from '../service/NetMonitorService';

@Component
export struct SettingComponent{
  // 【双向绑定】监听全局 Mock 状态
  // 当 Service 修改状态时，这里会自动变；当这里修改时，AppStorage 也会变
  @StorageLink(APP_STORAGE_KEY_IS_MOCK) isMockMode: boolean = true;

  build() {
    // 纵向布局
    Column(){
      Text('设置 (Settings)')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .width('100%')
        .padding({ left: 20, top: 20, bottom: 10 })

      // 设置列表容器
      List(){
        ListItem(){
          this.buildToggleItem(
            '演示模式 (Mock Mode)',
            '开启后使用模拟数据，关闭后消耗真实流量测速',
            this.isMockMode,
            (isOn: boolean) => {
              // 【触发切换】调用 Service 的切换方法
              NetMonitorService.getInstance().switchMode(isOn);
            }
          )
        }

        // 更多设置
        ListItem() {
          this.buildNormalItem('版本号', 'v0.0.3 (Beta)')
        }
      }
      .width('100%')
      .height('100%')
      .padding({ left: 16, right: 16 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F1F3F5')
  }

  /**
   * 构建带开关的设置项
   */
  @Builder
  buildToggleItem(title: string, desc: string, isOn: boolean, onChange: (isOn: boolean) => void) {
    Row(){
      Column(){
        Text(title)
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor('#333333')

        Text(desc)
          .fontSize(12)
          .fontColor('#999999')
          .margin({ top: 4 })
      }
      .layoutWeight(1) // 占据左侧所有空间
      .alignItems(HorizontalAlign.Start)

      // 开关组件
      Toggle({type: ToggleType.Switch, isOn: isOn})
        .selectedColor('#007DFF')
        .switchPointColor('#FFFFFF')
        .onChange((value: boolean) => {
          onChange(value);
        })
    }
    .width('100%')
    .padding(16)
    .backgroundColor(Color.White)
    .borderRadius(12)
    .margin({ bottom: 12 })
    .shadow({ radius: 4, color: '#10000000', offsetY: 1 })
  }

  /**
   * 构建普通设置项 (展示用)
   */
  @Builder
  buildNormalItem(title: string, value: string){
    Row(){
      Text(title)
        .fontSize(16)
        .fontColor('#333333')

      Blank()

      Text(value)
        .fontSize(14)
        .fontColor('#999999')
    }
    .width('100%')
    .padding(16)
    .backgroundColor(Color.White)
    .borderRadius(12)
    .margin({ bottom: 12 })
  }
}