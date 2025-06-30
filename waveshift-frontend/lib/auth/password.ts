import bcrypt from 'bcryptjs';

export class Password {
  /**
   * 加密密码
   */
  static async hash(password: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * 验证密码
   */
  static async verify(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * 验证密码强度
   */
  static isValid(password: string): { valid: boolean; message?: string } {
    if (password.length < 6) {
      return {
        valid: false,
        message: 'Password must be at least 6 characters long',
      };
    }

    // 可以添加更多密码强度规则
    // 例如：必须包含数字、大小写字母、特殊字符等

    return { valid: true };
  }
}