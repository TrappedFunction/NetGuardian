import { createDefaultNetInfo, NetInfoModel } from '../model/NetInfoModel';
import { APP_STORAGE_KEY_NET_INFO } from '../service/NetMonitorService';
import { TestPhase } from '../service/SpeedTestEngine';
import Logger from '../common/utils/Logger';
import nativeGuardian from 'libnet_guardian.so';

@Component
export struct TrafficWaveComponent{
  // 订阅网络数据
  @StorageLink(APP_STORAGE_KEY_NET_INFO) netInfo: NetInfoModel = createDefaultNetInfo();

  // Canvas 上下文配置
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  // 数据队列配置
  private readonly MAX_POINTS = 30; // 屏幕上显示多少个点
  private dataQueue: number[] = [];

  // 布局尺寸 (会在 onAreaChange 中更新真实尺寸)
  @State canvasWidth: number = 0;
  @State canvasHeight: number = 0;

  // 监听 netInfo 变化，驱动重绘
  // @Watch 装饰器：当 netInfo 变化时，执行 onDataUpdate 方法
  @StorageProp(APP_STORAGE_KEY_NET_INFO) @Watch('onDataUpdate') watchedNetInfo: NetInfoModel = createDefaultNetInfo();

  aboutToAppear(): void {
    // 初始化队列，填满 0，防止刚开始画不出线
    for(let i = 0; i < this.MAX_POINTS; i++){
      this.dataQueue.push(0);
    }
  }

  /**
   * 数据更新回调
   * 逻辑：入队 -> 出队 -> 触发重绘
   */
  onDataUpdate(){
    let speed = 0;

    // 根据阶段选择数据源
    if (this.watchedNetInfo.testPhase === TestPhase.UPLOAD) {
      speed = this.watchedNetInfo.linkUpSpeed;
    } else {
      // IDLE 或 DOWNLOAD 都显示下行
      speed = this.watchedNetInfo.linkDownSpeed;
    }

    // 2. 更新队列 (FIFO)
    this.dataQueue.push(speed);
    if(this.dataQueue.length > this.MAX_POINTS){
      this.dataQueue.shift();
    }

    // 3. 触发绘制
    this.drawWave();
  }

  /**
   * 核心绘制逻辑
   */
  drawWave(){
    // 判空保护
    if(!this.context || this.canvasWidth === 0 || this.canvasHeight === 0) return;

    const ctx = this.context;
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const len = this.dataQueue.length;

    // 1. 清空画布
    ctx.clearRect(0, 0, width, height);

    // 2. 计算Y轴缩放比例 (动态范围)
    // 找出当前队列里的最大值，作为 Y 轴的顶
    // 为了防止波动太大，设置一个最小高度 (2000kbps)
    let maxVal = Math.max(...this.dataQueue);
    if(maxVal < 2000) maxVal = 2000;
    // 留一点顶部余量 (paddingTop)
    maxVal = maxVal * 1.2;

    // 3. 开始绘制路径
    ctx.beginPath();
    // 移动到左下角起点
    ctx.moveTo(0,height);

    // 遍历数据点
    for(let i = 0; i < len; i++){
      const val = this.dataQueue[i];

      // X轴坐标: 等分宽度
      const x = (i / (this.MAX_POINTS - 1)) * width;

      // Y轴坐标: 数值越大，Y越小 (Canvas坐标系原点在左上角)
      // height - (val / maxVal) * height
      const y = height - (val / maxVal) * height;

      ctx.lineTo(x, y);
    }

    // 闭合路径到右下角，形成封闭区域以便填充
    ctx.lineTo(width, height);
    ctx.closePath();

    // 4. 设置渐变填充
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    // 顶部颜色 (半透明蓝/红，取决于是否拥塞)
    const topColor = this.watchedNetInfo.isCongested ? 'rgba(255, 92, 92, 0.6)' : 'rgba(0, 125, 255, 0.6)';
    // 底部颜色 (完全透明)
    const bottomColor = this.watchedNetInfo.isCongested ? 'rgba(255, 92, 92, 0.0)' : 'rgba(0, 125, 255, 0.0)';

    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fill();

    // 5. 绘制顶部的描边线 (让轮廓更清晰)
    // 需要重新 beginPath，因为上面 fill 了一个封闭区域
    ctx.beginPath();
    for(let i = 0; i < len; i++){
      const val = this.dataQueue[i];
      const x = (i / (this.MAX_POINTS - 1)) * width;
      const y = height - (val / maxVal) * height;
      if(i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.watchedNetInfo.isCongested ? '#FF5C5C' : '#007DFF';
    ctx.stroke();
  }

  build() {
    Column(){
      // 标题
      Text('实时流量监控 (Real-time Traffic)')
        .fontSize(12)
        .fontColor('#999999')
        .width('100%')
        .margin({bottom: 8})

      // 画布容器
      XComponent({
        id: 'NetGuardian_Waveform',
        type: XComponentType.SURFACE, // 必须是 SURFACE，表示独占一块缓冲区
        libraryname: 'net_guardian' // 对应 libnet_guardian.so (去掉lib和.so)
      })
        .width('100%')
        .height(120)
        .borderRadius(12)
        .onLoad((context) => {
          Logger.info('Wave', 'XComponent onLoad: Surface creation triggered internally');
        })
        .onDestroy(() => {
          Logger.info('Wave', 'XComponent onDestroy');
        })
    }
    .padding({ left: 16, right: 16, top: 10 })
  }
}