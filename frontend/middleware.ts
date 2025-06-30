import { NextRequest, NextResponse } from 'next/server';
import { AuthTokens } from '@/lib/auth/jwt';
import { getCloudflareContext } from '@opennextjs/cloudflare';

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
      // 获取令牌
      const token = request.cookies.get('access_token')?.value;
      
      if (!token) {
        if (isProtectedRoute) {
          // 重定向到登录页面
          return NextResponse.redirect(new URL('/auth', request.url));
        } else {
          // API路由返回401
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
      }

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
