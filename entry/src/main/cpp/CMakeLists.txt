# the minimum version of CMake.
cmake_minimum_required(VERSION 3.5.0)
project(HarmonyNetGuardian)

set(NATIVERENDER_ROOT_PATH ${CMAKE_CURRENT_SOURCE_DIR})

if(DEFINED PACKAGE_FIND_FILE)
    include(${PACKAGE_FIND_FILE})
endif()

include_directories(${NATIVERENDER_ROOT_PATH}
                    ${NATIVERENDER_ROOT_PATH}/include)

add_library(net_guardian SHARED traffic_analyzer.cpp)

# 链接 OpenHarmony 的 NAPI 库和日志库
target_link_libraries(net_guardian PUBLIC libace_napi.z.so libhilog_ndk.z.so)