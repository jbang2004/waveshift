/**
 * 媒体URL处理工具类
 * 标准化URL构建和路径提取逻辑，确保跨服务一致性
 */
export class MediaUrlManager {
  private publicDomain: string;
  
  constructor(publicDomain: string) {
    // 清理域名，移除协议前缀
    this.publicDomain = publicDomain.replace(/^https?:\/\//, '');
  }
  
  /**
   * 从相对路径构建完整的公共URL
   * @param relativePath 相对路径，如 "users/123/456/audio.aac"
   * @returns 完整URL，如 "https://media.waveshift.net/users/123/456/audio.aac"
   */
  buildPublicUrl(relativePath: string): string {
    // 确保路径不以斜杠开头
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return `https://${this.publicDomain}/${cleanPath}`;
  }
  
  /**
   * 从完整URL提取相对路径
   * @param fullUrl 完整URL，如 "https://media.waveshift.net/users/123/456/audio.aac"
   * @returns 相对路径，如 "users/123/456/audio.aac"
   */
  extractRelativePath(fullUrl: string): string {
    // 移除协议和域名部分，只保留路径
    return fullUrl.replace(/^https?:\/\/[^\/]+\//, '');
  }
  
  /**
   * 验证URL是否为有效的媒体URL
   * @param url 要验证的URL
   * @returns 是否为有效的媒体URL
   */
  isValidMediaUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === this.publicDomain && parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
  
  /**
   * 标准化路径格式（用户文件路径）
   * @param userId 用户ID
   * @param taskId 任务ID
   * @param fileName 文件名
   * @returns 标准化的相对路径
   */
  buildUserFilePath(userId: string, taskId: string, fileName: string): string {
    return `users/${userId}/${taskId}/${fileName}`;
  }
  
  /**
   * 从用户文件路径中提取组件
   * @param userFilePath 用户文件路径，如 "users/123/456/audio.aac"
   * @returns 路径组件或null（如果格式无效）
   */
  parseUserFilePath(userFilePath: string): {
    userId: string;
    taskId: string;
    fileName: string;
  } | null {
    const match = userFilePath.match(/^users\/([^\/]+)\/([^\/]+)\/(.+)$/);
    if (!match) return null;
    
    const [, userId, taskId, fileName] = match;
    return { userId, taskId, fileName };
  }
}

/**
 * 创建URL管理器实例的工厂函数
 * @param publicDomain R2公共域名
 * @returns MediaUrlManager实例
 */
export function createMediaUrlManager(publicDomain: string): MediaUrlManager {
  return new MediaUrlManager(publicDomain);
}

/**
 * 快速构建媒体文件的公共URL
 * @param publicDomain R2公共域名
 * @param relativePath 相对路径
 * @returns 完整的公共URL
 */
export function buildMediaUrl(publicDomain: string, relativePath: string): string {
  const manager = createMediaUrlManager(publicDomain);
  return manager.buildPublicUrl(relativePath);
}

/**
 * 快速从URL提取相对路径
 * @param publicDomain R2公共域名
 * @param fullUrl 完整URL
 * @returns 相对路径
 */
export function extractMediaPath(publicDomain: string, fullUrl: string): string {
  const manager = createMediaUrlManager(publicDomain);
  return manager.extractRelativePath(fullUrl);
}