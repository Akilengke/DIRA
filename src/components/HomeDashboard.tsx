import React from 'react';
import { 
  ShieldAlert, Plus, MapPin, ArrowRight, ShieldCheck, CheckCircle2, 
  Clock, AlertTriangle, Eye, Shield, User, FileText, Compass, PhoneCall, Radio, HeartHandshake
} from 'lucide-react';
import { DonkeyCase, CaseCategory, UserProfile } from '../types';
import { CATEGORY_INFO, EMERGENCY_HOTLINE } from '../data/mockData';
import { TollFreeBanner } from './TollFreeBanner';
import { HotspotsMapView } from './HotspotsMapView';

interface HomeDashboardProps {
  cases: DonkeyCase[];
  currentUser: UserProfile | null;
  onOpenReportModal: () => void;
  onOpenHotlineModal: () => void;
  onNavigateTab: (tab: any) => void;
  onSelectCategoryReport?: (cat: CaseCategory) => void;
  onSelectCase?: (c: DonkeyCase) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  cases,
  currentUser,
  onOpenReportModal,
  onOpenHotlineModal,
  onNavigateTab,
  onSelectCase,
}) => {
  const isSuperUser = currentUser?.role === 'super_user';

  // Metrics
  const totalReports = cases.length;
  const resolvedCases = cases.filter((c) => c.status === 'resolved');
  const activeCases = cases.filter((c) => c.status !== 'resolved' && c.status !== 'dismissed');

  return (
    <div className="space-y-3.5 pb-16">
      {/* Logged-In User Identity Banner */}
      {currentUser && (
        <div className="bg-zinc-900 text-white rounded-2xl p-3 sm:p-3.5 border border-zinc-800 shadow-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 truncate min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
              isSuperUser ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-red-950 text-red-400 border border-red-800'
            }`}>
              {isSuperUser ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div className="truncate">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-xs font-bold text-white truncate">
                  Jambo, {currentUser.name}
                </span>
                <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                  isSuperUser ? 'bg-amber-900/60 text-amber-300 border border-amber-700' : 'bg-red-900/60 text-red-300 border border-red-700'
                }`}>
                  {isSuperUser ? currentUser.roleTitle || 'Super User' : currentUser.designation || 'Primary User'}
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {currentUser.village ? `${currentUser.village}, ` : ''}{currentUser.subCounty || 'Mwingi West'} • Tel: {currentUser.phone}
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab(isSuperUser ? 'admin' : 'my_cases')}
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold rounded-xl border border-zinc-700 flex items-center gap-1 shrink-0 transition-all active:scale-95"
          >
            <span>{isSuperUser ? 'Command Desk' : 'My Cases'}</span>
            <ArrowRight className="w-3 h-3 text-red-400" />
          </button>
        </div>
      )}

      {/* 1. Emergency 0800000890 Toll-Free Banner */}
      <TollFreeBanner onOpenHotlineModal={onOpenHotlineModal} />

      {/* 2. Photo Hero Action Banner (Donkey Photo) */}
      <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-2xs">
        {/* Photo Container */}
        <div className="relative w-full h-56 sm:h-72 overflow-hidden bg-zinc-900 group">
          <img
            src="/assets/donkey_hero.jpg"
            alt="Working donkey in Kitui - DIRA Donkey Incident Reporting APP (Kaa Rada!)"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
          />
          {/* High-legibility gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/20" />
          
          {/* Top Tag */}
          <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between pointer-events-none">
            <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-black rounded-full border border-white/20 uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              DIRA • Kaa Rada!
            </span>
          </div>

          {/* Bottom Overlay Info on Image */}
          <div className="absolute bottom-3 left-3.5 right-3.5 text-white">
            <div className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-red-600/90 text-white mb-1 shadow-xs border border-red-400/40">
              Donkey Incident Reporting APP
            </div>
            <h2 className="text-base sm:text-xl font-black font-display text-white leading-tight drop-shadow-md">
              Kaa Rada! Protect Working Donkeys in Kitui
            </h2>
            <p className="text-[11px] sm:text-xs text-zinc-200 mt-0.5 line-clamp-1 drop-shadow-sm font-medium">
              Rapid incident reporting for donkey theft, bush slaughter, trafficking & cruelty.
            </p>
          </div>
        </div>

        {/* Action Bar with Prominent "Ripoti Sasa" */}
        <div className="p-3.5 sm:p-4 bg-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-200/80">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-zinc-900">
                Witnessed Donkey Theft, Slaughter, or Cruelty?
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-medium">
              Click <span className="font-bold text-[#991B1B]">Ripoti Sasa</span> to select what you want to report with instant GPS lock.
            </p>
          </div>

          <button
            id="home-main-report-btn"
            onClick={onOpenReportModal}
            className="w-full sm:w-auto bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-black px-6 py-3 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all shrink-0 border border-red-800"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Ripoti Sasa</span>
          </button>
        </div>
      </div>

      {/* 3. Concise Overview Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-950 text-white p-3 rounded-2xl border border-zinc-800 flex flex-col justify-between">
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            Total Cases
          </span>
          <div className="text-xl font-black font-display text-white mt-1">
            {totalReports}
          </div>
          <span className="text-[9px] text-zinc-400">Kitui reports</span>
        </div>

        <div className="bg-[#991B1B] text-white p-3 rounded-2xl border border-red-800 flex flex-col justify-between">
          <span className="text-[10px] text-red-200 font-bold uppercase tracking-wider">
            Active Radar
          </span>
          <div className="text-xl font-black font-display text-white mt-1">
            {activeCases.length}
          </div>
          <span className="text-[9px] text-red-100">Live alerts</span>
        </div>

        <div className="bg-white text-zinc-900 p-3 rounded-2xl border border-zinc-200 flex flex-col justify-between">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
            Resolved
          </span>
          <div className="text-xl font-black font-display text-zinc-950 mt-1">
            {resolvedCases.length}
          </div>
          <span className="text-[9px] text-zinc-500">Safely handled</span>
        </div>
      </div>

      {/* 4. Super User Officer Alert Banner (Only shown if logged in as super user) */}
      {isSuperUser && (
        <div className="bg-zinc-900 text-white p-3.5 rounded-2xl border border-zinc-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-800 text-red-400 flex items-center justify-center border border-zinc-700">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Super User Resolution Triage Desk
              </div>
              <div className="text-[11px] text-zinc-400">
                {activeCases.length > 0 
                  ? `${activeCases.length} reported case(s) waiting for your action or escalation` 
                  : 'All reported cases are reviewed • Standby for alerts'}
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('super_portal')}
            className="bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all shrink-0"
          >
            Review & Resolve →
          </button>
        </div>
      )}

      {/* 5. Clean Live Map Radar (Replaces the old Recent Cases section) */}
      <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-2xs">
        <div className="p-3.5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/60">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-red-100 text-[#991B1B] flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-950 uppercase tracking-wider">
                Live Kitui Radar Map
              </h3>
              <p className="text-[10px] text-zinc-500">
                Automatic GPS coordinates • Unique category color dots
              </p>
            </div>
          </div>

          {!isSuperUser && (
            <button
              onClick={() => onNavigateTab('my_cases')}
              className="text-xs font-bold text-[#991B1B] hover:underline flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Track My Cases →</span>
            </button>
          )}
        </div>

        {/* Embedded Map Radar View */}
        <div className="p-2 sm:p-3">
          <HotspotsMapView
            cases={cases}
            currentUser={currentUser}
            onOpenReportModal={onOpenReportModal}
            onOpenHotlineModal={onOpenHotlineModal}
            onSelectCase={onSelectCase}
          />
        </div>
      </div>
    </div>
  );
};
