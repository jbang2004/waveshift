'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import Header from "@/components/header";
import { ThemeProvider } from "next-themes";
import { LanguageProvider } from "@/hooks/use-language";
import { MotionProvider } from "@/lib/lazy-motion";
import { PerformanceMonitorClient } from "@/components/performance-monitor-client";
import { AuthProvider } from '@/contexts/auth-context';

// 创建一个查询客户端实例
const queryClient = new QueryClient();

export default function ClientProviders({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: { 
    id: string; 
    email: string; 
    name: string; 
    image?: string; 
  } | null;
}) {
  return (
    <AuthProvider initialUser={initialUser}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <MotionProvider>
              <div className="min-h-screen bg-background text-foreground">
                <Header />
                <main className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-hidden">
                  {children}
                </main>
                <Toaster />
                <PerformanceMonitorClient />
              </div>
            </MotionProvider>
          </ThemeProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
} 