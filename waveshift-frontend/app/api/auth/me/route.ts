import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { AuthTokens } from '@/lib/auth/jwt';
import { getAccessToken } from '@/lib/cookie-utils';

export async function GET(request: NextRequest) {
  try {
    // 获取Cloudflare环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;

    // 使用增强的Cookie读取函数
    const token = getAccessToken(request);
    
    // 输出详细调试信息（用console.error确保在生产环境也能看到）
    console.error('🍪 [/api/auth/me] Enhanced token reading result:', !!token);
    console.error('🍪 [/api/auth/me] Host:', request.headers.get('host'));
    console.error('🍪 [/api/auth/me] User-Agent:', request.headers.get('user-agent')?.substring(0, 100));

    if (!token) {
      console.error('🚫 [/api/auth/me] No access token found - returning 401');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    console.error('✅ [/api/auth/me] Access token found, proceeding with verification');

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

    // 返回用户信息（不包含敏感信息）
    return NextResponse.json(
      {
        user: {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          image: payload.image,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Failed to get user information' },
      { status: 500 }
    );
  }
}