import {
  Plus,
  Video,
  X,
  Play,
  PauseCircle,
  Sparkles,
  Volume2,
  User,
  Settings,
  FileText,
  Download,
  ChevronDown,
  Upload,
  Mic,
  Globe,
  Languages,
  Zap,
  Image as ImageIcon,
  Music,
  Film,
  Headphones,
  Speaker,
  AudioWaveform
} from 'lucide-react';

// Ionic 图标到 Lucide React 图标的映射
export const iconMap = {
  // 基础操作图标
  addCircle: Plus,
  close: X,
  play: Play,
  pauseCircle: PauseCircle,
  download: Download,
  chevronDown: ChevronDown,
  
  // 媒体相关图标
  videocam: Video,
  volumeHigh: Volume2,
  mic: Mic,
  headset: Headphones,
  musicalNotes: Music,
  film: Film,
  image: ImageIcon,
  
  // 用户和设置图标
  person: User,
  settings: Settings,
  document: FileText,
  
  // 特殊效果图标
  sparkles: Sparkles,
  flash: Zap,
  
  // 语言和翻译图标
  globe: Globe,
  language: Languages,
  
  // 音频相关图标
  speaker: Speaker,
  waveform: AudioWaveform,
  
  // 上传图标
  cloudUpload: Upload,
} as const;

export type IconName = keyof typeof iconMap; 