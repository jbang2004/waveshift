#!/usr/bin/env python3
"""ZipEnhancer - 音频降噪工具"""

import sys
import time
import soundfile as sf
import numpy as np
import scipy.signal
import onnxruntime
import librosa

def mag_pha_stft(signal, n_fft=400, hop_size=100, win_size=400, compress_factor=0.3):
    """STFT变换"""
    # 创建汉宁窗
    window = scipy.signal.get_window('hann', win_size)
    
    # 模拟PyTorch的center=True行为：在两端填充
    pad_length = n_fft // 2
    signal_padded = np.pad(signal, pad_length, mode='reflect')
    
    # 手动实现STFT以更好地控制行为
    n_frames = 1 + (len(signal_padded) - win_size) // hop_size
    stft_matrix = np.zeros((n_fft // 2 + 1, n_frames), dtype=np.complex128)
    
    for i in range(n_frames):
        start = i * hop_size
        frame = signal_padded[start:start + win_size] * window
        
        # 填充到n_fft长度
        if len(frame) < n_fft:
            frame = np.pad(frame, (0, n_fft - len(frame)), mode='constant')
        
        # FFT并取单边频谱
        fft_frame = np.fft.rfft(frame, n=n_fft)
        stft_matrix[:, i] = fft_frame
    
    # 计算幅度和相位
    magnitude = np.power(np.abs(stft_matrix), compress_factor)
    phase = np.angle(stft_matrix)
    
    # 添加批次维度 [1, freq_bins, time_frames]
    magnitude = magnitude[np.newaxis, :, :]
    phase = phase[np.newaxis, :, :]
    
    return magnitude, phase

def mag_pha_istft(magnitude_compressed, phase, n_fft=400, hop_size=100, win_size=400, compress_factor=0.3):
    """ISTFT变换"""
    # 去除批次维度
    magnitude_compressed = magnitude_compressed[0]
    phase = phase[0]
    
    # 恢复幅度
    magnitude = np.power(magnitude_compressed, 1.0 / compress_factor)
    
    # 重建复数STFT
    stft_complex = magnitude * np.exp(1j * phase)
    
    # 创建汉宁窗
    window = scipy.signal.get_window('hann', win_size)
    
    # 手动实现ISTFT
    n_frames = stft_complex.shape[1]
    expected_signal_len = win_size + hop_size * (n_frames - 1)
    signal = np.zeros(expected_signal_len)
    window_sum = np.zeros(expected_signal_len)
    
    for i in range(n_frames):
        start = i * hop_size
        
        # 逆FFT
        frame_complex = stft_complex[:, i]
        # 创建完整的频谱（镜像负频率部分）
        full_fft = np.zeros(n_fft, dtype=np.complex128)
        full_fft[:n_fft // 2 + 1] = frame_complex
        if n_fft % 2 == 0:
            full_fft[n_fft // 2 + 1:] = np.conj(frame_complex[-2:0:-1])
        else:
            full_fft[n_fft // 2 + 1:] = np.conj(frame_complex[-1:0:-1])
        
        # IFFT
        frame_time = np.real(np.fft.ifft(full_fft))[:win_size]
        
        # 应用窗函数并累加
        windowed_frame = frame_time * window
        signal[start:start + win_size] += windowed_frame
        window_sum[start:start + win_size] += window ** 2
    
    # 归一化
    window_sum = np.maximum(window_sum, 1e-10)
    signal = signal / window_sum
    
    # 去除填充
    pad_length = n_fft // 2
    if len(signal) > 2 * pad_length:
        signal = signal[pad_length:-pad_length]
    
    return signal

def preprocess_audio(input_path, target_sr=16000):
    """预处理音频"""
    try:
        audio, sr = librosa.load(input_path, sr=None, mono=False)
        
        needs_preprocessing = False
        preprocessing_steps = []
        
        if audio.ndim > 1:
            preprocessing_steps.append(f"{audio.shape[0]}ch→mono")
            audio = np.mean(audio, axis=0)
            needs_preprocessing = True
        
        if sr != target_sr:
            preprocessing_steps.append(f"{sr}Hz→{target_sr}Hz")
            audio = librosa.resample(audio, orig_sr=sr, target_sr=target_sr)
            needs_preprocessing = True
        
        max_val = np.max(np.abs(audio))
        if max_val > 1.0:
            audio = audio / max_val
            preprocessing_steps.append("normalized")
            needs_preprocessing = True
        
        if needs_preprocessing and preprocessing_steps:
            print(f"  预处理: {', '.join(preprocessing_steps)}")
        
        return audio, target_sr, needs_preprocessing
        
    except Exception as e:
        print(f"❌ 错误：{e}")
        return None, None, False

def denoise_audio(input_path, output_path, onnx_model_path='./speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx', 
                  force_cpu=False, use_gpu_chunked=True, chunk_duration=2.0, overlap_duration=0.2, verbose=False):
    """音频降噪主函数"""
    start_total = time.time()
    
    wav, fs, was_preprocessed = preprocess_audio(input_path)
    if wav is None:
        return None
    
    audio_duration = len(wav)/fs
    print(f"处理: {input_path} [{audio_duration:.1f}s, {fs}Hz]")
    
    need_chunking = (not force_cpu and use_gpu_chunked and audio_duration > 3.0 
                     and 'CUDAExecutionProvider' in onnxruntime.get_available_providers())
    
    available_providers = onnxruntime.get_available_providers()
    providers = []
    
    if force_cpu:
        providers = ['CPUExecutionProvider']
        if verbose:
            print("⚠️ 强制使用CPU模式")
    else:
        if 'CUDAExecutionProvider' in available_providers:
            providers.append(('CUDAExecutionProvider', {
                'device_id': 0,
                'cudnn_conv_algo_search': 'EXHAUSTIVE',
                'do_copy_in_default_stream': True,
            }))
        providers.append('CPUExecutionProvider')
    
    sess_options = onnxruntime.SessionOptions()
    sess_options.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess_options.enable_mem_pattern = True
    sess_options.enable_mem_reuse = True
    
    if not force_cpu and 'CUDAExecutionProvider' in available_providers:
        sess_options.inter_op_num_threads = 1
        sess_options.intra_op_num_threads = 1
    
    session = onnxruntime.InferenceSession(onnx_model_path, sess_options, providers=providers)
    active_provider = session.get_providers()[0]
    
    device_info = "CPU"
    if 'CUDA' in active_provider:
        device_info = "GPU"
    
    print(f"  设备: {device_info}")
    if need_chunking:
        print(f"  模式: 分块处理 ({chunk_duration}s块/{overlap_duration}s重叠)")
    
    start_inference = time.time()
    
    if need_chunking:
        chunk_samples = int(chunk_duration * fs)
        overlap_samples = int(overlap_duration * fs)
        hop_samples = chunk_samples - overlap_samples
        
        processed_chunks = []
        num_chunks = max(1, int(np.ceil((len(wav) - overlap_samples) / hop_samples)))
        
        print(f"  进度: ", end='', flush=True)
        
        for i in range(num_chunks):
            start_idx = i * hop_samples
            end_idx = min(start_idx + chunk_samples, len(wav))
            chunk = wav[start_idx:end_idx]
            
            if len(chunk) < chunk_samples:
                chunk = np.pad(chunk, (0, chunk_samples - len(chunk)), mode='constant')
            
            # 归一化
            rms = np.sqrt(np.mean(chunk ** 2))
            norm_factor = 1.0 / (rms + 1e-10)
            normalized_chunk = chunk * norm_factor
            
            # STFT
            chunk_amp, chunk_pha = mag_pha_stft(normalized_chunk)
            
            # ONNX推理
            ort_inputs = {
                session.get_inputs()[0].name: chunk_amp.astype(np.float32),
                session.get_inputs()[1].name: chunk_pha.astype(np.float32)
            }
            ort_outs = session.run(None, ort_inputs)
            
            # ISTFT
            enhanced_chunk = mag_pha_istft(ort_outs[0], ort_outs[1])
            
            # 反归一化
            enhanced_chunk = enhanced_chunk / norm_factor
            
            if end_idx - start_idx < chunk_samples:
                enhanced_chunk = enhanced_chunk[:end_idx - start_idx]
            
            processed_chunks.append(enhanced_chunk)
            
            print(f"{'█' * int((i+1)/num_chunks*20):<20}", end='\r  进度: ', flush=True)
        
        print("████████████████████")
        
        # 合并chunks
        if len(processed_chunks) == 1:
            enhanced_wav = processed_chunks[0]
        else:
            enhanced_wav = np.zeros(len(wav))
            weights = np.zeros(len(wav))
            
            for i, chunk in enumerate(processed_chunks):
                start_idx = i * hop_samples
                end_idx = start_idx + len(chunk)
                
                chunk_weights = np.ones(len(chunk))
                if i > 0 and overlap_samples > 0:
                    fade_in = np.linspace(0, 1, overlap_samples)
                    chunk_weights[:overlap_samples] = fade_in
                if i < len(processed_chunks) - 1 and overlap_samples > 0:
                    fade_out = np.linspace(1, 0, overlap_samples)
                    chunk_weights[-overlap_samples:] = fade_out
                
                enhanced_wav[start_idx:end_idx] += chunk * chunk_weights
                weights[start_idx:end_idx] += chunk_weights
            
            enhanced_wav = enhanced_wav / (weights + 1e-10)
    
    else:
        # 归一化
        rms = np.sqrt(np.mean(wav ** 2))
        norm_factor = 1.0 / (rms + 1e-10)
        normalized_wav = wav * norm_factor
        
        # STFT
        noisy_amp, noisy_pha = mag_pha_stft(normalized_wav)
        
        # ONNX推理
        ort_inputs = {
            session.get_inputs()[0].name: noisy_amp.astype(np.float32),
            session.get_inputs()[1].name: noisy_pha.astype(np.float32)
        }
        ort_outs = session.run(None, ort_inputs)
        
        # ISTFT
        enhanced_wav = mag_pha_istft(ort_outs[0], ort_outs[1])
        
        # 反归一化
        enhanced_wav = enhanced_wav / norm_factor
    
    inference_time = time.time() - start_inference
    
    # 保存音频
    enhanced_wav = np.clip(enhanced_wav, -1.0, 1.0)
    sf.write(output_path, (enhanced_wav * 32767).astype(np.int16), fs)
    
    total_time = time.time() - start_total
    realtime_factor = audio_duration/total_time
    
    print(f"✓ 完成: {output_path} [{total_time:.1f}s, {realtime_factor:.1f}x实时]")
    
    if verbose:
        print(f"\n📊 详细统计:")
        print(f"  处理时间: {inference_time:.2f}s")
        print(f"  实时倍率: {realtime_factor:.1f}x")
        print(f"  能量比值: {np.sum(enhanced_wav ** 2)/np.sum(wav ** 2):.2f}")
    
    return enhanced_wav

if __name__ == "__main__":
    verbose = '--verbose' in sys.argv or '-v' in sys.argv
    if verbose:
        sys.argv = [arg for arg in sys.argv if arg not in ['--verbose', '-v']]
    
    if len(sys.argv) < 2:
        input_audio = "./speech_zipenhancer_ans_multiloss_16k_base/examples/noisy_sample.wav"
        output_audio = "enhanced_audio.wav"
    elif len(sys.argv) == 2:
        input_audio = sys.argv[1]
        output_audio = "enhanced_audio.wav"
    else:
        input_audio = sys.argv[1]
        output_audio = sys.argv[2]
    
    try:
        denoise_audio(input_audio, output_audio, verbose=verbose)
    except Exception as e:
        print(f"❌ 错误：{e}")
        print("使用: python zipenhancer.py [input.wav] [output.wav] [--verbose|-v]")