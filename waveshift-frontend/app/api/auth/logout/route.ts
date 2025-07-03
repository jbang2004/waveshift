import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/api/common';

export async function POST(request: NextRequest) {
  try {
    // 创建响应
    const response = NextResponse.json(
      {
        message: 'Logout successful',
      },
      { status: 200 }
    );

    // 使用统一的Cookie清除函数（与设置时使用相同的域名配置）
    clearAuthCookies(response, request);

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}