// 设置组件
import Logger from '../common/utils/Logger'

@Component
export struct SettingComponent{
  build() {
    // 纵向布局
    Column(){
      Text('设置 - Setting')
        .fontSize(30)
        .fontWeight(FontWeight.Bold)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center) // 中心对齐
    .onAppear(() => {
      Logger.info('SettingComponent onAppear');
    })
  }
}