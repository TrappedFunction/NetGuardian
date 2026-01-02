// 历史记录组件
import Logger from '../common/utils/Logger'

@Component
export struct HistoryComponent{
  build() {
    // 纵向布局
    Column(){
      Text('历史记录 - History')
        .fontSize(30)
        .fontWeight(FontWeight.Bold)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center) // 中心对齐
    .onAppear(() => {
      Logger.info('HistoryComponent onAppear');
    })
  }
}