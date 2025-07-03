import { NextRequest } from 'next/server';

/**
 * 域名配置接口
 */
export interface DomainConfig {
  cookieDomain: string | undefined;
  isPrimaryDomain: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  isSecure: boolean;
}

/**
 * 根据请求头智能检测域名配置
 * 基于业界标准做法：根据Host头动态调整Cookie配置
 */
export function getDomainConfig(request: NextRequest): DomainConfig {
  const host = request.headers.get('host') || '';
  const isProduction = process.env.NEXTJS_ENV === 'production' || process.env.NODE_ENV === 'production';
  
  // 获取环境变量配置
  const configuredCookieDomain = process.env.COOKIE_DOMAIN;
  
  // 判断是否为主域名（waveshift.net）
  if (host.includes('waveshift.net')) {
    return {
      cookieDomain: configuredCookieDomain || '.waveshift.net',
      isPrimaryDomain: true,
      sameSite: 'lax', // 主域名使用lax获得更好的兼容性
      isSecure: isProduction,
    };
  }
  
  // 判断是否为workers.dev域名
  if (host.includes('workers.dev')) {
    return {
      cookieDomain: undefined, // workers.dev不设置domain，避免跨域问题
      isPrimaryDomain: false,
      sameSite: 'lax',
      isSecure: isProduction,
    };
  }
  
  // 开发环境（localhost）
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return {
      cookieDomain: undefined, // 本地开发不设置domain
      isPrimaryDomain: false,
      sameSite: 'lax',
      isSecure: false, // 本地开发不强制HTTPS
    };
  }
  
  // 默认配置（用于其他自定义域名）
  return {
    cookieDomain: configuredCookieDomain,
    isPrimaryDomain: false,
    sameSite: 'lax',
    isSecure: isProduction,
  };
}

/**
 * 检查域名是否在允许列表中
 */
export function isAllowedOrigin(origin: string): boolean {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  return allowedOrigins.includes(origin);
}

/**
 * 获取规范化的域名信息
 */
export function getDomainInfo(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;
  
  return {
    host,
    protocol,
    origin,
    isProduction: process.env.NEXTJS_ENV === 'production',
    isPrimaryDomain: host.includes('waveshift.net'),
    isWorkersDomain: host.includes('workers.dev'),
    isLocalhost: host.includes('localhost') || host.includes('127.0.0.1'),
  };
}

/**
 * 生成Cookie配置对象
 * 用于确保设置和清除Cookie时使用相同的配置
 */
export function getCookieOptions(domainConfig: DomainConfig, maxAge?: number) {
  return {
    httpOnly: true,
    secure: domainConfig.isSecure,
    sameSite: domainConfig.sameSite as 'lax' | 'strict' | 'none',
    path: '/',
    ...(domainConfig.cookieDomain && { domain: domainConfig.cookieDomain }),
    ...(maxAge !== undefined && { maxAge }),
  };
}

/**
 * 调试用：输出域名配置信息
 */
export function logDomainDebugInfo(request: NextRequest, config: DomainConfig) {
  if (process.env.NODE_ENV === 'development') {
    const domainInfo = getDomainInfo(request);
    console.log('🌐 Domain Debug Info:', {
      host: domainInfo.host,
      origin: domainInfo.origin,
      cookieDomain: config.cookieDomain,
      isPrimaryDomain: config.isPrimaryDomain,
      sameSite: config.sameSite,
      isSecure: config.isSecure,
    });
  }
}