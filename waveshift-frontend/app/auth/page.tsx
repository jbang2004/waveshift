'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { m as motion } from "@/lib/lazy-motion";
import { Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "next-themes";
import WabiSabiBackground from "@/components/wabi-sabi-background";

export default function AuthPage() {
  const router = useRouter();
  const { user, isLoading, login, register } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { theme } = useTheme();

  // 如果用户已登录，重定向到首页
  useEffect(() => {
    if (user && !isLoading) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  const handleToggleMode = () => {
    setIsRegistering(!isRegistering);
    setEmail("");
    setPassword("");
    setName("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证输入
    if (!email.trim()) {
      toast({
        title: language === "zh" ? "请输入邮箱" : "Email required",
        description: language === "zh" ? "请输入您的邮箱地址" : "Please enter your email",
        variant: "destructive",
      });
      return;
    }
    
    if (!/\S+@\S+\.\S+/.test(email)) {
      toast({
        title: language === "zh" ? "邮箱格式无效" : "Invalid email format",
        description: language === "zh" ? "请输入有效的邮箱地址" : "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (!password) {
      toast({
        title: language === "zh" ? "请输入密码" : "Password required",
        description: language === "zh" ? "请输入您的密码" : "Please enter your password",
        variant: "destructive",
      });
      return;
    }
    
    if (password.length < 6) {
      toast({
        title: language === "zh" ? "密码太短" : "Password too short",
        description: language === "zh" ? "密码至少需要6个字符" : "Password should be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    if (isRegistering) {
      if (!name.trim()) {
        toast({
          title: language === "zh" ? "请输入姓名" : "Name required",
          description: language === "zh" ? "请输入您的姓名" : "Please enter your name",
          variant: "destructive",
        });
        return;
      }

      if (password !== confirmPassword) {
        toast({
          title: language === "zh" ? "密码不匹配" : "Passwords do not match",
          description: language === "zh" ? "请确保两次输入的密码相同" : "Please make sure your passwords match",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isRegistering) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      // 成功后AuthContext会自动处理重定向
    } catch (error) {
      // 错误已在AuthContext中通过toast显示
      console.error('Auth error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  // 如果用户已登录，显示重定向中
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Already logged in, redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* 统一的诧寂美学背景 */}
      <WabiSabiBackground />
      
      {/* 内容区域 */}
      <div className="relative z-10 flex min-h-screen px-6 md:px-10 lg:px-16 py-8">
      <div className="flex w-full flex-col md:flex-row md:items-stretch max-w-6xl mx-auto gap-2 md:gap-4 self-center"> 
        {/* Auth Form Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full md:w-[45%]"
        >
          <div className={`p-4 h-full rounded-3xl ${theme === "dark" ? "bg-zinc-900" : "bg-gray-100"}`}>
            {/* 内容上部区域 - WaveShift Logo 与欢迎文字 */}
            <div className="h-[170px] mb-6 flex flex-col items-center justify-center">
              <div className="mb-4">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="56" height="56" rx="12" fill="black"/>
                  <path d="M28 21.5C28 18.4624 30.4624 16 33.5 16C36.5376 16 39 18.4624 39 21.5C39 24.5376 36.5376 27 33.5 27C30.4624 27 28 24.5376 28 21.5Z" fill="white"/>
                  <path d="M17 21.5C17 18.4624 19.4624 16 22.5 16C25.5376 16 28 18.4624 28 21.5C28 24.5376 25.5376 27 22.5 27C19.4624 27 17 24.5376 17 21.5Z" fill="white"/>
                  <path d="M28 34.5C28 31.4624 30.4624 29 33.5 29C36.5376 29 39 31.4624 39 34.5C39 37.5376 36.5376 40 33.5 40C30.4624 40 28 37.5376 28 34.5Z" fill="white"/>
                  <path d="M17 34.5C17 31.4624 19.4624 29 22.5 29C25.5376 29 28 31.4624 28 34.5C28 37.5376 25.5376 40 22.5 40C19.4624 40 17 37.5376 17 34.5Z" fill="white"/>
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-center">{t("welcomeToKrea")}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t("loginOrSignup")}</p>
            </div>

            <div className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                {isRegistering && (
                  <div className="space-y-2">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder={language === "zh" ? "姓名" : "Name"}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-10 h-12 rounded-xl border-border bg-background"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder={language === "zh" ? "邮箱地址" : "Email address"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 rounded-xl border-border bg-background"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder={language === "zh" ? "密码" : "Password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-12 rounded-xl border-border bg-background"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {isRegistering && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder={language === "zh" ? "确认密码" : "Confirm password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 h-12 rounded-xl border-border bg-background"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-5 rounded-xl"
                  disabled={isSubmitting}
                >
                  {isSubmitting 
                      ? (language === "zh" ? "处理中..." : "Processing...") 
                      : isRegistering 
                          ? (language === "zh" ? "注册" : "Sign Up") 
                          : (language === "zh" ? "登录" : "Login")}
                  {isSubmitting && (
                    <svg className="animate-spin ml-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  )}
                </Button>

                <div className="text-center text-sm">
                  <span className="text-muted-foreground">
                    {isRegistering 
                      ? (language === "zh" ? "已有账户？" : "Already have an account?") 
                      : (language === "zh" ? "还没有账户？" : "Don't have an account?")}
                  </span>
                  <button
                    type="button"
                    className="text-primary ml-1 hover:underline"
                    onClick={handleToggleMode}
                    disabled={isSubmitting}
                  >
                    {isRegistering 
                      ? (language === "zh" ? "登录" : "Login") 
                      : (language === "zh" ? "注册" : "Sign up")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </motion.div>

        {/* Feature Preview Section */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="hidden md:flex md:w-[55%] items-center justify-center"
        >
          <div className={`p-8 w-full h-full rounded-3xl ${theme === "dark" ? "bg-zinc-900" : "bg-gray-100"}`}>
            <div className="h-full flex flex-col justify-center">
              <h2 className="text-3xl font-bold mb-4">
                {language === "zh" ? "AI音视频处理平台" : "AI Audio & Video Platform"}
              </h2>
              <p className="text-muted-foreground mb-6">
                {language === "zh" 
                  ? "体验最先进的AI技术，轻松处理音频转录、文本配音、视频翻译等任务。" 
                  : "Experience cutting-edge AI technology for audio transcription, text-to-speech, video translation and more."}
              </p>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>{language === "zh" ? "实时音频转录" : "Real-time Audio Transcription"}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>{language === "zh" ? "多语言文本配音" : "Multi-language Text-to-Speech"}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span>{language === "zh" ? "智能视频翻译" : "Intelligent Video Translation"}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      </div>
    </div>
  );
}