#ifndef NET_GUARDIAN_RENDER_MANAGER_H
#define NET_GUARDIAN_RENDER_MANAGER_H

#include <ace/xcomponent/native_interface_xcomponent.h>
#include <cstdint>
#include <napi/native_api.h>
#include <native_window/external_window.h>
#include <string>
#include <vector>
#include <deque>
#include <mutex>
#include <atomic> 

#include <native_drawing/drawing_types.h>
#include <native_drawing/drawing_canvas.h>
#include <native_drawing/drawing_pen.h>
#include <native_drawing/drawing_brush.h>
#include <native_drawing/drawing_path.h>
#include <native_drawing/drawing_color.h>
#include <native_drawing/drawing_bitmap.h>
#include <native_drawing/drawing_shader_effect.h>
#include <native_drawing/drawing_point.h>

class RenderManager {
public:
    static RenderManager* GetInstance();
    
    // 暴露给 NAPI 的初始化接口, 当 ArkTS 调用 XComponentContext.register() 时触发
    void RegisterCallback(OH_NativeXComponent* nativeXComponent);
    
    // 设置组件 ID (用于区分多个 XComponent)
    void SetId(std::string id);
    
    // 数据入口 (生产者调用)
    void PushData(double speedKbps);
    
    // 清空渲染队列
    void ClearData(); 
    
    // 数据快照出口 (消费者/绘图调用), 为了线程安全，不返回引用，而是返回一个拷贝的 vector
    std::vector<double> GetDataSnapshot();
    
public:
    // --- XComponent 生命周期回调 (必须是静态函数以匹配 C 接口) ---
    static void OnSurfaceCreated(OH_NativeXComponent* component, void* window);
    static void OnSurfaceChanged(OH_NativeXComponent* component, void* window);
    static void OnSurfaceDestroyed(OH_NativeXComponent* component, void* window);
    static void OnDispatchTouchEvent(OH_NativeXComponent* component, void* window);
    
private:
    // 执行绘制一帧的核心逻辑
    void DrawFrame();
    
    std::string id_;
    OH_NativeXComponent_Callback callback_; // 保存回调结构体
    OHNativeWindow* nativeWindow_ = nullptr; // 指向屏幕缓冲区的句柄
    OH_NativeXComponent* component_ = nullptr; // 保存组件指针，用于主动请求重绘
    
    // 缓存画布宽高
    uint64_t width_ = 0;
    uint64_t height_ = 0;
    
    std::mutex dataMutex_; // 互斥锁
    std::deque<double> speedHistory_; // 环形缓冲
    const size_t MAX_HISTORY_SIZE = 15; // 屏幕上显示的采样点数量
    std::atomic<bool> isRendering_{false};
};

#endif


