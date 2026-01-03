/**
 * 单个信息卡片构建器
 * 封装重复的 UI 逻辑
 */
@Component
export  struct InfoItemComponent{
  // 定义接收的参数
  @Prop title: string;
  @Prop value: string; // 接收拼接好的字符串

  build() {
    Column(){
      Text(this.title)
        .fontSize(12)
        .fontColor('#999999')
        .margin({ bottom: 8 })

      Text(this.value)
        .fontSize(16)
        .fontWeight(FontWeight.Medium)
        .fontColor('#333333')
        .maxLines(1) // 防止 IP 过长换行
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(80)
    .backgroundColor(Color.White)
    .borderRadius(12) // 边框半径
    .justifyContent(FlexAlign.Center)
    // 微弱的阴影
    .shadow({ radius: 4, color: '#10000000', offsetY: 2 })
  }

}