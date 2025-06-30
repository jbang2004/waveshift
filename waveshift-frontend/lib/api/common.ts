/**
 * API 通用工具函数
 * 统一处理 Cloudflare Workers 环境下的 API 路由模式
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { AuthTokens } from '@/lib/auth/jwt';
import { z } from 'zod';

// Cloudflare 环境接口
export interface CloudflareEnv {
  DB: D1Database;
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
  refreshToken: string
): void {
  // 在 Cloudflare Workers 中，NEXTJS_ENV 更可靠
  const isProduction = process.env.NEXTJS_ENV === 'production' || process.env.NODE_ENV === 'production';
  
  // 在 Cloudflare Workers 中，使用 Set-Cookie 头部
  const cookieSettings = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
  };
  
  // 在 Cloudflare Workers 中，使用较宽松的 SameSite 设置
  const sameSiteValue = isProduction ? 'None' : 'Lax';
  
  // 设置访问令牌 Cookie (15分钟)
  const accessTokenCookie = `access_token=${accessToken}; Path=/; HttpOnly; SameSite=${sameSiteValue}; Max-Age=${15 * 60}${isProduction ? '; Secure' : ''}`;
  response.headers.append('Set-Cookie', accessTokenCookie);
  
  // 设置刷新令牌 Cookie (30天)  
  const refreshTokenCookie = `refreshToken=${refreshToken}; Path=/; HttpOnly; SameSite=${sameSiteValue}; Max-Age=${30 * 24 * 60 * 60}${isProduction ? '; Secure' : ''}`;
  response.headers.append('Set-Cookie', refreshTokenCookie);
  
  // 也尝试 NextJS 的 cookie API 作为备用
  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: sameSiteValue === 'None' ? 'none' : 'lax',
    path: '/',
    maxAge: 15 * 60, // 15 minutes
  });

  response.cookies.set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: sameSiteValue === 'None' ? 'none' : 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
  
}

/**
 * 清除认证 Cookie
 */
export function clearAuthCookies(response: NextResponse): void {
  response.cookies.delete('access_token');
  response.cookies.delete('refreshToken');
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