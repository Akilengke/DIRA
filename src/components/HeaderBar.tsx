import React from 'react';
import { PhoneCall, Shield, User, LogIn, LogOut, Cloud } from 'lucide-react';
import { UserProfile } from '../types';
import { CaritasLogo } from './CaritasLogo';
import { EMERGENCY_HOTLINE, HOTLINE_DISPLAY } from '../data/mockData';

interface HeaderBarProps {
  currentUser: UserProfile | null;
  onOpenAuthModal: () => void;
  onOpenHotlineModal: () => void;
  onOpenDriveModal?: () => void;
  onLogout?: () => void;
  pendingCasesCount?: number;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentUser,
  onOpenAuthModal,
  onOpenHotlineModal,
  onOpenDriveModal,
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
          {/* Google Drive Evidence Vault Button */}
          {onOpenDriveModal && (
            <button
              id="header-google-drive-btn"
              onClick={onOpenDriveModal}
              className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-zinc-200 shadow-2xs"
              title="Google Drive Evidence Vault & Cloud Backup"
            >
              <svg viewBox="0 0 87.3 78" className="w-4 h-4 shrink-0">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A8.9 8.9 0 0 0 0 53h27.5z" fill="#00ac47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335"/>
                <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/>
                <path d="M59.8 53H87.3c0-1.55-.4-3.1-1.2-4.5l-13.75-23.8-13.75 23.8z" fill="#2684fc"/>
                <path d="m73.55 76.8-13.75-23.8H27.5L41.25 76.8c1.35.8 2.9 1.2 4.45 1.2h23.4c1.55 0 3.1-.4 4.45-1.2z" fill="#ffba00"/>
              </svg>
              <span className="hidden md:inline text-[11px]">Drive</span>
            </button>
          )}

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
