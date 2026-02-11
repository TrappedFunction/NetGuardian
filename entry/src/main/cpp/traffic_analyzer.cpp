#include "napi/native_api.h"
#include <hilog/log.h>
#include <vector>
#include <deque>
#include <numeric>
#include <chrono>
#include <cmath>
#include <algorithm>

// 定义日志标签
#undef LOG_TAG
#define LOG_TAG "NativeTraffic"
#define LOG_DOMAIN 0x0001
#define OH_LOG_INFO(fmt, ...) ((void)OH_LOG_Print(LOG_APP, LOG_INFO, LOG_DOMAIN, LOG_TAG, fmt, ##__VA_ARGS__))

static const size_t WINDOW_SIZE = 100; // 窗口大小
static std::deque<double> g_speedWindow; // 存储最近N次瞬时速度（kbps）
static double g_totalBytes = 0; // 总流量
static std::chrono::time_point<std::chrono::steady_clock> g_lastPacketTime; // 上一次收到包的时间
static bool g_isFirstPacket = true; // 标记是否是第一个包
static double g_accumulatedBytes = 0; // 临时累积的字节数
static const long long MIN_CALC_INTERVAL_US = 100000; // 最小计算间隔 (微秒): 100ms = 100,000us

static double g_globalMax = 0;
static double g_globalAvgKbps = 0;
static double g_globalMin = -1.0; // -1 表示尚未初始化
static std::chrono::time_point<std::chrono::steady_clock> g_sessionStartTime; // 整个会话开始时间
static int g_sampleCount = 0; // 采样计数，用于忽略启动阶段

// 重置状态 (供 JS 调用)
static napi_value ResetState(napi_env env, napi_callback_info info) {
    g_speedWindow.clear();
    g_totalBytes = 0;
    g_accumulatedBytes = 0;
    g_isFirstPacket = true;
    g_globalMax = 0;
    g_globalMin = -1.0;
    g_sampleCount = 0;
    auto now = std::chrono::steady_clock::now();
    g_lastPacketTime = now;
    g_sessionStartTime = now;
    OH_LOG_INFO("Traffic Analyzer State Reset");
    return nullptr;
}

// 计算标准差 (Jitter)
double CalculateJitter(const std::deque<double>& window, double mean){
    if(window.size() < 2) return 0.0;
    
    double sum_sq_diff = 0.0;
    for(double val : window) {
        double diff = val - mean;
        sum_sq_diff += diff * diff;
    }
    return std::sqrt(sum_sq_diff / window.size());
}

// 辅助函数：将统计数据打包为 JS 对象
static napi_value CreateResultObject(napi_env env, double instant, double max, double min, double avg, double jitter, double total) {
    napi_value resultObject;
    napi_create_object(env, &resultObject);

    napi_value valInstant, valMax, valMin, valAvg, valJitter, valTotal;

    // 创建 JS Number 对象
    napi_create_double(env, instant, &valInstant);
    napi_create_double(env, max, &valMax);
    napi_create_double(env, min, &valMin);
    napi_create_double(env, avg, &valAvg);
    napi_create_double(env, jitter, &valJitter);
    napi_create_double(env, total, &valTotal);

    // 设置属性
    napi_set_named_property(env, resultObject, "instantKbps", valInstant);
    napi_set_named_property(env, resultObject, "maxKbps", valMax);
    napi_set_named_property(env, resultObject, "minKbps", valMin);
    napi_set_named_property(env, resultObject, "avgKbps", valAvg);
    napi_set_named_property(env, resultObject, "jitter", valJitter);
    napi_set_named_property(env, resultObject, "totalBytes", valTotal);

    return resultObject;
}

static napi_value ProcessTrafficCore(napi_env env, size_t byteLength) {
    auto now = std::chrono::steady_clock::now();

    // 累加流量
    g_totalBytes += static_cast<double>(byteLength);
    g_accumulatedBytes += static_cast<double>(byteLength);

    if (g_isFirstPacket) {
        g_isFirstPacket = false;
        g_lastPacketTime = now;
        g_sessionStartTime = now;
        
        // 初始返回空对象
        napi_value result;
        napi_create_object(env, &result);
        return result;
    }

    auto duration_us = std::chrono::duration_cast<std::chrono::microseconds>(now - g_lastPacketTime).count();

    // 时间聚合门禁 (<100ms 不计算，但要返回最新的 totalBytes)
    if(duration_us < MIN_CALC_INTERVAL_US){
        double lastInstant = g_speedWindow.empty() ? 0.0 : g_speedWindow.back();

        // Jitter 保持不变 (因为没有产生新的瞬时样本)
        double windowSum = std::accumulate(g_speedWindow.begin(), g_speedWindow.end(), 0.0);
        double windowAvg = g_speedWindow.empty() ? 0.0 : (windowSum / g_speedWindow.size());
        double lastJitter = CalculateJitter(g_speedWindow, windowAvg);
        
        return CreateResultObject(
            env, 
            lastInstant,                // Instant: 保持上一次
            g_globalMax,                // Max: 保持不变
            (g_globalMin < 0 ? 0 : g_globalMin), // Min: 保持不变
            g_globalAvgKbps,           // Avg: 实时更新
            lastJitter,                 // Jitter: 保持不变
            g_totalBytes                // Total: 实时更新
        );
    
    }
    
    double duration_sec = static_cast<double>(duration_us) / 1000000.0;
    
    // 瞬时速度
    double currentBits = g_accumulatedBytes * 8.0;
    double instantKbps = (currentBits / duration_sec) / 1024.0;

    // 更新 Max
    if (instantKbps > g_globalMax) {
        g_globalMax = instantKbps;
    }

    // 更新 Min (忽略启动前 5 点)
    g_sampleCount++;
    if (g_sampleCount > 5) {
        if (g_globalMin < 0 || instantKbps < g_globalMin) {
            g_globalMin = instantKbps;
        }
    }

    // 全局平均
    auto total_us = std::chrono::duration_cast<std::chrono::microseconds>(now - g_sessionStartTime).count();
    double total_sec = static_cast<double>(total_us) / 1000000.0;
    double globalAvgKbps = (total_sec > 0) ? (g_totalBytes * 8.0 / 1024.0) / total_sec : 0;
    g_globalAvgKbps = globalAvgKbps;

    // Jitter
    if (g_speedWindow.size() >= WINDOW_SIZE) g_speedWindow.pop_front();
    g_speedWindow.push_back(instantKbps);
    
    double winSum = std::accumulate(g_speedWindow.begin(), g_speedWindow.end(), 0.0);
    double jitter = CalculateJitter(g_speedWindow, winSum / g_speedWindow.size());

    // 重置累积
    g_accumulatedBytes = 0;
    g_lastPacketTime = now;

    // 组装返回值
    return CreateResultObject(
        env,
        instantKbps,
        g_globalMax,
        (g_globalMin < 0 ? 0 : g_globalMin),
        globalAvgKbps,
        jitter,
        g_totalBytes
    );
}

/**
 * 接口1：处理 ArrayBuffer (下载用)
 * analyzeTraffic(buffer: ArrayBuffer)
 */
static napi_value AnalyzeTraffic(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1] = {nullptr};
    
    // 获取JS传入的参数, info 是回调上下文，args将存储JS对象的句柄（Handle）
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    
    // 参数校验，检测第一个参数是否为ArrayBuffer
    bool isArrayBuffer = false;
    napi_is_arraybuffer(env, args[0], &isArrayBuffer);
    if(!isArrayBuffer) {
        napi_throw_type_error(env, nullptr, "Argument 0 must be an ArrayBuffer");
        return nullptr;
    }

    void* data = nullptr; // 指向 JS 堆外内存的物理指针
    size_t byteLength = 0; // 数据的长度
    napi_status status = napi_get_arraybuffer_info(env, args[0], &data, &byteLength);

    if (status != napi_ok) return nullptr;
    
    return ProcessTrafficCore(env, byteLength);
}

/**
 * 接口2：处理数值长度 (上传用)
 * analyzeLength(byteLength: number)
 */
static napi_value AnalyzeLength(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1] = {nullptr};
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    
    double len = 0;
    // 获取 Number 值
    napi_status status = napi_get_value_double(env, args[0], &len);
    if (status != napi_ok) return nullptr;

    return ProcessTrafficCore(env, static_cast<size_t>(len));
}

// 模块初始化注册
EXTERN_C_START
static napi_value Init(napi_env env, napi_value exports){
    napi_property_descriptor desc[] = {
        { "analyzeTraffic", nullptr, AnalyzeTraffic, nullptr, nullptr, nullptr, napi_default, nullptr},
        { "analyzeLength", nullptr, AnalyzeLength, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "resetState", nullptr, ResetState, nullptr, nullptr, nullptr, napi_default, nullptr }
    };
    napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
    return exports;
}
EXTERN_C_END

// 模块定义
static napi_module demoModule = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "net_guardian",
    .nm_priv = ((void*)0),
    .reserved = {0},
};

// 注册入口
extern "C" __attribute__((constructor)) void RegisterNetGuardianModule(void) {
    napi_module_register(&demoModule);
}




