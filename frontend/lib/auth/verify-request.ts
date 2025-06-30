import { NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { AuthTokens } from './jwt';

interface CloudflareEnv {
  JWT_SECRET?: string;
  AUTH_SECRET?: string;
}

export interface AuthResult {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    image?: string;
  };
}

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    // 获取Cloudflare环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as CloudflareEnv;
    
    // 从cookies获取令牌
    const token = request.cookies.get('access_token')?.value;
    
    if (!token) {
      return { authenticated: false };
    }
    
    // 验证令牌
    const jwtSecret = env.JWT_SECRET || env.AUTH_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      return { authenticated: false };
    }
    
    const payload = await AuthTokens.verifyAccessToken(token, jwtSecret);
    
    if (!payload) {
      return { authenticated: false };
    }
    
    return {
      authenticated: true,
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        image: payload.image,
      },
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return { authenticated: false };
  }
}