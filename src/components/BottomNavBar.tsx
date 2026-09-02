import React from 'react';
import { 
  Home, FileText, MapPin, Shield, BookOpen, PlusCircle, Plus
} from 'lucide-react';
import { UserRole } from '../types';

export type NavTab = 'home' | 'my_cases' | 'hotspots' | 'super_portal' | 'helpline';

interface BottomNavBarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenReportModal: () => void;
  userRole: UserRole;
  pendingCount?: number;
  myCasesCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onTabChange,
  onOpenReportModal,
  userRole,
  pendingCount = 0,
  myCasesCount = 0,
}) => {
  return (
    <nav className="sticky bottom-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 shadow-md select-none pb-safe">
      <div className="max-w-4xl mx-auto px-2 py-1.5 flex items-center justify-around">
        {/* Tab 1: Home */}
        <button
          id="nav-tab-home"
          onClick={() => onTabChange('home')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
            activeTab === 'home'
              ? 'text-[#991B1B] font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg ${activeTab === 'home' ? 'bg-red-50 text-[#991B1B]' : ''}`}>
            <Home className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5">Home</span>
        </button>

        {/* Tab 2: My Cases */}
        <button
          id="nav-tab-my-cases"
          onClick={() => onTabChange('my_cases')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
            activeTab === 'my_cases'
              ? 'text-[#991B1B] font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg relative ${activeTab === 'my_cases' ? 'bg-red-50 text-[#991B1B]' : ''}`}>
            <FileText className="w-5 h-5" />
            {myCasesCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-[#991B1B] text-white text-[9px] font-bold flex items-center justify-center">
                {myCasesCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5">My Cases</span>
        </button>

        {/* Floating Center Report Button in Brick Red */}
        <button
          id="nav-center-report-btn"
          onClick={onOpenReportModal}
          className="-mt-5 bg-gradient-to-tr from-[#7F1D1D] via-[#991B1B] to-[#B91C1C] text-white p-3.5 rounded-full shadow-lg ring-4 ring-white active:scale-95 transition-all flex items-center justify-center border border-red-800"
          title="Report Donkey Incident"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>

        {/* Tab 3: Hotspots Radar */}
        <button
          id="nav-tab-hotspots"
          onClick={() => onTabChange('hotspots')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
            activeTab === 'hotspots'
              ? 'text-[#991B1B] font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg ${activeTab === 'hotspots' ? 'bg-red-50 text-[#991B1B]' : ''}`}>
            <MapPin className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5">Map</span>
        </button>

        {/* Tab 4: Super User Portal */}
        <button
          id="nav-tab-super-portal"
          onClick={() => onTabChange('super_portal')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
            activeTab === 'super_portal'
              ? 'text-[#991B1B] font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg relative ${activeTab === 'super_portal' ? 'bg-red-50 text-[#991B1B]' : ''}`}>
            <Shield className="w-5 h-5" />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-[#991B1B] text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {pendingCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5">Super User</span>
        </button>

        {/* Tab 5: Helpline & Guide */}
        <button
          id="nav-tab-helpline"
          onClick={() => onTabChange('helpline')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
            activeTab === 'helpline'
              ? 'text-[#991B1B] font-bold'
              : 'text-zinc-500 hover:text-zinc-900'
          }`}
        >
          <div className={`p-1 rounded-lg ${activeTab === 'helpline' ? 'bg-red-50 text-[#991B1B]' : ''}`}>
            <BookOpen className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5">Guide</span>
        </button>
      </div>
    </nav>
  );
};
