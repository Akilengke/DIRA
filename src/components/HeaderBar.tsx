import React from 'react';
import { PhoneCall, Shield, User, LogIn, LogOut } from 'lucide-react';
import { UserProfile } from '../types';
import { CaritasLogo } from './CaritasLogo';
import { EMERGENCY_HOTLINE, HOTLINE_DISPLAY } from '../data/mockData';

interface HeaderBarProps {
  currentUser: UserProfile | null;
  onOpenAuthModal: () => void;
  onOpenHotlineModal: () => void;
  onLogout?: () => void;
  pendingCasesCount?: number;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentUser,
  onOpenAuthModal,
  onOpenHotlineModal,
  onLogout,
  pendingCasesCount = 0,
}) => {
  const isSuperUser = currentUser?.role === 'super_user';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-2xs select-none pt-safe">
      <div className="max-w-4xl mx-auto px-3.5 sm:px-5 py-2.5 flex items-center justify-between">
        {/* Brand: Caritas Kitui + DIRA Title */}
        <div className="flex items-center gap-2 sm:gap-3">
          <CaritasLogo size="sm" showSubtitle={true} />
          
          <div className="h-6 w-px bg-zinc-200 mx-0.5" />

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-black tracking-tight text-xs sm:text-sm font-display text-zinc-950">
                DIRA
              </span>
              <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-red-50 text-red-800 border border-red-200 uppercase">
                Kaa Rada!
              </span>
            </div>
            <span className="text-[9px] text-zinc-500 font-semibold leading-none hidden xs:inline truncate max-w-[210px]">
              Donkey Incident Reporting APP
            </span>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Emergency Hotline 0800000890 Fast Action */}
          <a
            id="header-tollfree-dial-btn"
            href={`tel:${EMERGENCY_HOTLINE}`}
            className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all border border-red-800"
            title="Call Donkey Welfare Toll-Free Hotline: 0800000890"
          >
            <PhoneCall className="w-3.5 h-3.5 fill-white" />
            <span className="hidden sm:inline">0800 000 890</span>
            <span className="sm:hidden font-mono text-[11px]">0800...</span>
          </a>

          {/* User Account / Role Pill or Log In Button */}
          {currentUser ? (
            <div className="flex items-center gap-1">
              <button
                id="header-user-profile-btn"
                onClick={onOpenAuthModal}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  isSuperUser
                    ? 'bg-zinc-900 text-white border-zinc-800 hover:bg-zinc-800 shadow-2xs'
                    : 'bg-zinc-100 text-zinc-800 border-zinc-200 hover:bg-zinc-200'
                }`}
                title="View Profile or Switch User"
              >
                {isSuperUser ? (
                  <Shield className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <User className="w-3.5 h-3.5 text-zinc-600" />
                )}
                <span className="max-w-[70px] sm:max-w-[100px] truncate text-[11px]">
                  {currentUser.name.split(' ')[0]}
                </span>
              </button>

              {onLogout && (
                <button
                  id="header-logout-btn"
                  onClick={onLogout}
                  className="p-1.5 rounded-xl bg-zinc-100 hover:bg-red-50 text-zinc-600 hover:text-red-700 border border-zinc-200 transition-all active:scale-95"
                  title="Log Out (Ondoka)"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              id="header-login-btn"
              onClick={onOpenAuthModal}
              className="bg-zinc-900 hover:bg-zinc-800 text-white px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all border border-zinc-800"
            >
              <LogIn className="w-3.5 h-3.5 text-red-400" />
              <span>Log In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
