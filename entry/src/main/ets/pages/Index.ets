import { DashboardComponent } from '../view/DashboardComponent';
import { HistoryComponent } from '../view/HistoryComponent';
import { SettingComponent } from '../view/SettingComponent';
import Logger from '../common/utils/Logger';

@Entry
@Component
struct Index {
  // 控制当前 Tab 的索引
  @State currentIndex: number = 0;
  private controller: TabsController = new TabsController();
  private selectedImgs: Resource[] = []
  // 资源预加载
  aboutToAppear() {
    this.selectedImgs = [
      $r('app.media.ic_tab_monitor'),
      $r('app.media.ic_tab_history'),
      $r('app.media.ic_tab_settings')
    ]
  }

  build() {
    Column() {
      // Tabs 组件：鸿蒙标准的导航容器
      Tabs({ barPosition: BarPosition.End, controller: this.controller}) {
        // Tab1：监控
        TabContent(){
          DashboardComponent()
        }

        // Tab 2: 历史
        TabContent() {
          HistoryComponent()
        }

        // Tab 3: 设置
        TabContent() {
          SettingComponent()
        }
      }
      .vertical(false)
      .scrollable(false) // 禁止左右滑动切换，防止误触
      .layoutWeight(1) // 让Tabs占据除了底部栏以外的所有空间
      .barHeight(0) // 隐藏Tabs自带的导航栏
      .onChange((index: number) => {
        this.currentIndex = index;
      })

      // 自定义底部导航栏
      Row(){
        // 监控
        this.CustomTabBuilder('仪表盘', 0, this.selectedImgs[0])

        // 历史
        this.CustomTabBuilder('历史记录', 1, this.selectedImgs[1])

        // 设置
        this.CustomTabBuilder('设置', 2, this.selectedImgs[2])
      }
      .width('100%')
      .height(56) // 标准底部栏高度
      .backgroundColor('#FFFFFF') // 背景色
      .border({ width: { top: 1 }, color: '#E3E3E3' }) // 顶部分割线

    }
    .height('100%')
    .width('100%')
  }

  // 自定义 TabBar 样式构建函数
  // @Builder 装饰器：用于定义UI片段，类似 React 的 render func
  @Builder CustomTabBuilder(title: string, targetIndex: number, selectedImg: Resource){
    Column(){
      Image(selectedImg)
        .size({width: 24, height: 24})
        // 根据选中状态改变颜色 (灰色 vs 蓝色)
        .fillColor(this.currentIndex === targetIndex ? '#007DFF' : '#999999')
      Text(title)
        .fontColor(this.currentIndex === targetIndex ? '#007DFF' : '#999999')
        .fontSize(10)
        .margin({top: 4})
    }
    .width('100%')
    .height(60)
    .height('100%')
    .layoutWeight(1) // 三个按钮平分宽度
    .justifyContent(FlexAlign.Center)
    .onClick(() => {
      // 立即更新状态，UI瞬间变色
      this.currentIndex = targetIndex;

      // 命令Controller切换页面
      this.controller.changeIndex(targetIndex);

      Logger.info(`CustomTab switched to index: ${targetIndex}`);
    })
  }
}