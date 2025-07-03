import { NextRequest, NextResponse } from 'next/server';
import { AuthTokens } from '@/lib/auth/jwt';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getAccessToken } from '@/lib/cookie-utils';

// 受保护的路由 - 导航栏的三个功能页面需要登录后才能访问
const protectedRoutes = [
  '/protected', 
  '/audio-transcription', 
  '/text-to-speech', 
  '/video-translation'
];

// 需要认证的API路由
const protectedApiRoutes = ['/api/auth/me'];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 检查是否是受保护的路由
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isProtectedApi = protectedApiRoutes.some(route => pathname.startsWith(route));


  if (isProtectedRoute || isProtectedApi) {
    try {
      // 使用增强的Cookie读取函数
      const token = getAccessToken(request);
      
      // 输出详细调试信息
      console.error('🍪 [Middleware] Enhanced token reading result:', !!token);
      console.error('🍪 [Middleware] Host:', request.headers.get('host'));
      console.error('🍪 [Middleware] Path:', pathname);
      
      if (!token) {
        console.error('🚫 [Middleware] No access token found');
        if (isProtectedRoute) {
          console.error('🚫 [Middleware] Redirecting to /auth for protected route:', pathname);
          return NextResponse.redirect(new URL('/auth', request.url));
        } else {
          console.error('🚫 [Middleware] Returning 401 for protected API:', pathname);
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
      }
      
      console.error('✅ [Middleware] Access token found, proceeding with verification');

      // 验证令牌
      const context = await getCloudflareContext({ async: true });
      const env = context.env as any;
      const jwtSecret = env.JWT_SECRET || env.AUTH_SECRET;

      if (!jwtSecret) {
        console.error('JWT_SECRET not configured');
        if (isProtectedRoute) {
          return NextResponse.redirect(new URL('/auth', request.url));
        } else {
          return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }
      }

      const payload = await AuthTokens.verifyAccessToken(token, jwtSecret);
      if (!payload) {
        if (isProtectedRoute) {
          return NextResponse.redirect(new URL('/auth', request.url));
        } else {
          return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
        }
      }

      // 令牌有效，继续请求
      return NextResponse.next();
    } catch (error) {
      console.error('Middleware auth error:', error);
      if (isProtectedRoute) {
        return NextResponse.redirect(new URL('/auth', request.url));
      } else {
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 明确匹配需要保护的路由
    '/audio-transcription',
    '/text-to-speech', 
    '/video-translation',
    '/protected',
    '/api/auth/me'
  ],
};
