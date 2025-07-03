import type { Metadata } from "next";
import "./globals.css";
import ClientProviders from "./client-providers";
import { cookies } from "next/headers";
import jwt from "@tsndr/cloudflare-worker-jwt";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: "声渡 - 声之所至，渡见世界",
    template: "%s | Wave Shift"
  },
  description: "专业的AI音视频处理平台，提供音频转录、文本配音、视频翻译等服务。声之所至，渡见世界。",
  keywords: ["AI", "音频转录", "文本配音", "视频翻译", "人工智能", "语音处理", "声渡", "audio transcription", "text to speech", "video translation"],
  authors: [{ name: "声渡团队" }],
  creator: "声渡",
  publisher: "声渡",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: defaultUrl,
    title: 'Wave Shift - 声之所至，渡见世界',
    description: '专业的AI音视频处理平台，提供音频转录、文本配音、视频翻译等服务',
    siteName: 'Wave Shift',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wave Shift - 声之所至，渡见世界',
    description: '专业的AI音视频处理平台，提供音频转录、文本配音、视频翻译等服务',
  },
  verification: {
    google: 'your-google-verification-code',
  },
};

interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  image?: string;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 解析 access_token cookie（若存在）
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value as string | undefined;
  
  // 输出详细调试信息（使用console.error确保在生产环境也能看到）
  console.error('🍪 [Layout SSR] access_token found:', !!token);
  if (!token) {
    const allCookies = cookieStore.getAll();
    console.error('🍪 [Layout SSR] No access_token, available cookies:', allCookies.map(c => c.name).join(', '));
  }

  let initialUser: { 
    id: string; 
    email: string; 
    name: string; 
    image?: string; 
  } | null = null;

  if (token) {
    try {
      // 先验证token有效性
      const jwtSecret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
      if (jwtSecret) {
        const isValid = await jwt.verify(token, jwtSecret);
        if (isValid) {
          const decoded = jwt.decode(token);
          if (decoded && decoded.payload) {
            const payload = decoded.payload as JWTPayload;
            initialUser = {
              id: payload.sub,
              email: payload.email,
              name: payload.name,
              image: payload.image ?? undefined,
            };
          }
        }
      } else {
        // 如果没有密钥，降级为仅解码（开发环境）
        const decoded = jwt.decode(token);
        if (decoded && decoded.payload) {
          const payload = decoded.payload as JWTPayload;
          initialUser = {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            image: payload.image ?? undefined,
          };
        }
      }
    } catch {
      /** 忽略解析错误，保持 initialUser 为 null */
    }
  }

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#000000" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased">
        <ClientProviders initialUser={initialUser}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
