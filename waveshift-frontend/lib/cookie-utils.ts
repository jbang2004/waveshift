/**
 * 多域名环境下的Cookie读取工具函数
 * 解决Cloudflare Workers Edge Runtime环境下的Cookie兼容性问题
 */

import { NextRequest } from 'next/server';
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';

/**
 * 增强的Cookie读取函数
 * 在多域名环境下确保能正确读取Cookie
 */
export function getAuthCookie(request: NextRequest | { cookies: RequestCookies }, cookieName: string): string | undefined {
  try {
    // 方法1: 标准方式读取
    const standardValue = request.cookies.get(cookieName)?.value;
    if (standardValue) {
      return standardValue;
    }

    // 方法2: 从原始Cookie头解析（作为备用方案）
    if ('headers' in request) {
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        const cookies = parseCookieHeader(cookieHeader);
        const headerValue = cookies[cookieName];
        if (headerValue) {
          return headerValue;
        }
      }
    }

    return undefined;
  } catch (error) {
    console.error('Cookie读取错误:', error);
    return undefined;
  }
}

/**
 * 解析Cookie头字符串
 */
function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  try {
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...valueParts] = cookie.trim().split('=');
      if (name && valueParts.length > 0) {
        const value = valueParts.join('=');
        cookies[name.trim()] = decodeURIComponent(value.trim());
      }
    });
  } catch (error) {
    console.error('Cookie头解析错误:', error);
  }
  
  return cookies;
}

/**
 * 调试Cookie读取情况
 */
export function debugCookieReading(request: NextRequest, cookieName: string = 'access_token'): void {
  try {
    const host = request.headers.get('host') || 'unknown';
    const standardValue = request.cookies.get(cookieName)?.value;
    const cookieHeader = request.headers.get('cookie');
    
    // 使用console.error确保在生产环境也能看到
    console.error(`🍪 [Debug] Host: ${host}`);
    console.error(`🍪 [Debug] Standard read: ${!!standardValue}`);
    console.error(`🍪 [Debug] Raw cookie header exists: ${!!cookieHeader}`);
    
    if (cookieHeader && !standardValue) {
      const parsedCookies = parseCookieHeader(cookieHeader);
      const headerValue = parsedCookies[cookieName];
      console.error(`🍪 [Debug] Header parsing found token: ${!!headerValue}`);
      console.error(`🍪 [Debug] Available cookies: ${Object.keys(parsedCookies).join(', ')}`);
    }
  } catch (error) {
    console.error('🍪 [Debug] 调试过程出错:', error);
  }
}

/**
 * 获取访问令牌的增强版本
 */
export function getAccessToken(request: NextRequest): string | undefined {
  const token = getAuthCookie(request, 'access_token');
  
  // 在生产环境中也输出调试信息，帮助定位问题
  if (!token) {
    debugCookieReading(request, 'access_token');
  }
  
  return token;
}

/**
 * 获取刷新令牌
 */
export function getRefreshToken(request: NextRequest): string | undefined {
  return getAuthCookie(request, 'refreshToken');
}