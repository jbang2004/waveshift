"""
音频分离服务 - 使用audio-separator库进行人声和背景音分离
"""
import logging
import asyncio
import os
from pathlib import Path
from typing import Dict
import gc
import torch

try:
    from audio_separator.separator import Separator
    AUDIO_SEPARATOR_AVAILABLE = True
except ImportError:
    AUDIO_SEPARATOR_AVAILABLE = False
    Separator = None

from config import get_config
from utils.path_manager import PathManager

logger = logging.getLogger(__name__)


class VocalSeparator:
    """
    音频分离服务 - 使用Kim_Vocal模型进行人声和背景音分离
    """
    
    def __init__(self):
        self.config = get_config()
        self.logger = logging.getLogger(__name__)
        
        # 检查audio-separator库是否可用
        if not AUDIO_SEPARATOR_AVAILABLE:
            self.logger.warning("audio-separator库未安装，音频分离功能将不可用")
            self.separator = None
            return
        
        # 分离配置
        self.model_name = getattr(self.config, 'VOCAL_SEPARATION_MODEL', 'Kim_Vocal_2.onnx')
        self.output_format = getattr(self.config, 'VOCAL_SEPARATION_OUTPUT_FORMAT', 'WAV')
        self.sample_rate = getattr(self.config, 'VOCAL_SEPARATION_SAMPLE_RATE', 24000)
        self.timeout = getattr(self.config, 'VOCAL_SEPARATION_TIMEOUT', 300)
        
        # 检测是否有GPU可用
        self.use_gpu = torch.cuda.is_available()
        self.logger.info(f"GPU可用性: {self.use_gpu}")
        
        # 初始化分离器
        try:
            # 设置本地模型目录
            model_dir_str = getattr(self.config, 'AUDIO_SEPARATOR_MODEL_DIR', None)
            if model_dir_str:
                model_dir = Path(model_dir_str)
                if not model_dir.is_absolute():
                    # 如果是相对路径，则相对于项目根目录
                    model_dir = Path(__file__).parent.parent / model_dir_str
                
                if model_dir.exists():
                    self.logger.info(f"使用本地模型目录: {model_dir}")
                else:
                    self.logger.warning(f"本地模型目录不存在: {model_dir}，将使用默认下载目录")
                    model_dir = None
            else:
                model_dir = None
                self.logger.info("未配置本地模型目录，将使用默认下载目录")
            
            # 暂时禁用autocast避免API兼容性问题
            self.separator = Separator(
                log_level=logging.INFO,
                output_format=self.output_format,
                sample_rate=self.sample_rate,
                normalization_threshold=0.9,
                use_autocast=False,  # 暂时禁用autocast避免PyTorch版本兼容性问题
                model_file_dir=str(model_dir) if model_dir else None  # 指定本地模型目录
            )
            
            # 预加载模型
            self.separator.load_model(model_filename=self.model_name)
            self.logger.info(f"VocalSeparator初始化成功，使用模型: {self.model_name}")
            
        except Exception as e:
            self.logger.error(f"VocalSeparator初始化失败: {e}")
            self.separator = None
    
    def is_available(self) -> bool:
        """检查分离器是否可用"""
        return AUDIO_SEPARATOR_AVAILABLE and self.separator is not None
    
    async def separate_complete_audio(self, audio_path: str, path_manager: PathManager) -> Dict:
        """
        对完整音频进行人声和背景音分离
        
        Args:
            audio_path: 原始音频文件路径
            path_manager: 路径管理器，用于获取输出目录
            
        Returns:
            Dict: {
                'success': bool,
                'vocals_path': str or None,
                'instrumental_path': str or None,
                'error': str or None
            }
        """
        if not self.is_available():
            return {
                'success': False,
                'vocals_path': None,
                'instrumental_path': None,
                'error': 'audio-separator库不可用或初始化失败'
            }
        
        if not os.path.exists(audio_path):
            return {
                'success': False,
                'vocals_path': None,
                'instrumental_path': None,
                'error': f'音频文件不存在: {audio_path}'
            }
        
        try:
            self.logger.info(f"开始分离音频: {audio_path}")
            
            # 获取输出目录
            output_dir = path_manager.temp.separated_dir
            
            # 异步执行分离
            separation_result = await asyncio.wait_for(
                asyncio.to_thread(self._separate_audio, audio_path, str(output_dir)),
                timeout=self.timeout
            )
            
            if separation_result['success']:
                # 更新路径管理器
                path_manager.set_separated_paths(
                    separation_result['vocals_path'],
                    separation_result['instrumental_path']
                )
                
                self.logger.info(f"音频分离成功: vocals={separation_result['vocals_path']}, instrumental={separation_result['instrumental_path']}")
            
            return separation_result
            
        except asyncio.TimeoutError:
            error_msg = f"音频分离超时 (>{self.timeout}秒)"
            self.logger.error(error_msg)
            return {
                'success': False,
                'vocals_path': None,
                'instrumental_path': None,
                'error': error_msg
            }
        except Exception as e:
            error_msg = f"音频分离异常: {e}"
            self.logger.error(error_msg)
            return {
                'success': False,
                'vocals_path': None,
                'instrumental_path': None,
                'error': error_msg
            }
        finally:
            # 清理内存
            self._cleanup_memory()
    
    def _separate_audio(self, audio_path: str, output_dir: str) -> Dict:
        """执行音频分离"""
        try:
            # 执行分离
            output_files = self.separator.separate(audio_path)
            
            if not output_files or len(output_files) < 2:
                return {
                    'success': False,
                    'vocals_path': None,
                    'instrumental_path': None,
                    'error': '分离结果文件数量不足'
                }
            
            # 查找分离后的文件
            vocals_path = None
            instrumental_path = None
            
            for file_path in output_files:
                filename = os.path.basename(file_path).lower()
                if 'vocals' in filename or '(vocals)' in filename:
                    vocals_path = file_path
                elif 'instrumental' in filename or '(instrumental)' in filename or 'no_vocal' in filename:
                    instrumental_path = file_path
            
            if not vocals_path or not instrumental_path:
                return {
                    'success': False,
                    'vocals_path': None,
                    'instrumental_path': None,
                    'error': '无法识别分离后的人声和背景音文件'
                }
            
            # 移动文件到指定目录
            output_dir_path = Path(output_dir)
            output_dir_path.mkdir(parents=True, exist_ok=True)
            
            final_vocals_path = output_dir_path / "vocals.wav"
            final_instrumental_path = output_dir_path / "instrumental.wav"
            
            # 移动文件
            os.rename(vocals_path, final_vocals_path)
            os.rename(instrumental_path, final_instrumental_path)
            
            # 清理临时文件
            for file_path in output_files:
                if os.path.exists(file_path) and file_path not in [str(final_vocals_path), str(final_instrumental_path)]:
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass
            
            # 转换为单声道（统一音频格式，避免后续重复转换）
            try:
                import soundfile as sf
                import numpy as np
                
                # 读取分离后的音频
                vocals_data, sr = sf.read(str(final_vocals_path))
                instrumental_data, _ = sf.read(str(final_instrumental_path))
                
                # 如果是立体声，转换为单声道
                if vocals_data.ndim == 2:
                    self.logger.info(f"人声音频是立体声 {vocals_data.shape}，转换为单声道")
                    vocals_data = np.mean(vocals_data, axis=1)
                if instrumental_data.ndim == 2:
                    self.logger.info(f"背景音频是立体声 {instrumental_data.shape}，转换为单声道")
                    instrumental_data = np.mean(instrumental_data, axis=1)
                
                # 重新保存为单声道
                sf.write(str(final_vocals_path), vocals_data, sr, subtype='FLOAT')
                sf.write(str(final_instrumental_path), instrumental_data, sr, subtype='FLOAT')
                
                self.logger.info(f"音频已统一转换为单声道格式")
            except Exception as e:
                self.logger.warning(f"声道转换失败，使用原始格式: {e}")
            
            return {
                'success': True,
                'vocals_path': str(final_vocals_path),
                'instrumental_path': str(final_instrumental_path),
                'error': None
            }
            
        except Exception as e:
            return {
                'success': False,
                'vocals_path': None,
                'instrumental_path': None,
                'error': str(e)
            }
    
    def _cleanup_memory(self):
        """清理内存"""
        gc.collect()
        if self.use_gpu and torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    async def cleanup(self):
        """清理资源"""
        try:
            if self.separator:
                # audio-separator可能不需要显式清理
                pass
            self._cleanup_memory()
            self.logger.info("VocalSeparator资源清理完成")
        except Exception as e:
            self.logger.error(f"VocalSeparator清理失败: {e}")