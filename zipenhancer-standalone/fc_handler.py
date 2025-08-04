#!/usr/bin/env python3
"""
阿里云函数计算Handler - ZipEnhancer GPU降噪服务
"""

import os
import json
import tempfile
import traceback
import time

# 预设置环境变量
os.environ['CUDA_VISIBLE_DEVICES'] = '0'
os.environ['OMP_NUM_THREADS'] = '1'

# 导入降噪函数
from zipenhancer import denoise_audio

# 全局变量，用于模型预热
_initialized = False

# 智能检测模型路径
def get_model_path():
    """获取ONNX模型文件路径"""
    possible_paths = [
        '/app/speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx',  # FC容器路径
        './speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx',     # 当前目录
        '../speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx',    # 上级目录
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return path
    
    raise FileNotFoundError(f"未找到ONNX模型文件，尝试的路径: {possible_paths}")

_model_path = get_model_path()

def initialize():
    """
    FC初始化函数 - 预热模型
    """
    global _initialized
    if not _initialized:
        try:
            print("🔄 预热ONNX模型...")
            import onnxruntime
            
            # 检查可用的providers
            providers = onnxruntime.get_available_providers()
            print(f"可用Providers: {providers}")
            
            # 预热测试
            if os.path.exists(_model_path):
                print(f"✅ 模型文件存在: {_model_path}")
            else:
                print(f"❌ 模型文件不存在: {_model_path}")
                
            _initialized = True
            print("✅ 模型预热完成")
        except Exception as e:
            print(f"❌ 预热失败: {e}")

def handler(event, context):
    """
    FC函数入口 - 处理音频降噪请求
    
    输入:
        - event['body']: 音频二进制数据
        - event['headers']: HTTP请求头
    
    输出:
        - statusCode: HTTP状态码
        - headers: 响应头
        - body: 降噪后的音频二进制数据
        - isBase64Encoded: 是否Base64编码
    """
    start_time = time.time()
    
    # 初始化（如果还未初始化）
    if not _initialized:
        initialize()
    
    try:
        # 获取请求头信息
        headers = event.get('headers', {})
        segment_id = headers.get('X-Segment-Id', 'unknown')
        speaker = headers.get('X-Speaker', 'unknown')
        
        print(f"📥 处理请求: segment_id={segment_id}, speaker={speaker}")
        
        # 获取音频数据
        if event.get('isBase64Encoded', False):
            import base64
            audio_data = base64.b64decode(event['body'])
        else:
            audio_data = event['body']
            if isinstance(audio_data, str):
                audio_data = audio_data.encode('latin-1')
        
        print(f"📊 输入音频大小: {len(audio_data)} bytes")
        
        # 创建临时文件处理
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_in, \
             tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_out:
            
            # 写入输入音频
            tmp_in.write(audio_data)
            tmp_in.flush()
            
            # 执行降噪处理
            print(f"🎵 开始降噪处理...")
            denoise_start = time.time()
            
            denoise_audio(
                tmp_in.name, 
                tmp_out.name,
                onnx_model_path=_model_path,
                verbose=False
            )
            
            denoise_time = time.time() - denoise_start
            print(f"✅ 降噪完成，耗时: {denoise_time:.2f}秒")
            
            # 读取处理结果
            with open(tmp_out.name, 'rb') as f:
                processed_audio = f.read()
            
            # 清理临时文件
            os.unlink(tmp_in.name)
            os.unlink(tmp_out.name)
        
        total_time = time.time() - start_time
        
        print(f"📊 输出音频大小: {len(processed_audio)} bytes")
        print(f"⏱️ 总处理时间: {total_time:.2f}秒")
        
        # 检查是否使用GPU
        import onnxruntime
        providers = onnxruntime.get_available_providers()
        using_gpu = 'CUDAExecutionProvider' in providers
        
        # 返回处理结果
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'audio/wav',
                'X-Denoise-Applied': 'true',
                'X-Model': 'ZipEnhancer-ONNX',
                'X-Device': 'GPU' if using_gpu else 'CPU',
                'X-Processing-Time': f'{total_time:.2f}s',
                'X-Denoise-Time': f'{denoise_time:.2f}s',
                'X-Segment-Id': segment_id,
                'X-Speaker': speaker
            },
            'body': processed_audio,
            'isBase64Encoded': True  # FC需要Base64编码二进制数据
        }
        
    except Exception as e:
        error_msg = str(e)
        tb = traceback.format_exc()
        print(f"❌ 降噪处理错误: {error_msg}")
        print(f"堆栈跟踪:\n{tb}")
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'X-Error': error_msg.replace('\n', ' ')
            },
            'body': json.dumps({
                'error': error_msg,
                'segment_id': segment_id if 'segment_id' in locals() else 'unknown',
                'traceback': tb
            }),
            'isBase64Encoded': False
        }

# 健康检查端点
def health_check(event, context):
    """健康检查端点"""
    try:
        import onnxruntime
        providers = onnxruntime.get_available_providers()
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'status': 'healthy',
                'model_initialized': _initialized,
                'available_providers': providers,
                'cuda_available': 'CUDAExecutionProvider' in providers,
                'model_exists': os.path.exists(_model_path)
            }),
            'isBase64Encoded': False
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'status': 'unhealthy', 'error': str(e)}),
            'isBase64Encoded': False
        }

# FC测试入口
if __name__ == '__main__':
    # 模拟FC event
    test_event = {
        'headers': {
            'X-Segment-Id': 'test-001',
            'X-Speaker': 'test-speaker'
        },
        'body': b'test audio data',
        'isBase64Encoded': False
    }
    
    # 测试handler
    result = handler(test_event, None)
    print(f"测试结果: {result['statusCode']}")