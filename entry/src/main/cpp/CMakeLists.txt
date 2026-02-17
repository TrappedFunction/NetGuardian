# the minimum version of CMake.
cmake_minimum_required(VERSION 3.5.0)
project(HarmonyNetGuardian)

set(NATIVERENDER_ROOT_PATH ${CMAKE_CURRENT_SOURCE_DIR})

if(DEFINED PACKAGE_FIND_FILE)
    include(${PACKAGE_FIND_FILE})
endif()

include_directories(${NATIVERENDER_ROOT_PATH}
                    ${NATIVERENDER_ROOT_PATH}/include)

add_library(net_guardian SHARED traffic_analyzer.cpp render_manager.cpp)

# 链接 OpenHarmony 的 NAPI 库和日志库
target_link_libraries(net_guardian PUBLIC
    libace_napi.z.so # JS 交互
    libhilog_ndk.z.so # 日志
    libnative_window.so # 管理 Surface (缓冲区)
    libnative_drawing.so # 绘图 API (画笔、路径、画布)
    libace_ndk.z.so #UI 组件后端
    libnative_buffer.so
)