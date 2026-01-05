/**
 * IDataSource 基础封装类
 * 作用：封装监听器管理逻辑，子类只需关注数据本身
 */
export interface DataChangeListener {
  onDataReloaded(): void;
  onDataAdd(index: number): void;
  onDataChange(index: number): void;
  onDataDelete(index: number): void;
  onDataMove(from: number, to: number): void;
}

export interface IDataSource {
  totalCount(): number;
  getData(index: number): any;
  registerDataChangeListener(listener: DataChangeListener): void;
  unregisterDataChangeListener(listener: DataChangeListener): void;
}

export class BasicDataSource<T> implements IDataSource {
  private listeners: DataChangeListener[] = [];
  private originDataArray: T[] = [];

  public totalCount(): number {
    return this.originDataArray.length;
  }

  public getData(index: number): T {
    return this.originDataArray[index];
  }

  // 框架侧调用，注册监听器
  public registerDataChangeListener(listener: DataChangeListener): void {
    if(this.listeners.indexOf(listener) < 0) {
      this.listeners.push(listener);
    }
  }

  // 框架侧调用，注销监听器
  public unregisterDataChangeListener(listener: DataChangeListener): void {
    const pos = this.listeners.indexOf(listener);
    if(pos > 0){
      this.listeners.splice(pos, 1);
    }
  }

  // --- 供子类调用的通知方法 ---
  public notifyDataReload(): void {
    this.listeners.forEach(listener => listener.onDataReloaded());
  }

  public notifyDataAdd(index: number): void {
    this.listeners.forEach(listener => listener.onDataAdd(index));
  }

  public notifyDataChange(index: number): void {
    this.listeners.forEach(listener => listener.onDataChange(index));
  }

  public notifyDataDelete(index: number): void {
    this.listeners.forEach(listener => listener.onDataDelete(index));
  }

  public notifyDataMove(from: number, to: number): void {
    this.listeners.forEach(listener => listener.onDataMove(from, to));
  }

  // --- 数据操作 ---
  public setData(data: T[]) {
    this.originDataArray = data;
    this.notifyDataReload(); // 替换数据后通知 UI 重绘
  }

  public addData(data: T) {
    this.originDataArray.push(data);
    this.notifyDataAdd(this.originDataArray.length - 1);
  }
}