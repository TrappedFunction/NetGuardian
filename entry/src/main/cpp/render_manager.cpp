#include "render_manager.h"
#include <cstdint>
#include <hilog/log.h>
#include <algorithm>
#include <string.h>
#include <native_buffer/native_buffer.h>
#include <sys/mman.h>
#include <unistd.h>

#undef LOG_TAG
#define LOG_TAG "NativeRender"
#define LOG_DOMAIN 0x001
#define OH_LOG_INFO(fmt, ...) ((void)OH_LOG_Print(LOG_APP, LOG_INFO, LOG_DOMAIN, LOG_TAG, fmt, ##__VA_ARGS__))
#define OH_LOG_ERROR(fmt, ...) ((void)OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, fmt, ##__VA_ARGS__))

static RenderManager g_instance;

RenderManager *RenderManager::GetInstance() {
    return &g_instance;
}

void RenderManager::SetId(std::string id) {
    id_ = id;
}

void RenderManager::PushData(double speedKbps) {
    // 加锁保护
    {
        std::lock_guard<std::mutex> lock(dataMutex_);
        speedHistory_.push_back(speedKbps);
        if (speedHistory_.size() > MAX_HISTORY_SIZE) {
            speedHistory_.pop_front();
        }
    }
    
    bool expected = false;
    if (isRendering_.compare_exchange_strong(expected, true)) {
        DrawFrame();
    }
//    OH_LOG_INFO("Pipeline received: %{public}.2f kbps, Buffer size: %{public}zu", speedKbps, speedHistory_.size());
}

void RenderManager::ClearData() {
    std::lock_guard<std::mutex> lock(dataMutex_);
    speedHistory_.clear();
}

// 获取数据 (消费者)
std::vector<double> RenderManager::GetDataSnapshot() {
    std::lock_guard<std::mutex> lock(dataMutex_);
    return {speedHistory_.begin(), speedHistory_.end()};
}

// Surface 创建回调, 当 UI 层的 XComponent 布局完成并分配好显存后，系统调用此函数
void RenderManager::OnSurfaceCreated(OH_NativeXComponent *component, void *window) {
    OH_LOG_INFO("OnSurFaceCreated: Surface ready.");
    auto instance = RenderManager::GetInstance();
    instance->nativeWindow_ = static_cast<OHNativeWindow*>(window); // 获取 NativeWindow 实例, window 参数实际上就是 OHNativeWindow*
    
    // 获取初始宽高
    uint64_t width = 0;
    uint64_t height = 0;
    int32_t ret = OH_NativeXComponent_GetXComponentSize(component, window, &width, &height);
    if (ret == OH_NATIVEXCOMPONENT_RESULT_SUCCESS) {
        instance->width_ = width;
        instance->height_ = height;
        OH_LOG_INFO("Surface Size: %{public}lu x %{public}lu", width, height);
    }
    uint64_t usage = NATIVEBUFFER_USAGE_CPU_READ | NATIVEBUFFER_USAGE_CPU_WRITE;
    ret = OH_NativeWindow_NativeWindowHandleOpt(instance->nativeWindow_, SET_USAGE, usage);
    if (ret != 0) {
        OH_LOG_ERROR("Set Usage failed: %{public}d", ret);
    }
    OH_NativeWindow_NativeWindowHandleOpt(instance->nativeWindow_, SET_BUFFER_GEOMETRY, instance->width_, instance->height_);
    OH_NativeWindow_NativeWindowHandleOpt(instance->nativeWindow_, SET_FORMAT, NATIVEBUFFER_PIXEL_FMT_RGBA_8888);
}

void RenderManager::OnSurfaceChanged(OH_NativeXComponent *component, void *window) {
    OH_LOG_INFO("OnSurfaceChanged");
    // 当屏幕旋转或组件大小变化时触发，需要更新画布尺寸
    auto instance = RenderManager::GetInstance();
    // 更新宽高
    uint64_t width = 0;
    uint64_t height = 0;
    OH_NativeXComponent_GetXComponentSize(component, window, &width, &height);
    instance->width_ = width;
    instance->height_ = height;
    // 重新触发一次绘制，适配新尺寸
    instance->DrawFrame();
}

void RenderManager::OnSurfaceDestroyed(OH_NativeXComponent *component, void *window) {
    OH_LOG_INFO("OnSurfaceDestroyed");
    RenderManager::GetInstance()->nativeWindow_ = nullptr;
}

void RenderManager::OnDispatchTouchEvent(OH_NativeXComponent *component, void *window) {
    // 可以在这里处理点击事件，暂略
}

// 将 C++ 回调函数注册给 XComponent 系统
void RenderManager::RegisterCallback(OH_NativeXComponent *nativeXComponent) {
    // 保存指针，后面要用它来获取 XComponent 的属性
    component_ = nativeXComponent;
    
    callback_.OnSurfaceCreated = OnSurfaceCreated;
    callback_.OnSurfaceChanged = OnSurfaceChanged;
    callback_.OnSurfaceDestroyed = OnSurfaceDestroyed;
    callback_.DispatchTouchEvent = OnDispatchTouchEvent;
    
    // 这里的 RegisterCallback 是 NDK 提供的 API
    OH_NativeXComponent_RegisterCallback(nativeXComponent, &callback_);
    OH_LOG_INFO("RenderManager Callback Registered");
    
}

void RenderManager::DrawFrame() {
    if (nativeWindow_ == nullptr) {
        isRendering_ = false; // 释放锁
        return;
    }
    
    // 请求 Buffer (生产者-消费者模型中的“生产”)
    OHNativeWindowBuffer* buffer = nullptr;
    int fenceFd = -1;
    // 请求一块空闲的 Graphic Buffer，可能会阻塞等待 VSync
    auto ret = OH_NativeWindow_NativeWindowRequestBuffer(nativeWindow_, &buffer, &fenceFd);
    if(ret != 0 || buffer == nullptr) {
        OH_LOG_ERROR("RequestBuffer failed: %{public}d", ret);
        isRendering_ = false; // 释放锁
        return;
    }
    
    // 如果有 Fence，必须等待 GPU/Display 用完这块 Buffer 才能写
    if (fenceFd > 0) {
        close(fenceFd); 
    }
    
    // 获取 Buffer 信息并绑定 Bitmap
    BufferHandle* handle = OH_NativeWindow_GetBufferHandleFromNative(buffer);
    void* windowPixels = handle->virAddr; // Buffer 的虚拟内存地址
    bool needsUnmap = false; // 标记是否需要手动解除映射
    
    if(windowPixels == nullptr) {
        // 系统没有映射，这里需要处理 mmap
        windowPixels = mmap(nullptr, handle->size, PROT_READ | PROT_WRITE, MAP_SHARED, handle->fd, 0);
        if (windowPixels == MAP_FAILED) {
            OH_LOG_ERROR("mmap failed!");
            OH_NativeWindow_NativeWindowAbortBuffer(nativeWindow_, buffer);
            isRendering_ = false;
            return;
        }
        needsUnmap = true;
    }
    
    // 创建 Bitmap 绑定这块内存
    OH_Drawing_Bitmap* bitmap = OH_Drawing_BitmapCreate();
    OH_Drawing_BitmapFormat format = { COLOR_FORMAT_RGBA_8888, ALPHA_FORMAT_PREMUL};
    OH_Drawing_BitmapBuild(bitmap, width_, height_, &format);
    
    // 创建 Canvas 绑定 Bitmap
    OH_Drawing_Canvas* canvas = OH_Drawing_CanvasCreate();
    OH_Drawing_CanvasBind(canvas, bitmap);
    
    // --- 绘图逻辑 ---
    
    // 清空画布 (白色背景)
    OH_Drawing_CanvasClear(canvas, OH_Drawing_ColorSetArgb(0XFF, 0XFF, 0XFF, 0XFF));
    
    // 准备数据
    auto data = GetDataSnapshot();
    if(data.size() > 1) {
        // 计算 Y 轴最大值 (动态缩放)
        double maxVal = *std::max_element(data.begin(), data.end());
        if(maxVal < 100.0) maxVal = 100.0; // 最小刻度
        maxVal *= 1.2; // 留 20% 顶部余量
        
        // 创建路径
        OH_Drawing_Path* path = OH_Drawing_PathCreate();
        
        // 移动到左下角起点 (闭合区域用于填充)
        OH_Drawing_PathMoveTo(path, 0, height_);
        
        float stepX = static_cast<float>(width_) / (MAX_HISTORY_SIZE - 1);
        float lastX = 0.0f; 
        
        OH_Drawing_Path* fillPath = OH_Drawing_PathCreate();
        OH_Drawing_PathMoveTo(fillPath, 0, height_);
        
        float currentX = 0;
        
        // 构建波形路径
        for(size_t i = 0; i < data.size(); i++) {
            float x = i * stepX;
            // Y轴翻转：Canvas (0,0) 在左上角，数值越大越靠下
            // Val = 0 -> y = height; Val = max -> y = 0
            float y = static_cast<float >(height_ - (data[i] / maxVal) * height_);
            OH_Drawing_PathLineTo(fillPath, x, y);
            lastX = x;
        }
        
        // 闭合路径到右下角
        OH_Drawing_PathLineTo(fillPath, lastX, height_);
        // 回到起点 (0, height_) 闭合
        OH_Drawing_PathLineTo(fillPath, 0, height_);
        OH_Drawing_PathClose(fillPath);
        
        // 绘制填充 (Brush + Shader)
        OH_Drawing_Brush* brush = OH_Drawing_BrushCreate();
        
        // 创建线性渐变 (从上到下)
        OH_Drawing_Point* startPt = OH_Drawing_PointCreate(0, 0);
        OH_Drawing_Point* endPt = OH_Drawing_PointCreate(0, height_);
        
        // 颜色：半透明蓝 -> 全透明蓝
        uint32_t colors[] = { 0x66007DFF, 0x00007DFF }; 
        float pos[] = { 0.0f, 1.0f};
        OH_Drawing_ShaderEffect* shader = OH_Drawing_ShaderEffectCreateLinearGradient(startPt, endPt, colors, pos, 2, OH_Drawing_TileMode::CLAMP);
        
        OH_Drawing_BrushSetShaderEffect(brush, shader);
        OH_Drawing_CanvasAttachBrush(canvas, brush);
        OH_Drawing_CanvasAttachPen(canvas, nullptr);
        OH_Drawing_CanvasDrawPath(canvas, fillPath);
        
        OH_Drawing_Path* strokePath = OH_Drawing_PathCreate();
        for (size_t i = 0; i < data.size(); ++i) {
            float x = i * stepX;
            float y = static_cast<float>(height_ - (data[i] / maxVal) * height_);
            if (i == 0) OH_Drawing_PathMoveTo(strokePath, x, y);
            else OH_Drawing_PathLineTo(strokePath, x, y);
        }
        
        // 绘制描边 (Pen)
        OH_Drawing_Pen* pen = OH_Drawing_PenCreate();
        OH_Drawing_PenSetColor(pen, 0xFF007DFF);
        OH_Drawing_PenSetWidth(pen, 4.0f);
        OH_Drawing_PenSetJoin(pen, LINE_ROUND_JOIN);
        OH_Drawing_PenSetCap(pen, LINE_ROUND_CAP);
        OH_Drawing_PenSetAntiAlias(pen, true); // 抗锯齿开启
        
        OH_Drawing_CanvasAttachPen(canvas, pen);
        OH_Drawing_CanvasAttachBrush(canvas, nullptr);
        OH_Drawing_CanvasDrawPath(canvas, strokePath);
        
        // 资源清理
        OH_Drawing_PenDestroy(pen);
        OH_Drawing_BrushDestroy(brush);
        OH_Drawing_ShaderEffectDestroy(shader);
        OH_Drawing_PointDestroy(startPt);
        OH_Drawing_PointDestroy(endPt);
        OH_Drawing_PathDestroy(fillPath);
        OH_Drawing_PathDestroy(strokePath);
    }
    
    // 获取 Bitmap 绘制好的像素地址 (源地址)
    void* bitmapPixels = OH_Drawing_BitmapGetPixels(bitmap);
    
    // 获取目标 Window 的 stride (步长/跨度)
    int32_t bufferStride = handle->stride; // 目标 stride
    int32_t bitmapStride = width_ * 4; // 源 stride (RGBA 4字节)
    
    if(bitmapPixels != nullptr && windowPixels != nullptr) {
        if(bufferStride == bitmapStride) {
            // 如果 stride 一致，直接整块拷贝
            memcpy(windowPixels, bitmapPixels, width_ * height_ * 4);
        }else {
            // 如果 stride 不一致，必须逐行拷贝, 否则画面会歪斜或花屏
            for(int i = 0; i < height_; i++){
                uint8_t* srcRow = static_cast<uint8_t*>(bitmapPixels) + i * bitmapStride;
                uint8_t* dstRow = static_cast<uint8_t*>(windowPixels) + i * bufferStride;
                memcpy(dstRow, srcRow, width_ * 4); // 只拷贝有效数据
            }
        }
    }
    
    // 清理画布相关资源
    OH_Drawing_CanvasDestroy(canvas);
    OH_Drawing_BitmapDestroy(bitmap);
    
    // 解除映射
    if (needsUnmap) {
        munmap(windowPixels, handle->size);
    }
    
    // 提交 Buffer (Flush), 将画好的内容交给屏幕合成器
    Region region = {nullptr, 0};
    OH_NativeWindow_NativeWindowFlushBuffer(nativeWindow_, buffer, -1, region);
    
    isRendering_ = false;
}