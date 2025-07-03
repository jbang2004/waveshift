/**
 * API 通用工具函数
 * 统一处理 Cloudflare Workers 环境下的 API 路由模式
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { AuthTokens } from '@/lib/auth/jwt';
import { z } from 'zod';
import { getDomainConfig, getCookieOptions, logDomainDebugInfo } from '@/lib/domain-utils';

// Cloudflare 环境接口
export interface CloudflareEnv {
  DB: D1Database;
  MEDIA_STORAGE?: R2Bucket;  // 统一媒体存储桶
  JWT_SECRET?: string;
  AUTH_SECRET?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  WORKFLOW_CALLBACK_SECRET?: string;
  [key: string]: any;
}

// API 响应统一格式
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: any;
}

// API 错误类型
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 获取 Cloudflare 环境和数据库连接
 */
export async function getCloudflareDB(): Promise<{
  env: CloudflareEnv;
  db: ReturnType<typeof drizzle>;
}> {
  const context = await getCloudflareContext({ async: true });
  const env = context.env as CloudflareEnv;
  
  if (!env.DB) {
    throw new ApiError(500, 'Database configuration error');
  }
  
  const db = drizzle(env.DB);
  return { env, db };
}

/**
 * 获取 JWT 密钥
 */
export function getJWTSecret(env: CloudflareEnv): string {
  const jwtSecret = env.JWT_SECRET || env.AUTH_SECRET;
  if (!jwtSecret) {
    throw new ApiError(500, 'JWT secret not configured');
  }
  return jwtSecret;
}

/**
 * 验证用户身份认证
 */
export async function verifyAuthentication(request: NextRequest, env: CloudflareEnv) {
  // 从 cookies 获取令牌
  const token = request.cookies.get('access_token')?.value;
  
  if (!token) {
    throw new ApiError(401, 'Authentication required');
  }
  
  // 验证令牌
  const jwtSecret = getJWTSecret(env);
  const payload = await AuthTokens.verifyAccessToken(token, jwtSecret);
  
  if (!payload) {
    throw new ApiError(401, 'Invalid or expired token');
  }
  
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    image: payload.image,
  };
}

/**
 * 验证工作流回调认证
 */
export function verifyWorkflowCallback(request: NextRequest, env: CloudflareEnv) {
  const authHeader = request.headers.get('x-workflow-auth');
  const expectedSecret = env.WORKFLOW_CALLBACK_SECRET || 'waveshift-callback-secret-2025';
  
  if (authHeader !== expectedSecret) {
    throw new ApiError(401, 'Unauthorized workflow callback');
  }
}

/**
 * 统一的 API 错误响应格式
 */
export function createErrorResponse(error: Error | ApiError, isDevelopment = false): NextResponse {
  let statusCode = 500;
  let message = 'Internal server error';
  let details = undefined;
  
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    details = error.details;
  } else {
    message = error.message;
  }
  
  const response: ApiResponse = {
    success: false,
    error: message,
    ...(details && { details }),
    ...(isDevelopment && { stack: error.stack?.substring(0, 500) })
  };
  
  return NextResponse.json(response, { status: statusCode });
}

/**
 * 统一的 API 成功响应格式
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  statusCode = 200
): NextResponse {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(message && { message })
  };
  
  return NextResponse.json(response, { status: statusCode });
}

// Next.js 路由上下文类型
interface RouteContext {
  params: Record<string, string>;
}

/**
 * 处理 API 路由的通用包装器
 */
export function withApiHandler<T = any>(
  handler: (request: NextRequest, params?: any) => Promise<T>
) {
  return async (request: NextRequest, context?: RouteContext) => {
    try {
      const result = await handler(request, context?.params);
      return createSuccessResponse(result);
    } catch (error) {
      console.error('API Error:', error);
      const isDevelopment = process.env.NODE_ENV === 'development';
      return createErrorResponse(error as Error, isDevelopment);
    }
  };
}

/**
 * 需要身份认证的 API 路由包装器
 */
export function withAuth<T = any>(
  handler: (request: NextRequest, user: any, params?: any) => Promise<T>
) {
  return async (request: NextRequest, context?: RouteContext) => {
    try {
      const { env } = await getCloudflareDB();
      const user = await verifyAuthentication(request, env);
      const result = await handler(request, user, context?.params);
      return createSuccessResponse(result);
    } catch (error) {
      console.error('API Auth Error:', error);
      const isDevelopment = process.env.NODE_ENV === 'development';
      return createErrorResponse(error as Error, isDevelopment);
    }
  };
}

/**
 * 工作流回调 API 路由包装器
 */
export function withWorkflowCallback<T = any>(
  handler: (request: NextRequest, params?: any) => Promise<T>
) {
  return async (request: NextRequest, context?: RouteContext) => {
    try {
      const { env } = await getCloudflareDB();
      verifyWorkflowCallback(request, env);
      const result = await handler(request, context?.params);
      return createSuccessResponse(result);
    } catch (error) {
      console.error('API Workflow Error:', error);
      const isDevelopment = process.env.NODE_ENV === 'development';
      return createErrorResponse(error as Error, isDevelopment);
    }
  };
}

/**
 * 验证请求数据
 */
export function validateRequestData<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): T {
  const validation = schema.safeParse(data);
  if (!validation.success) {
    const errorDetails = validation.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
    throw new ApiError(400, 'Invalid request data', errorDetails);
  }
  return validation.data;
}

/**
 * 设置 JWT Cookie
 */
export function setJWTCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  request: NextRequest
): void {
  // 获取域名配置
  const domainConfig = getDomainConfig(request);
  
  // 调试日志（仅开发环境）
  logDomainDebugInfo(request, domainConfig);
  
  // 获取Cookie过期时间配置
  const authCookieMaxAge = parseInt(process.env.AUTH_COOKIE_MAX_AGE || '604800'); // 默认7天
  const accessTokenMaxAge = 15 * 60; // 15分钟
  const refreshTokenMaxAge = authCookieMaxAge; // 7天（可配置）
  
  // 统一的Cookie配置
  const accessTokenOptions = getCookieOptions(domainConfig, accessTokenMaxAge);
  const refreshTokenOptions = getCookieOptions(domainConfig, refreshTokenMaxAge);
  
  // 设置访问令牌Cookie
  response.cookies.set('access_token', accessToken, accessTokenOptions);
  
  // 设置刷新令牌Cookie
  response.cookies.set('refreshToken', refreshToken, refreshTokenOptions);
  
  // 开发环境调试日志
  if (process.env.NODE_ENV === 'development') {
    console.log('🍪 Setting JWT Cookies:', {
      accessTokenOptions,
      refreshTokenOptions,
      domain: domainConfig.cookieDomain,
    });
  }
}

/**
 * 清除认证 Cookie
 * 使用与设置时相同的配置确保Cookie能被正确清除
 */
export function clearAuthCookies(response: NextResponse, request: NextRequest): void {
  // 获取域名配置（与设置时使用相同配置）
  const domainConfig = getDomainConfig(request);
  
  // 调试日志（仅开发环境）
  logDomainDebugInfo(request, domainConfig);
  
  // 获取清除Cookie的配置（maxAge=0表示立即过期）
  const clearOptions = getCookieOptions(domainConfig, 0);
  
  // 清除访问令牌Cookie
  response.cookies.set('access_token', '', clearOptions);
  
  // 清除刷新令牌Cookie
  response.cookies.set('refreshToken', '', clearOptions);
  
  // 开发环境调试日志
  if (process.env.NODE_ENV === 'development') {
    console.log('🗑️ Clearing JWT Cookies:', {
      clearOptions,
      domain: domainConfig.cookieDomain,
    });
  }
}

/**
 * 生成安全的用户 ID
 */
export function generateUserId(): string {
  return crypto.randomUUID();
}

/**
 * 生成安全的任务 ID
 */
export function generateTaskId(): string {
  return crypto.randomUUID();
}