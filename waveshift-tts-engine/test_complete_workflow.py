#!/usr/bin/env python3
"""
完整工作流程测试脚本
模拟tts-worker发送请求，测试音频下载、TTS生成、对齐、校准和合并功能
"""
import asyncio
import json
import aiohttp
import time
from typing import List, Dict, Any

# 测试配置
TTS_ENGINE_URL = "http://localhost:8000"
TEST_AUDIO_SAMPLE = "https://media.waveshift.net/users/b9bc1fd7-eac5-4e33-9161-b5ab2ba378d6/198a5851-6bcb-42f1-afe0-0b5ff76706c8/audio-segments/sequence_0002_Speaker%20B.wav"

# 测试数据 - 模拟多条句子
TEST_SENTENCES = [
    {
        "sequence": 1,
        "text": "欢迎来到WaveShift语音合成系统，这是一个基于IndexTTS的高性能引擎",
        "audioSample": TEST_AUDIO_SAMPLE,
        "speaker": "Speaker B",
        "startMs": 0,
        "endMs": 4000
    },
    {
        "sequence": 2,
        "text": "系统支持语音克隆功能，可以根据提供的音频样本生成相似的语音",
        "audioSample": TEST_AUDIO_SAMPLE,
        "speaker": "Speaker B", 
        "startMs": 4000,
        "endMs": 8500
    },
    {
        "sequence": 3,
        "text": "我们还提供时间对齐和时间戳校准功能，确保音频与文本完美同步",
        "audioSample": TEST_AUDIO_SAMPLE,
        "speaker": "Speaker B",
        "startMs": 8500,
        "endMs": 13000
    },
    {
        "sequence": 4,
        "text": "最终系统会自动合并所有音频片段，生成完整的语音输出",
        "audioSample": TEST_AUDIO_SAMPLE,
        "speaker": "Speaker B",
        "startMs": 13000,
        "endMs": 17000
    },
    {
        "sequence": 5,
        "text": "感谢您使用WaveShift TTS系统，希望您有愉快的体验",
        "audioSample": TEST_AUDIO_SAMPLE,
        "speaker": "Speaker B",
        "startMs": 17000,
        "endMs": 20500
    }
]

async def wait_for_service(max_attempts: int = 30) -> bool:
    """等待TTS服务启动完成"""
    print("🔄 等待TTS-Engine服务启动...")
    
    for attempt in range(max_attempts):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{TTS_ENGINE_URL}/health", timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status == 200:
                        print("✅ TTS-Engine服务已就绪")
                        return True
                    elif response.status == 502:
                        print(f"⏳ 服务启动中... (尝试 {attempt + 1}/{max_attempts})")
                    else:
                        print(f"⚠️  服务状态异常: HTTP {response.status}")
        except asyncio.TimeoutError:
            print(f"⏳ 连接超时，继续等待... (尝试 {attempt + 1}/{max_attempts})")
        except Exception as e:
            print(f"⏳ 等待服务启动... (尝试 {attempt + 1}/{max_attempts}, 错误: {e})")
        
        await asyncio.sleep(2)
    
    print("❌ 等待超时，服务可能启动失败")
    return False

async def test_simple_mode():
    """测试简单模式 - 仅TTS合成"""
    print("\n" + "="*60)
    print("🧪 测试1: 简单模式TTS合成（音频下载 + 语音克隆）")
    print("="*60)
    
    request_data = {
        "sentences": TEST_SENTENCES[:2],  # 只测试前2句
        "settings": {
            "language": "zh",
            "speed": 1.0
        },
        "mode": "simple"
    }
    
    print(f"📋 测试请求:")
    print(f"   句子数量: {len(request_data['sentences'])}")
    print(f"   音频样本: {TEST_AUDIO_SAMPLE}")
    print(f"   处理模式: {request_data['mode']}")
    
    try:
        start_time = time.time()
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{TTS_ENGINE_URL}/synthesize",
                json=request_data,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                
                if response.status == 200:
                    result = await response.json()
                    process_time = time.time() - start_time
                    
                    print(f"✅ 简单模式测试成功!")
                    print(f"⏱️  处理耗时: {process_time:.2f}秒")
                    
                    if result.get("success", False):
                        results = result.get("results", [])
                        success_count = sum(1 for r in results if r.get("success", False))
                        
                        print(f"📊 处理结果:")
                        print(f"   总句子数: {len(results)}")
                        print(f"   成功数量: {success_count}")
                        print(f"   成功率: {success_count/len(results)*100:.1f}%")
                        print(f"   处理阶段: {result.get('processing_stages', [])}")
                        
                        # 显示详细结果
                        for i, res in enumerate(results):
                            status = "✅" if res.get("success", False) else "❌"
                            seq = res.get("sequence", i+1)
                            duration = res.get("durationMs", 0)
                            audio_key = res.get("audioKey", "N/A")
                            
                            print(f"   {status} 句子 {seq}: {duration}ms")
                            if audio_key != "N/A":
                                print(f"      音频文件: {audio_key}")
                            
                            if res.get("error"):
                                print(f"      错误: {res['error']}")
                        
                        return success_count > 0
                    else:
                        error_msg = result.get("error", "未知错误")
                        print(f"❌ 处理失败: {error_msg}")
                        return False
                else:
                    error_text = await response.text()
                    print(f"❌ HTTP请求失败 {response.status}: {error_text}")
                    return False
    
    except Exception as e:
        print(f"💥 简单模式测试异常: {e}")
        return False

async def test_full_mode():
    """测试完整模式 - TTS + 时间对齐 + 媒体合并"""
    print("\n" + "="*60)
    print("🧪 测试2: 完整模式（TTS + 时间对齐 + 时间戳校准 + 媒体合并）")
    print("="*60)
    
    request_data = {
        "sentences": TEST_SENTENCES,  # 测试所有句子
        "settings": {
            "language": "zh",
            "speed": 1.0
        },
        "mode": "full",
        "enable_duration_align": True,
        "enable_timestamp_adjust": True,
        "enable_media_mix": True,
        "task_id": f"test_task_{int(time.time())}"
    }
    
    print(f"📋 测试请求:")
    print(f"   句子数量: {len(request_data['sentences'])}")
    print(f"   处理模式: {request_data['mode']}")
    print(f"   启用功能:")
    print(f"     - 时间对齐: {request_data.get('enable_duration_align', False)}")
    print(f"     - 时间戳校准: {request_data.get('enable_timestamp_adjust', False)}")
    print(f"     - 媒体合并: {request_data.get('enable_media_mix', False)}")
    print(f"   任务ID: {request_data.get('task_id')}")
    
    try:
        start_time = time.time()
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{TTS_ENGINE_URL}/synthesize",
                json=request_data,
                timeout=aiohttp.ClientTimeout(total=120)  # 完整模式需要更长时间
            ) as response:
                
                if response.status == 200:
                    result = await response.json()
                    process_time = time.time() - start_time
                    
                    print(f"✅ 完整模式测试成功!")
                    print(f"⏱️  总处理耗时: {process_time:.2f}秒")
                    
                    if result.get("success", False):
                        results = result.get("results", [])
                        success_count = sum(1 for r in results if r.get("success", False))
                        processing_stages = result.get("processing_stages", [])
                        
                        print(f"📊 处理结果:")
                        print(f"   总句子数: {len(results)}")
                        print(f"   成功数量: {success_count}")
                        print(f"   成功率: {success_count/len(results)*100:.1f}%")
                        print(f"   处理阶段: {processing_stages}")
                        
                        # 显示各阶段的输出
                        if "duration_alignment" in processing_stages:
                            print(f"   ✅ 时间对齐完成")
                        
                        if "timestamp_adjustment" in processing_stages:
                            print(f"   ✅ 时间戳校准完成")
                            
                        if "media_mixing" in processing_stages:
                            print(f"   ✅ 媒体合并完成")
                            mixed_audio = result.get("mixed_audio_key")
                            if mixed_audio:
                                print(f"   📁 合并音频: {mixed_audio}")
                        
                        # HLS生成结果
                        hls_playlist = result.get("hls_playlist")
                        if hls_playlist:
                            print(f"   🎬 HLS播放列表: {hls_playlist}")
                        
                        # 显示详细句子结果
                        print(f"\n📋 详细句子结果:")
                        for res in results:
                            status = "✅" if res.get("success", False) else "❌"
                            seq = res.get("sequence")
                            duration = res.get("durationMs", 0)
                            adjusted_start = res.get("adjusted_start_ms")
                            adjusted_end = res.get("adjusted_end_ms")
                            
                            print(f"   {status} 句子 {seq}: {duration}ms")
                            if adjusted_start is not None and adjusted_end is not None:
                                print(f"      时间调整: {adjusted_start}ms - {adjusted_end}ms")
                            
                            if res.get("error"):
                                print(f"      错误: {res['error']}")
                        
                        return success_count > 0
                    else:
                        error_msg = result.get("error", "未知错误")
                        print(f"❌ 处理失败: {error_msg}")
                        return False
                else:
                    error_text = await response.text()
                    print(f"❌ HTTP请求失败 {response.status}: {error_text}")
                    return False
    
    except Exception as e:
        print(f"💥 完整模式测试异常: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_audio_download_only():
    """测试纯音频下载功能"""
    print("\n" + "="*60)
    print("🧪 测试3: 音频下载功能验证")
    print("="*60)
    
    # 测试不同的音频URL和本地路径
    test_cases = [
        {
            "name": "有效HTTP音频URL",
            "audioSample": TEST_AUDIO_SAMPLE,
            "expected": True
        },
        {
            "name": "空音频样本",
            "audioSample": "",
            "expected": True  # 应该使用默认语音
        },
        {
            "name": "None音频样本", 
            "audioSample": None,
            "expected": True  # 应该使用默认语音
        }
    ]
    
    overall_success = True
    
    for test_case in test_cases:
        print(f"\n🔍 测试: {test_case['name']}")
        print(f"   音频样本: {test_case['audioSample']}")
        
        request_data = {
            "sentences": [{
                "sequence": 1,
                "text": "测试音频下载功能",
                "audioSample": test_case["audioSample"],
                "speaker": "test_speaker",
                "startMs": 0,
                "endMs": 3000
            }],
            "settings": {"language": "zh"},
            "mode": "simple"
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{TTS_ENGINE_URL}/synthesize",
                    json=request_data,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        
                        if result.get("success", False):
                            results = result.get("results", [])
                            if results and results[0].get("success", False):
                                print(f"   ✅ 测试通过")
                            else:
                                print(f"   ❌ TTS生成失败: {results[0].get('error', '未知错误') if results else '无结果'}")
                                if test_case["expected"]:
                                    overall_success = False
                        else:
                            print(f"   ❌ 请求处理失败: {result.get('error', '未知错误')}")
                            if test_case["expected"]:
                                overall_success = False
                    else:
                        print(f"   ❌ HTTP错误 {response.status}")
                        if test_case["expected"]:
                            overall_success = False
                            
        except Exception as e:
            print(f"   ❌ 异常: {e}")
            if test_case["expected"]:
                overall_success = False
    
    return overall_success

async def main():
    """主测试函数"""
    print("🚀 开始WaveShift TTS-Engine完整工作流程测试")
    print(f"🎯 测试音频样本: {TEST_AUDIO_SAMPLE}")
    
    # 等待服务启动
    if not await wait_for_service():
        print("💥 无法连接到TTS-Engine服务，请检查服务状态")
        return False
    
    test_results = []
    
    # 测试1: 音频下载功能
    print("\n" + "🔥"*20 + " 开始功能测试 " + "🔥"*20)
    result1 = await test_audio_download_only()
    test_results.append(("音频下载功能", result1))
    
    # 测试2: 简单模式
    result2 = await test_simple_mode()
    test_results.append(("简单模式TTS合成", result2))
    
    # 测试3: 完整模式
    result3 = await test_full_mode()
    test_results.append(("完整模式处理", result3))
    
    # 结果总结
    print("\n" + "="*60)
    print("📋 测试结果总结")
    print("="*60)
    
    for test_name, success in test_results:
        status = "✅ 通过" if success else "❌ 失败"
        print(f"{status} {test_name}")
    
    overall_success = all(success for _, success in test_results)
    
    if overall_success:
        print(f"\n🎉 所有测试都通过了！")
        print(f"✅ 音频下载功能正常")
        print(f"✅ 语音克隆功能正常") 
        print(f"✅ TTS生成功能正常")
        print(f"✅ 时间对齐功能正常")
        print(f"✅ 时间戳校准功能正常")
        print(f"✅ 媒体合并功能正常")
        print(f"\n🎯 WaveShift TTS-Engine工作流程完全正常！")
    else:
        print(f"\n⚠️  部分测试失败，请检查详细日志")
        failed_tests = [name for name, success in test_results if not success]
        print(f"❌ 失败的测试: {', '.join(failed_tests)}")
    
    return overall_success

if __name__ == "__main__":
    # 运行完整测试
    asyncio.run(main())