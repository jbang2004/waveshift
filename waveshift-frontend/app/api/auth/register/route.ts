import { NextRequest } from 'next/server';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Password } from '@/lib/auth/password';
import { AuthTokens } from '@/lib/auth/jwt';
import { z } from 'zod';
import {
  getCloudflareDB,
  getJWTSecret,
  withApiHandler,
  validateRequestData,
  setJWTCookies,
  createSuccessResponse,
  generateUserId,
  ApiError
} from '@/lib/api/common';

// 验证注册输入
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
});

async function handleRegister(request: NextRequest) {
  // 获取 Cloudflare 环境和数据库
  const { env, db } = await getCloudflareDB();
  
  // 解析和验证请求数据
  const body = await request.json();
  const { email, password, name } = validateRequestData(body, registerSchema);

  // 检查用户是否已存在
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (existingUser) {
    throw new ApiError(409, 'User with this email already exists');
  }

  // 验证密码强度
  const passwordValidation = Password.isValid(password);
  if (!passwordValidation.valid) {
    throw new ApiError(400, passwordValidation.message || 'Invalid password');
  }

  // 生成用户 ID 和加密密码
  const userId = generateUserId();
  const hashedPassword = await Password.hash(password);

  // 创建用户记录
  const now = new Date();
  const newUser = {
    id: userId,
    email,
    name,
    hashedPassword,
    emailVerified: null,
    image: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(users).values(newUser).run();

  // 获取 JWT 密钥并生成令牌
  const jwtSecret = getJWTSecret(env);
  const accessToken = await AuthTokens.generateAccessToken(
    {
      sub: userId,
      email,
      name,
    },
    jwtSecret
  );

  const refreshToken = await AuthTokens.generateRefreshToken(userId, jwtSecret);

  // 创建成功响应
  const response = createSuccessResponse(
    {
      user: {
        id: userId,
        email,
        name,
      },
      accessToken,
    },
    'User registered successfully',
    201
  );

  // 设置认证 Cookies（传递request参数用于域名检测）
  setJWTCookies(response, accessToken, refreshToken, request);

  return response;
}

export const POST = withApiHandler(handleRegister);