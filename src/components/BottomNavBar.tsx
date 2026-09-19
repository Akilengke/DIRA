import React from 'react';
import { 
  Home, FileText, MapPin, Shield, BookOpen, Plus, MessageSquare
} from 'lucide-react';
import { UserRole } from '../types';

export type NavTab = 'home' | 'my_cases' | 'chat' | 'hotspots' | 'super_portal' | 'helpline';

interface BottomNavBarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenReportModal: () => void;
  userRole: UserRole;
  pendingCount?: number;
  myCasesCount?: number;
  unreadChatCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onTabChange,
  onOpenReportModal,
  userRole,
  pendingCount = 0,
  myCasesCount = 0,
  unreadChatCount = 0,
}) => {
  const isSuperUser = userRole === 'super_admin' || userRole === 'super_user' || userRole === 'chief_officer' || userRole === 'field_officer';

  return (
    <nav className="sticky bottom-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 shadow-md select-none pb-safe w-full max-w-full overflow-hidden">
      <div className="max-w-4xl mx-auto px-1 sm:px-3 py-1 sm:py-1.5 flex items-center justify-between gap-0.5 sm:gap-1">
        {/* Tab 1: Home */}
        <button
          id="nav-tab-home"
          onClick={() => onTabChange('home')}
          className={`flex-1 min-w-0 max-w-[64px] min-h-[50px] flex flex-col items-center justify-center py-1 px-0.5 sm:px-1 rounded-xl transition-all touch-manipulation active:scale-95 ${
            activeTab === 'home'
              ? 'text-emerald-900 font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg ${activeTab === 'home' ? 'bg-emerald-50 text-emerald-800' : ''}`}>
            <Home className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <span className="text-[9.5px] sm:text-[10px] leading-tight truncate w-full text-center mt-0.5 font-medium">Home</span>
        </button>

        {/* Tab 2: My Cases */}
        <button
          id="nav-tab-my-cases"
          onClick={() => onTabChange('my_cases')}
          className={`flex-1 min-w-0 max-w-[64px] min-h-[50px] flex flex-col items-center justify-center py-1 px-0.5 sm:px-1 rounded-xl transition-all relative touch-manipulation active:scale-95 ${
            activeTab === 'my_cases'
              ? 'text-emerald-900 font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg relative ${activeTab === 'my_cases' ? 'bg-emerald-50 text-emerald-800' : ''}`}>
            <FileText className="w-4 sm:w-5 h-4 sm:h-5" />
            {myCasesCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-emerald-800 text-white text-[9px] font-bold flex items-center justify-center">
                {myCasesCount}
              </span>
            )}
          </div>
          <span className="text-[9.5px] sm:text-[10px] leading-tight truncate w-full text-center mt-0.5 font-medium">Cases</span>
        </button>

        {/* Floating Center Report Button in Brick Red */}
        <button
          id="nav-center-report-btn"
          onClick={onOpenReportModal}
          className="-mt-4 sm:-mt-5 min-w-[50px] min-h-[50px] bg-gradient-to-tr from-red-900 via-red-800 to-red-700 text-white p-2.5 sm:p-3.5 rounded-full shadow-lg ring-4 ring-white active:scale-95 transition-all flex items-center justify-center border border-red-800 shrink-0 mx-0.5 touch-manipulation"
          title="Report Donkey Incident"
        >
          <Plus className="w-5 sm:w-6 h-5 sm:h-6 stroke-[3]" />
        </button>

        {/* Tab 3: Community Messages & Chat */}
        <button
          id="nav-tab-chat"
          onClick={() => onTabChange('chat')}
          className={`flex-1 min-w-0 max-w-[64px] min-h-[50px] flex flex-col items-center justify-center py-1 px-0.5 sm:px-1 rounded-xl transition-all relative touch-manipulation active:scale-95 ${
            activeTab === 'chat'
              ? 'text-emerald-900 font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg relative ${activeTab === 'chat' ? 'bg-emerald-50 text-emerald-800' : ''}`}>
            <MessageSquare className="w-4 sm:w-5 h-4 sm:h-5" />
            {unreadChatCount > 0 ? (
              <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 bg-emerald-600 text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white shadow-xs animate-bounce">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            ) : (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            )}
          </div>
          <span className="text-[9.5px] sm:text-[10px] leading-tight truncate w-full text-center mt-0.5 font-medium">Chat</span>
        </button>

        {/* Tab 4: Hotspots Radar */}
        <button
          id="nav-tab-hotspots"
          onClick={() => onTabChange('hotspots')}
          className={`flex-1 min-w-0 max-w-[64px] min-h-[50px] flex flex-col items-center justify-center py-1 px-0.5 sm:px-1 rounded-xl transition-all touch-manipulation active:scale-95 ${
            activeTab === 'hotspots'
              ? 'text-emerald-900 font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg ${activeTab === 'hotspots' ? 'bg-emerald-50 text-emerald-800' : ''}`}>
            <MapPin className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <span className="text-[9.5px] sm:text-[10px] leading-tight truncate w-full text-center mt-0.5 font-medium">Map</span>
        </button>

        {/* Tab 5: Super User Portal (Only shown for Officers / Super Users) */}
        {isSuperUser && (
          <button
            id="nav-tab-super-portal"
            onClick={() => onTabChange('super_portal')}
            className={`flex-1 min-w-0 max-w-[64px] min-h-[50px] flex flex-col items-center justify-center py-1 px-0.5 sm:px-1 rounded-xl transition-all relative touch-manipulation active:scale-95 ${
              activeTab === 'super_portal'
                ? 'text-emerald-900 font-bold'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <div className={`p-1 rounded-lg relative ${activeTab === 'super_portal' ? 'bg-emerald-50 text-emerald-800' : ''}`}>
              <Shield className="w-4 sm:w-5 h-4 sm:h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-red-800 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {pendingCount}
                </span>
              )}
            </div>
            <span className="text-[9.5px] sm:text-[10px] leading-tight truncate w-full text-center mt-0.5 font-medium">
              {userRole === 'super_admin' ? 'Admin' : 'Portal'}
            </span>
          </button>
        )}

        {/* Tab 6: Helpline & Guide */}
        <button
          id="nav-tab-helpline"
          onClick={() => onTabChange('helpline')}
          className={`flex-1 min-w-0 max-w-[64px] min-h-[50px] flex flex-col items-center justify-center py-1 px-0.5 sm:px-1 rounded-xl transition-all touch-manipulation active:scale-95 ${
            activeTab === 'helpline'
              ? 'text-emerald-900 font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg ${activeTab === 'helpline' ? 'bg-emerald-50 text-emerald-800' : ''}`}>
            <BookOpen className="w-4 sm:w-5 h-4 sm:h-5" />
          </div>
          <span className="text-[9.5px] sm:text-[10px] leading-tight truncate w-full text-center mt-0.5 font-medium">Guide</span>
        </button>
      </div>
    </nav>
  );
};
