'use client';

import { DeployButton } from "@/components/deploy-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import WabiSabiBackground from "@/components/wabi-sabi-background";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  // 如果用户未登录，重定向到登录页面
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth');
    }
  }, [user, isLoading, router]);

  // 显示加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // 如果用户未登录，显示重定向中
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* 统一的诧寂美学背景 */}
      <WabiSabiBackground />
      
      {/* 内容区域 */}
      <div className="relative z-10 min-h-screen flex flex-col items-center">
        <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>WaveShift</Link>
              <div className="flex items-center gap-2">
                <DeployButton />
              </div>
            </div>
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm">Hey, {user.email}!</span>
                <Button onClick={logout} size="sm">Logout</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/auth">Sign up</Link>
                </Button>
              </div>
            )}
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          {children}
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <p>
            Powered by{" "}
            <a
              href="https://nextjs.org/"
              target="_blank"
              className="font-bold hover:underline"
              rel="noreferrer"
            >
              Next.js
            </a>
            {" & "}
            <a
              href="https://developers.cloudflare.com/"
              target="_blank"
              className="font-bold hover:underline"
              rel="noreferrer"
            >
              Cloudflare Workers
            </a>
          </p>
          <ThemeSwitcher />
        </footer>
        </div>
      </div>
    </main>
  );
}