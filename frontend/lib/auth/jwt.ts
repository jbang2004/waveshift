import jwt from '@tsndr/cloudflare-worker-jwt';

export interface JWTPayload {
  sub: string; // user id
  email: string;
  name: string;
  image?: string;
  iat?: number;
  exp?: number;
}

export class AuthTokens {
  private static readonly ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
  private static readonly REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days

  /**
   * 生成访问令牌
   */
  static async generateAccessToken(
    payload: Omit<JWTPayload, 'iat' | 'exp'>,
    secret: string
  ): Promise<string> {
    const tokenPayload: JWTPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.ACCESS_TOKEN_EXPIRY,
    };

    return await jwt.sign(tokenPayload, secret);
  }

  /**
   * 生成刷新令牌
   */
  static async generateRefreshToken(
    userId: string,
    secret: string
  ): Promise<string> {
    const payload = {
      sub: userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.REFRESH_TOKEN_EXPIRY,
    };

    return await jwt.sign(payload, secret);
  }

  /**
   * 验证访问令牌
   */
  static async verifyAccessToken(
    token: string,
    secret: string
  ): Promise<JWTPayload | null> {
    try {
      const verified = await jwt.verify(token, secret);
      if (!verified) return null;

      const decoded = jwt.decode(token);
      if (!decoded || !decoded.payload) return null;

      return decoded.payload as JWTPayload;
    } catch (error) {
      console.error('JWT verification error:', error);
      return null;
    }
  }

  /**
   * 验证刷新令牌
   */
  static async verifyRefreshToken(
    token: string,
    secret: string
  ): Promise<{ userId: string } | null> {
    try {
      const verified = await jwt.verify(token, secret);
      if (!verified) return null;

      const decoded = jwt.decode(token);
      if (!decoded || !decoded.payload) return null;

      const payload = decoded.payload as any;
      if (payload.type !== 'refresh') return null;

      return { userId: payload.sub };
    } catch (error) {
      console.error('Refresh token verification error:', error);
      return null;
    }
  }

  /**
   * 从请求头中提取令牌
   */
  static extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
    
    return parts[1];
  }
}