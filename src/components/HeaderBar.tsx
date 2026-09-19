import React from 'react';
import { User, LogOut, MessageSquare } from 'lucide-react';
import { UserProfile } from '../types';
import { DiraLogo } from './DiraLogo';

interface HeaderBarProps {
  currentUser: UserProfile | null;
  onOpenAuthModal: () => void;
  onOpenHotlineModal?: () => void;
  onOpenEmergencyReport?: () => void;
  onOpenDatabaseModal?: () => void;
  onOpenNotifications?: () => void;
  onNavigateToChat?: () => void;
  bgTrackingActive?: boolean;
  onLogout?: () => void;
  pendingCasesCount?: number;
  unreadNotificationsCount?: number;
  unreadChatCount?: number;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentUser,
  onOpenAuthModal,
  onLogout,
  onNavigateToChat,
  unreadChatCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-2xs select-none pt-safe w-full max-w-full overflow-hidden">
      <div className="max-w-4xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">
        {/* Brand: Official DIRA Logo and Name */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <DiraLogo size="sm" showText={true} />
        </div>

        {/* User Controls & Chat Quick Action */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onNavigateToChat && (
            <button
              id="header-chat-btn"
              onClick={onNavigateToChat}
              className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 hover:bg-emerald-50 text-zinc-700 hover:text-emerald-700 border border-zinc-200 transition-all active:scale-95 touch-manipulation"
              title="Community Broadcast Chat"
              aria-label="Open Chat"
            >
              <MessageSquare className="w-4 h-4" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-emerald-600 text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white shadow-xs animate-bounce">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </button>
          )}

          {currentUser ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* User Icon & Name */}
              <button
                id="header-user-profile-btn"
                onClick={onOpenAuthModal}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition-all active:scale-95 touch-manipulation"
                title="User Profile / Switch Account"
                aria-label="User Profile"
              >
                <User className="w-4 h-4 text-zinc-700 shrink-0" />
                <span className="max-w-[80px] sm:max-w-[120px] truncate text-xs font-semibold">
                  {currentUser.name.split(' ')[0]}
                </span>
                {currentUser.role === 'super_admin' && (
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-700 text-white tracking-wider">
                    ADMIN
                  </span>
                )}
              </button>

              {/* Log Out */}
              {onLogout && (
                <button
                  id="header-logout-btn"
                  onClick={onLogout}
                  className="flex items-center gap-1 p-2 sm:px-3 sm:py-2 min-h-[40px] rounded-xl bg-zinc-100 hover:bg-red-50 text-zinc-600 hover:text-red-700 border border-zinc-200 transition-all active:scale-95 shrink-0 text-xs font-semibold touch-manipulation"
                  title="Log Out (Ondoka)"
                  aria-label="Log Out"
                >
                  <LogOut className="w-4 h-4 shrink-0 text-zinc-600 group-hover:text-red-700" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              )}
            </div>
          ) : (
            <button
              id="header-login-btn"
              onClick={onOpenAuthModal}
              className="bg-zinc-900 hover:bg-zinc-800 text-white px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all border border-zinc-800 shrink-0 touch-manipulation"
              title="Log In"
            >
              <User className="w-4 h-4 text-zinc-300" />
              <span>Log In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

