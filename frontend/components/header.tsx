'use client';

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useLanguage, TranslationKey } from "@/hooks/use-language";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useAuth } from "@/contexts/auth-context";
import { 
  HomeIcon, 
  MicrophoneIcon, 
  SpeakerWaveIcon, 
  VideoCameraIcon, 
  SunIcon, 
  MoonIcon, 
  GlobeAltIcon, 
  Bars3Icon, 
  XMarkIcon, 
  UserIcon,
  WalletIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon
} from "@heroicons/react/24/solid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  path: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
};

const NavItems: NavItem[] = [
  {
    path: "/",
    labelKey: "home",
    icon: HomeIcon,
  },
  {
    path: "/audio-transcription",
    labelKey: "audioTranscription",
    icon: MicrophoneIcon,
  },
  {
    path: "/text-to-speech",
    labelKey: "textToSpeech",
    icon: SpeakerWaveIcon,
  },
  {
    path: "/video-translation",
    labelKey: "videoTranslation",
    icon: VideoCameraIcon,
  },
];

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useMobile();
  const { t, language: currentLanguage, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { user, isLoading: authLoading, logout } = useAuth();

  // 移除认证成功标记相关逻辑，新的认证系统不需要这个

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);
  
  const handleLogout = async () => {
    try {
      await logout();
      closeMenu();
    } catch (error) {
      console.error('Logout error:', error);
      closeMenu();
    }
  };

  // 预加载路由
  const handleHoverPrefetch = (path: string) => {
    router.prefetch(path);
  };

  // 处理受保护页面的导航
  const handleProtectedNavigation = (path: string, e: React.MouseEvent) => {
    const protectedPaths = ['/audio-transcription', '/text-to-speech', '/video-translation'];
    
    // 如果还在加载认证状态，不拦截导航（让middleware处理）
    if (authLoading) {
      return;
    }
    
    // 只有当明确用户未登录且试图访问受保护路径时才拦截
    if (protectedPaths.includes(path) && !user) {
      e.preventDefault();
      router.push('/auth');
      return;
    }
    
    // 其他情况（包括用户已登录或正在验证）都允许正常导航，让middleware处理最终验证
  };

  // 获取用户显示名称
  const getUserDisplayName = () => {
    if (!user) return '';
    return user.name || user.email || 'User';
  };

  // 获取用户头像
  const getUserAvatar = () => {
    if (user?.image) return user.image;
    return null;
  };

  return (
    <header className="sticky top-0 z-50 bg-transparent w-full py-4">
      <div className="w-full px-2 sm:px-4 md:px-6 flex items-center justify-between h-12">
        {/* Logo */}
        <div className="flex items-center">
          <Link 
            href="/" 
            prefetch
            onClick={closeMenu} 
            onMouseEnter={() => handleHoverPrefetch("/")}
            className="flex items-center justify-center h-11 w-11 bg-white/60 dark:bg-gray-800/60 rounded-xl shadow-sm hover:bg-white/70 dark:hover:bg-gray-700/70 transition-colors backdrop-blur-md"
          >
            <Image 
              src="/logo.png" 
              alt="声渡" 
              width={28}
              height={28}
              className="w-7 h-7 object-contain"
            />
          </Link>
        </div>

        {/* Navigation - Floating center menu */}
        <div 
          className="hidden md:flex items-center bg-gray-100/90 dark:bg-gray-800/80 rounded-2xl px-3 py-2 absolute left-1/2 transform -translate-x-1/2 shadow-sm backdrop-blur-md"
        >
          {NavItems.map((item, index) => (
            <div 
              key={item.path} 
              className={cn(
                "relative group",
                index === 0 ? "ml-0" : "ml-1",
                index === NavItems.length - 1 ? "mr-0" : "mr-1"
              )}
            >
              <Link 
                href={item.path}
                prefetch
                onClick={(e) => {
                  handleProtectedNavigation(item.path, e);
                }}
                onMouseEnter={() => handleHoverPrefetch(item.path)}
                className={cn(
                  "flex items-center justify-center transition-colors",
                  pathname === item.path 
                    ? "bg-white dark:bg-gray-700 shadow-sm px-5 py-2.5 rounded-xl" 
                    : "hover:bg-white/70 dark:hover:bg-gray-700/70 px-5 py-2.5 rounded-xl"
                )}
                aria-label={t(item.labelKey)}
              >
                <item.icon className="h-5 w-5" />
              </Link>
              {/* 悬浮时显示的标题 */}
              <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 bg-gray-200/90 dark:bg-gray-600/90 text-xs font-medium rounded-lg backdrop-blur-md shadow-sm whitespace-nowrap z-10">
                {t(item.labelKey)}
              </div>
            </div>
          ))}
        </div>
        
        {/* Mobile menu button */}
        {isMobile && (
          <button 
            className="h-11 w-11 ml-2 flex items-center justify-center rounded-xl bg-white/60 dark:bg-gray-800/60 hover:bg-white/70 dark:hover:bg-gray-700/70 transition-colors md:hidden shadow-sm backdrop-blur-md"
            onClick={toggleMenu}
            aria-label="Toggle menu"
            disabled={authLoading}
          >
            {isOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
        )}

        {/* Right side menu - Floating buttons */}
        <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="hidden xl:flex h-11 w-11 items-center justify-center rounded-xl bg-white/60 dark:bg-gray-800/60 hover:bg-white/70 dark:hover:bg-gray-700/70 transition-colors shadow-sm backdrop-blur-md"
            aria-label={theme === "dark" ? t("lightMode") : t("darkMode")}
          >
            {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>

          {/* Language switch */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="hidden lg:flex h-11 w-11 items-center justify-center rounded-xl bg-white/60 dark:bg-gray-800/60 hover:bg-white/70 dark:hover:bg-gray-700/70 transition-colors shadow-sm backdrop-blur-md"
                aria-label={t("switchLanguage")}
              >
                <GlobeAltIcon className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLanguage("en")}>
                <span className={cn(currentLanguage === "en" && "font-bold")}>
                  {t("english")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage("zh")}>
                <span className={cn(currentLanguage === "zh" && "font-bold")}>
                  {t("chinese")}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Pricing link */}
          <Link 
            href="/pricing" 
            prefetch
            className="hidden lg:block py-2.5 px-4 sm:px-6 rounded-xl bg-gray-200/60 dark:bg-gray-700/60 text-sm font-medium hover:bg-gray-300/70 dark:hover:bg-gray-600/70 transition-colors shadow-sm backdrop-blur-md"
          >
            {t("pricing")}
          </Link>
          
          {/* User authentication section */}
          {authLoading ? (
            <div className="h-11 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-xl"></div>
          ) : user ? (
            // 已登录用户 - 显示用户菜单
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden md:flex items-center py-2 px-3 rounded-xl bg-white/60 dark:bg-gray-800/60 hover:bg-white/70 dark:hover:bg-gray-700/70 transition-colors shadow-sm backdrop-blur-md">
                  {getUserAvatar() ? (
                    <Image
                      src={getUserAvatar()!}
                      alt={getUserDisplayName()}
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded-full mr-2"
                    />
                  ) : (
                    <UserIcon className="h-5 w-5 mr-2" />
                  )}
                  <span className="text-sm font-medium max-w-20 truncate">
                    {getUserDisplayName()}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 ml-1" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                  <div className="font-medium truncate">{getUserDisplayName()}</div>
                  {user.email && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </div>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
                  <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // 未登录用户 - 显示登录按钮
            <Link 
              href="/auth" 
              prefetch
              className="hidden md:flex items-center py-2.5 px-3 sm:px-4 md:px-6 rounded-xl bg-blue-600/90 hover:bg-blue-700/90 text-white text-xs sm:text-sm font-medium transition-colors shadow-sm backdrop-blur-md"
            >
              <UserIcon className="h-4 w-4 mr-1 sm:mr-2" />
              <span>{t("signUp")}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobile && isOpen && (
        <div className="md:hidden absolute top-20 left-2 right-2 sm:left-4 sm:right-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-xl shadow-lg p-3 sm:p-4 space-y-2 z-50">
          {/* Navigation items */}
          {NavItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              prefetch
              onClick={(e) => {
                handleProtectedNavigation(item.path, e);
                closeMenu();
              }}
              onMouseEnter={() => handleHoverPrefetch(item.path)}
              className={cn(
                "flex items-center space-x-3 p-3 transition-colors rounded-xl",
                pathname === item.path 
                  ? "bg-white/80 dark:bg-gray-700/80 shadow-sm" 
                  : "hover:bg-white/60 dark:hover:bg-gray-700/60"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{t(item.labelKey)}</span>
            </Link>
          ))}
          
          {/* Divider */}
          <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-2 mt-2 space-y-2">
            {/* Pricing */}
            <Link 
              href="/pricing" 
              prefetch
              onClick={closeMenu} 
              onMouseEnter={() => handleHoverPrefetch("/pricing")}
              className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors"
            >
              <WalletIcon className="h-5 w-5" />
              <span className="font-medium">{t("pricing")}</span>
            </Link>
            
            {/* Theme toggle on mobile */}
            <button
              onClick={() => {
                setTheme(theme === "dark" ? "light" : "dark");
                closeMenu();
              }}
              className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors w-full"
            >
              {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
              <span className="font-medium">{theme === "dark" ? t("lightMode") : t("darkMode")}</span>
            </button>
            
            {/* Language switch on mobile */}
            <button
              onClick={() => {
                setLanguage(currentLanguage === "en" ? "zh" : "en");
                closeMenu();
              }}
              className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors w-full"
            >
              <GlobeAltIcon className="h-5 w-5" />
              <span className="font-medium">
                {currentLanguage === "en" ? t("chinese") : t("english")}
              </span>
            </button>
            
            {/* User section */}
            {authLoading ? (
              <div className="h-12 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-xl mx-1"></div>
            ) : user ? (
              <div className="space-y-2">
                {/* User info */}
                <div className="flex items-center space-x-3 p-3 bg-gray-100/60 dark:bg-gray-700/60 rounded-xl">
                  {getUserAvatar() ? (
                    <Image
                      src={getUserAvatar()!}
                      alt={getUserDisplayName()}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <UserIcon className="h-8 w-8 p-1 bg-gray-200 dark:bg-gray-600 rounded-full" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{getUserDisplayName()}</div>
                    {user.email && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {user.email}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Logout button */}
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-3 p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400 w-full"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5" />
                  <span className="font-medium">{t("logout")}</span>
                </button>
              </div>
            ) : (
              <Link 
                href="/auth"
                prefetch
                onClick={closeMenu}
                onMouseEnter={() => handleHoverPrefetch("/auth")}
                className="flex items-center space-x-3 p-3 rounded-xl bg-blue-600/90 hover:bg-blue-700/90 text-white transition-colors"
              >
                <UserIcon className="h-5 w-5" />
                <span className="font-medium">{t("signUp")}</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}