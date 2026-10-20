import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getTeam, subscribeTeam } from '../../lib/team';
import { Locale, translations } from '../../lib/translations';
import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  Building2,
  MessageCircle,
  Sparkles,
  Database,
  Globe,
  Plus,
  Cloud,
  CloudOff,
  RotateCcw,
  Settings as SettingsIcon,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface AppShellProps {
  currentTab: string;
  chatEnabled?: boolean;
  locale: Locale;
  isCloudConnected: boolean;
  undoToast: { message: string; onUndo: () => void } | null;
  children: React.ReactNode;
  hideTopBar?: boolean;
  onNavigateTab: (tab: string) => void;
  onToggleLocale: () => void;
  onOpenQuickTask: () => void;
  onOpenQuickMeeting: () => void;
  onOpenBackupModal: () => void;
  /** bell and other header extras supplied by the app */
  headerExtras?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  chatEnabled,
  locale,
  isCloudConnected,
  undoToast,
  children,
  hideTopBar,
  onNavigateTab,
  onToggleLocale,
  onOpenQuickTask,
  onOpenQuickMeeting,
  onOpenBackupModal,
  headerExtras,
}) => {
  const t = translations[locale];
  const mainRef = useRef<HTMLElement | null>(null);
  // Every bar can be folded away to give the page the whole screen (remembered)
  const [barsHidden, setBarsHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('alkammah_bars_hidden') === '1';
    } catch {
      return false;
    }
  });
  const toggleBars = () =>
    setBarsHidden((h) => {
      try {
        localStorage.setItem('alkammah_bars_hidden', h ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !h;
    });
  const showBars = !hideTopBar && !barsHidden;

  // Every page starts at the top (otherwise a page opens scrolled to wherever the previous one was)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [currentTab]);

  // only this number re-renders the bar (a new chat message does not re-render the whole app)
  const chatUnread = useSyncExternalStore(subscribeTeam, () => getTeam().unreadTotal);

  const navItems = [
    { id: 'today', label: locale === 'ar' ? 'الموجز اليومي' : 'Today & Briefing', icon: LayoutDashboard },
    { id: 'notebook', label: locale === 'ar' ? 'المفكرة والحبر' : 'Notes & Ink', icon: BookOpen },
    { id: 'planner', label: locale === 'ar' ? 'المهام والتقويم' : 'Tasks & Calendar', icon: Calendar },
    { id: 'directory', label: locale === 'ar' ? 'دليل المؤسسة' : 'Directory', icon: Building2 },
    ...(chatEnabled ? [{ id: 'chat', label: locale === 'ar' ? 'المحادثات' : 'Chat', icon: MessageCircle }] : []),
  ];

  // Mobile bottom bar: the daily-use hubs plus the AI assistant and Settings
  const mobileNavItems = [
    navItems[0],
    navItems[1],
    navItems[2],
    navItems[3],
    ...navItems.slice(4),
    { id: 'assistant', label: locale === 'ar' ? 'سبيرو' : 'Spero', icon: Sparkles },
    { id: 'settings', label: locale === 'ar' ? 'الإعدادات' : 'Settings', icon: SettingsIcon },
  ];

  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className="h-[100dvh] w-full bg-[#f5f5f7] text-[#1d1d1f] flex flex-col font-sans selection:bg-[#0071e3] selection:text-white overflow-hidden min-w-0"
    >
      {/* Top Bar Header (Single Unified Navigation Bar - No Duplicate Sidebars) */}
      {showBars && (
        <header data-shell="header" className="shrink-0 bg-white/85 backdrop-blur-2xl text-[#1d1d1f] border-b border-[#d2d2d7]/80 px-3 sm:px-5 xl:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4 xl:gap-6 min-w-0 shadow-xs z-40">
          {/* Zone 1: Brand wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigateTab('today')}
              className="text-base sm:text-lg font-bold tracking-tight text-[#1d1d1f] whitespace-nowrap shrink-0 hover:text-[#0071e3] transition-colors flex items-center gap-2"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#0071e3] shrink-0" />
              <span>{t.appName}</span>
            </button>
          </div>

          {/* Zone 2: Centered Group - Navigation Hubs + Action Controls grouped together */}
          <div className="flex items-center justify-end sm:justify-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-4xl mx-auto">
            {/* Core Navigation Hubs */}
            <nav className="hidden sm:flex items-center gap-1 sm:gap-1.5 bg-[#f5f5f7] p-1 rounded-2xl border border-[#d2d2d7]/70 shadow-xs">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active =
                  currentTab === item.id ||
                  (item.id === 'planner' && ['planner', 'tasks', 'calendar', 'followup'].includes(currentTab));

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigateTab(item.id === 'planner' ? 'tasks' : item.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      active
                        ? 'bg-white text-[#0071e3] shadow-xs font-bold'
                        : 'text-[#515154] hover:text-[#1d1d1f]'
                    }`}
                  >
                    <span className="relative inline-flex">
                      <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#0071e3]' : 'text-stone-500'}`} />
                      {item.id === 'chat' && chatUnread > 0 && <span className="absolute -top-1.5 -end-2 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold inline-flex items-center justify-center">{chatUnread > 99 ? '99+' : chatUnread}</span>}
                    </span>
                    <span className="hidden xl:inline">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Subtle Divider */}
            <div className="h-5 w-px bg-[#d2d2d7]/80 hidden sm:block" />

            {/* Upper Action Buttons grouped right beside the navigation */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Add Task quick trigger */}
              <button
                onClick={onOpenQuickTask}
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-xl text-xs font-semibold border border-[#d2d2d7]/60 transition-colors whitespace-nowrap shrink-0 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#0071e3]" />
                <span className="hidden xl:inline">{t.addTask}</span>
              </button>

              {/* Ask AI primary action */}
              <button
                onClick={() => onNavigateTab('assistant')}
                className="hidden sm:flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-xl text-xs font-bold shadow-xs transition-all whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t.askAI}</span>
              </button>

              {/* Bilingual Switcher */}
              <button
                onClick={onToggleLocale}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7]/60 text-xs font-bold text-[#1d1d1f] hover:bg-[#e8e8ed] transition-colors shadow-xs"
                title="Toggle English / العربية"
              >
                <Globe className="w-3.5 h-3.5 text-[#0071e3]" />
                <span>{locale === 'en' ? 'عربي' : 'EN'}</span>
              </button>
            </div>
          </div>

          {/* Zone 3: Right accessories (Cloud Sync & Backup) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateTab('settings')}
              className={`p-2 rounded-xl transition-colors hidden sm:flex ${
                currentTab === 'settings' ? 'text-[#0071e3] bg-[#0071e3]/10' : 'text-[#515154] hover:text-[#1d1d1f] hover:bg-black/5'
              }`}
              title={locale === 'ar' ? 'الإعدادات' : 'Settings'}
              aria-label={locale === 'ar' ? 'الإعدادات' : 'Settings'}
            >
              <SettingsIcon className="w-4 h-4" />
            </button>

            {headerExtras}

            {/* Fold the top and bottom bars away */}
            <button
              onClick={toggleBars}
              className="p-2.5 sm:p-2 text-[#515154] hover:text-[#1d1d1f] rounded-xl hover:bg-black/5 transition-colors flex"
              title={locale === 'ar' ? 'إخفاء الأشرطة' : 'Hide bars'}
              aria-label={locale === 'ar' ? 'إخفاء الأشرطة' : 'Hide bars'}
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            {/* Backup / Export */}
            <button
              onClick={onOpenBackupModal}
              className="p-2.5 sm:p-2 text-[#515154] hover:text-[#1d1d1f] rounded-xl hover:bg-black/5 transition-colors flex"
              title={t.export}
              aria-label={t.export}
            >
              <Database className="w-4 h-4" />
            </button>

            {/* Cloud Sync State */}
            <div
              className="hidden xl:flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7]/60 text-[#515154]"
              title={isCloudConnected ? 'Supabase cloud sync active' : 'Offline / local mode'}
            >
              {isCloudConnected ? (
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <CloudOff className="w-3.5 h-3.5 text-stone-500" />
              )}
              <span>{isCloudConnected ? 'Cloud Active' : 'Local Mode'}</span>
            </div>
          </div>
        </header>
      )}

      {/* Workspace Body: Direct single viewport without redundant sidebars */}
      <div className="flex-1 overflow-hidden relative w-full">
        <main
          ref={mainRef}
          className={`h-full w-full ${
            hideTopBar || currentTab === 'notebook'
              ? 'p-0 overflow-hidden'
              : currentTab === 'assistant' || currentTab === 'chat'
              ? 'overflow-hidden p-2 sm:p-6 lg:p-8'
              : 'overflow-y-auto overflow-x-hidden p-3 sm:p-6 lg:p-8 pb-24 sm:pb-8'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (4 Core Hubs) */}
      {showBars && (
        <nav
          data-shell="bottom"
          className="sm:hidden shrink-0 bg-white/95 backdrop-blur-md border-t border-[#d2d2d7]/80 flex items-center justify-around px-2 py-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))]"
        >
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              currentTab === item.id ||
              (item.id === 'planner' && ['planner', 'tasks', 'calendar', 'followup'].includes(currentTab));

            return (
              <button
                key={item.id}
                onClick={() => onNavigateTab(item.id === 'planner' ? 'tasks' : item.id)}
                className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-colors ${
                  active ? 'text-[#0071e3] font-bold' : 'text-[#515154] hover:text-[#1d1d1f]'
                }`}
              >
                <span className="relative inline-flex">
                  <Icon className={`w-4 h-4 ${active ? 'scale-110 text-[#0071e3]' : ''}`} />
                  {item.id === 'chat' && chatUnread > 0 && <span className="absolute -top-1.5 -end-2.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold inline-flex items-center justify-center">{chatUnread > 99 ? '99+' : chatUnread}</span>}
                </span>
                <span className="text-[10px] mt-0.5 leading-tight truncate max-w-[64px]">
                  {item.label.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </nav>
      )}


      {/* Small handle to bring the bars back */}
      {!hideTopBar && barsHidden && (
        <button
          data-shell="restore"
          onClick={toggleBars}
          className={`fixed z-[300] top-[max(0.4rem,env(safe-area-inset-top))] ${locale === 'ar' ? 'left-2' : 'right-2'} min-h-10 min-w-10 rounded-full bg-white/90 shadow-lg border border-[#d2d2d7] flex items-center justify-center text-[#515154]`}
          title={locale === 'ar' ? 'إظهار الأشرطة' : 'Show bars'}
          aria-label={locale === 'ar' ? 'إظهار الأشرطة' : 'Show bars'}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {/* Floating Instant Undo Toast */}
      {undoToast && (
        <div className="fixed bottom-24 sm:bottom-8 left-1/2 -translate-x-1/2 max-w-[92vw] z-[400] bg-white/95 border-s-4 border-s-emerald-500 text-[#1d1d1f] px-4 py-2.5 rounded-2xl shadow-xl border border-[#d2d2d7] flex items-center gap-3 animate-in slide-in-from-bottom duration-150 backdrop-blur-xl">
          <span className="text-sm font-semibold text-[#1d1d1f]" role="status" aria-live="polite">✓ {undoToast.message}</span>
          <button
            onClick={undoToast.onUndo}
            className="flex items-center gap-1 text-xs font-bold text-[#0071e3] hover:text-[#0062c4] bg-[#f5f5f7] px-2.5 py-1 rounded-xl border border-[#d2d2d7] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.undo}</span>
          </button>
        </div>
      )}
    </div>
  );
};
