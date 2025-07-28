#!/usr/bin/env python3
"""
ZipEnhancer 流式音频降噪工具
演示如何将音频分块处理以节省内存
"""

import soundfile as sf
import numpy as np
import torch
import onnxruntime
import librosa
from typing import Generator, Tuple

def mag_pha_stft(signal, n_fft=400, hop_size=100, win_size=400, compress_factor=0.3):
    """STFT变换"""
    window = torch.hann_window(win_size)
    stft = torch.stft(signal, n_fft, hop_size, win_size, window, center=True, 
                      pad_mode='reflect', return_complex=True)
    magnitude = torch.pow(torch.abs(stft), compress_factor)
    phase = torch.angle(stft)
    return magnitude, phase

def mag_pha_istft(magnitude_compressed, phase, n_fft=400, hop_size=100, win_size=400, compress_factor=0.3):
    """ISTFT变换"""
    magnitude = torch.pow(magnitude_compressed, 1.0 / compress_factor)
    real = magnitude * torch.cos(phase)
    imag = magnitude * torch.sin(phase)
    stft_complex = torch.complex(real, imag)
    window = torch.hann_window(win_size)
    signal = torch.istft(stft_complex, n_fft, hop_size, win_size, window, center=True)
    return signal

class StreamingZipEnhancer:
    """流式ZipEnhancer处理器"""
    
    def __init__(self, onnx_model_path: str, chunk_size: int = 16000, overlap_size: int = 1600, 
                 chunk_duration: float = 1.0, overlap_duration: float = 0.5):
        """
        初始化流式处理器
        
        Args:
            onnx_model_path: ONNX模型路径
            chunk_size: 每个处理块的大小（样本数）
            overlap_size: 重叠区域大小（用于消除边界效应）
            chunk_duration: 每个处理块的时长（秒）
            overlap_duration: 块之间的重叠时长（秒）
        """
        self.session = onnxruntime.InferenceSession(onnx_model_path)
        self.chunk_size = chunk_size
        self.overlap_size = overlap_size
        self.previous_chunk = None
        
        # 支持时间参数
        self.sample_rate = 16000
        self.chunk_duration = chunk_duration
        self.overlap_duration = overlap_duration
        
        # STFT参数
        self.n_fft = 400
        self.hop_size = 100
        self.win_size = 400
        self.compress_factor = 0.3
        
    def process_chunk(self, chunk: np.ndarray) -> np.ndarray:
        """处理单个音频块"""
        # 转换为torch张量
        chunk_tensor = torch.from_numpy(chunk.astype(np.float32)).unsqueeze(0)
        
        # RMS归一化
        rms = torch.sqrt(torch.mean(chunk_tensor ** 2))
        norm_factor = 1.0 / (rms + 1e-10)
        normalized_chunk = chunk_tensor * norm_factor
        
        # STFT
        chunk_amp, chunk_pha = mag_pha_stft(normalized_chunk)
        
        # ONNX推理
        ort_inputs = {
            self.session.get_inputs()[0].name: chunk_amp.numpy(),
            self.session.get_inputs()[1].name: chunk_pha.numpy()
        }
        ort_outs = self.session.run(None, ort_inputs)
        
        # ISTFT重构
        amp_g = torch.from_numpy(ort_outs[0])
        pha_g = torch.from_numpy(ort_outs[1])
        enhanced_chunk = mag_pha_istft(amp_g, pha_g)
        
        # 反归一化
        enhanced_chunk = enhanced_chunk / norm_factor
        
        return enhanced_chunk.numpy()[0]
    
    def stream_process(self, audio: np.ndarray) -> Generator[np.ndarray, None, None]:
        """
        流式处理音频
        
        Args:
            audio: 输入音频数组
            
        Yields:
            处理后的音频块
        """
        total_samples = len(audio)
        processed_samples = 0
        
        while processed_samples < total_samples:
            # 计算当前块的起始和结束位置
            start = processed_samples
            end = min(start + self.chunk_size, total_samples)
            
            # 提取当前块
            current_chunk = audio[start:end]
            
            # 如果不是第一块，添加重叠区域
            if self.previous_chunk is not None:
                # 从前一块取重叠部分
                overlap_part = self.previous_chunk[-self.overlap_size:]
                current_chunk = np.concatenate([overlap_part, current_chunk])
            
            # 处理当前块
            enhanced_chunk = self.process_chunk(current_chunk)
            
            # 如果有重叠，跳过重叠部分
            if self.previous_chunk is not None:
                enhanced_chunk = enhanced_chunk[self.overlap_size:]
            
            # 保存当前块供下次使用
            self.previous_chunk = current_chunk
            
            # 输出处理结果
            yield enhanced_chunk
            
            processed_samples = end
    
    def process(self, audio: np.ndarray) -> np.ndarray:
        """
        一次性处理整个音频（适合短音频）
        
        Args:
            audio: 输入音频数组
            
        Returns:
            降噪后的音频数组
        """
        # 对于短音频，直接处理整个音频
        if len(audio) <= self.chunk_size * 2:
            return self.process_chunk(audio)
        
        # 对于长音频，使用流式处理并合并结果
        enhanced_chunks = []
        for chunk in self.stream_process(audio):
            enhanced_chunks.append(chunk)
        
        return np.concatenate(enhanced_chunks)

def streaming_denoise(input_path: str, output_path: str, 
                     onnx_model_path: str = './speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx',
                     chunk_duration: float = 1.0):
    """
    流式音频降噪
    
    Args:
        input_path: 输入音频路径
        output_path: 输出音频路径  
        onnx_model_path: ONNX模型路径
        chunk_duration: 每块处理时长（秒）
    """
    print(f"🌊 开始流式降噪处理: {input_path}")
    
    # 读取音频（可以考虑使用librosa的流式读取）
    audio, sr = librosa.load(input_path, sr=16000, mono=True)
    
    # 计算块大小
    chunk_size = int(chunk_duration * sr)
    overlap_size = chunk_size // 10  # 10%重叠
    
    print(f"📊 音频信息: {sr}Hz, {len(audio)/sr:.2f}秒")
    print(f"📊 处理配置: 块大小={chunk_size}样本, 重叠={overlap_size}样本")
    
    # 创建流式处理器
    enhancer = StreamingZipEnhancer(onnx_model_path, chunk_size, overlap_size)
    
    # 收集所有处理后的块
    enhanced_chunks = []
    
    for enhanced_chunk in enhancer.stream_process(audio):
        enhanced_chunks.append(enhanced_chunk)
    
    # 合并所有块
    enhanced_audio = np.concatenate(enhanced_chunks)
    
    # 确保长度匹配（可能因为重叠处理有小幅差异）
    if len(enhanced_audio) > len(audio):
        enhanced_audio = enhanced_audio[:len(audio)]
    elif len(enhanced_audio) < len(audio):
        # 用零填充
        padding = np.zeros(len(audio) - len(enhanced_audio))
        enhanced_audio = np.concatenate([enhanced_audio, padding])
    
    # 保存结果
    enhanced_audio = np.clip(enhanced_audio, -1.0, 1.0)
    sf.write(output_path, (enhanced_audio * 32767).astype(np.int16), sr)
    
    print(f"✅ 流式降噪完成! 输出: {output_path}")
    print(f"📈 内存峰值约为: {chunk_size * 4 / 1024 / 1024:.1f}MB (vs 批处理: {len(audio) * 4 / 1024 / 1024:.1f}MB)")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        input_file = "./speech_zipenhancer_ans_multiloss_16k_base/examples/noisy_sample.wav"
        output_file = "streaming_enhanced.wav"
    else:
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else "streaming_enhanced.wav"
    
    streaming_denoise(input_file, output_file) 