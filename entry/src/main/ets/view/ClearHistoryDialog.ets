interface OptionItem {
  type: number;
  label: string;
}

@CustomDialog
export struct ClearHistoryDialog {
  // 弹窗控制器，由系统自动注入
  controller: CustomDialogController;
  // 回调函数，把用户的选择传出去
  onConfirm!: (type: number) => void;





  // 选项配置
  private options: OptionItem[] = [
    { type: 1, label: '最近1小时' },
    { type: 2, label: '最近1天' },
    { type: 3, label: '最近1周' },
    { type: 4, label: '最近1月' },
    { type: 5, label: '最近半年' },
    { type: 6, label: '最近1年' },
  ];

  build() {
    Column() {
      // 1. 标题区
      Text('清理历史记录')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
        .margin({ top: 24, bottom: 6 })

      Text('删除后无法恢复，请谨慎操作')
        .fontSize(14)
        .fontColor('#FF5C5C') // 警示色
        .margin({ bottom: 24 })

      // 2. 选项网格区
      Grid() {
        ForEach(this.options, (item: OptionItem) => {
          GridItem() {
            Text(item.label)
              .fontSize(14)
              .fontColor('#333333')
              .width('100%')
              .height(40)
              .textAlign(TextAlign.Center)
              .backgroundColor('#F5F5F5')
              .borderRadius(20)
              .onClick(() => {
                // 点击即选中，关闭弹窗并回调
                this.onConfirm(item.type);
                this.controller.close();
              })
          }
        })
      }
      .columnsTemplate('1fr 1fr') // 两列
      .rowsGap(12)
      .columnsGap(12)
      .height(200) // 网格高度
      .width('100%')
      .padding({ left: 16, right: 16 })

      // 3. 取消按钮
      Button('取消')
        .fontColor('#666666')
        .backgroundColor(Color.Transparent)
        .width('100%')
        .margin({ top: 16, bottom: 16 })
        .onClick(() => {
          this.controller.close();
        })
    }
    .backgroundColor(Color.White)
    .borderRadius(24)
    .width('90%') // 弹窗宽度
  }
}