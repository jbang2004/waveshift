import { NextRequest, NextResponse } from 'next/server';
import { AuthTokens, type JWTPayload } from './jwt';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

/**
 * 认证中间件 - 验证JWT令牌
 */
export async function withAuth(
  handler: (
    request: AuthenticatedRequest,
    params?: any
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest, params?: any): Promise<NextResponse> => {
    try {
      // 获取Cloudflare环境
      const context = await getCloudflareContext({ async: true });
      const env = context.env as any;

      // 从请求头获取令牌
      const authHeader = request.headers.get('authorization');
      const token = AuthTokens.extractTokenFromHeader(authHeader);

      if (!token) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      // 验证令牌
      const jwtSecret = env.JWT_SECRET || env.AUTH_SECRET;
      if (!jwtSecret) {
        console.error('JWT_SECRET not configured');
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        );
      }

      const payload = await AuthTokens.verifyAccessToken(token, jwtSecret);
      if (!payload) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // 将用户信息附加到请求对象
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = payload;

      // 调用原始处理函数
      return handler(authenticatedRequest, params);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}

/**
 * 可选认证中间件 - 如果有令牌则验证，没有也继续
 */
export async function withOptionalAuth(
  handler: (
    request: AuthenticatedRequest,
    params?: any
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest, params?: any): Promise<NextResponse> => {
    try {
      // 获取Cloudflare环境
      const context = await getCloudflareContext({ async: true });
      const env = context.env as any;

      // 从请求头获取令牌
      const authHeader = request.headers.get('authorization');
      const token = AuthTokens.extractTokenFromHeader(authHeader);

      if (token) {
        // 验证令牌
        const jwtSecret = env.JWT_SECRET || env.AUTH_SECRET;
        if (jwtSecret) {
          const payload = await AuthTokens.verifyAccessToken(token, jwtSecret);
          if (payload) {
            // 将用户信息附加到请求对象
            const authenticatedRequest = request as AuthenticatedRequest;
            authenticatedRequest.user = payload;
          }
        }
      }

      // 无论是否有有效令牌，都调用处理函数
      return handler(request as AuthenticatedRequest, params);
    } catch (error) {
      console.error('Optional auth middleware error:', error);
      // 出错时继续执行，但不附加用户信息
      return handler(request as AuthenticatedRequest, params);
    }
  };
}