import { NextRequest } from 'next/server';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Password } from '@/lib/auth/password';
import { AuthTokens } from '@/lib/auth/jwt';
import { z } from 'zod';
import {
  getCloudflareDB,
  getJWTSecret,
  validateRequestData,
  setJWTCookies,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/api/common';

// 验证登录输入
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

async function handleLogin(request: NextRequest) {
  // 获取 Cloudflare 环境和数据库
  const { env, db } = await getCloudflareDB();
  
  // 解析和验证请求数据
  const body = await request.json();
  const { email, password } = validateRequestData(body, loginSchema);

  // 查找用户
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!user || !user.hashedPassword) {
    throw new Error('Invalid email or password');
  }

  // 验证密码
  const isValidPassword = await Password.verify(password, user.hashedPassword);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  // 获取 JWT 密钥并生成令牌
  const jwtSecret = getJWTSecret(env);
  const accessToken = await AuthTokens.generateAccessToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      image: user.image || undefined,
    },
    jwtSecret
  );

  const refreshToken = await AuthTokens.generateRefreshToken(user.id, jwtSecret);

  // 创建响应
  const response = createSuccessResponse(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
      accessToken,
    },
    'Login successful'
  );

  // 设置认证 Cookies（传递request参数用于域名检测）
  setJWTCookies(response, accessToken, refreshToken, request);

  return response;
}

export const POST = async (request: NextRequest) => {
  try {
    return await handleLogin(request);
  } catch (error) {
    console.error('[Login API] Error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    return createErrorResponse(error as Error, isDevelopment);
  }
};