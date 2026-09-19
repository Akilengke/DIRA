import React, { useState } from 'react';
import { 
  ShieldAlert, Plus, MapPin, ArrowRight, ShieldCheck, CheckCircle2, 
  Clock, AlertTriangle, Eye, Shield, User, Compass, PhoneCall, HeartHandshake,
  Zap, Smartphone, Download, FileText
} from 'lucide-react';
import { DonkeyCase, CaseCategory, UserProfile, Coordinates, BackgroundLocationSettings } from '../types';
import { CATEGORY_INFO, EMERGENCY_HOTLINE } from '../data/mockData';
import { TollFreeBanner } from './TollFreeBanner';
import { HotspotsMapView } from './HotspotsMapView';
import { WeeklyIncidentChart } from './WeeklyIncidentChart';
import { GeneralReportModal } from './GeneralReportModal';
import { detectLocationInfo } from '../services/locationService';
import donkeyHeroImage from '../assets/images/donkey_hero_banner_1788697782238.jpg';

interface HomeDashboardProps {
  cases: DonkeyCase[];
  currentUser: UserProfile | null;
  onOpenReportModal: () => void;
  onOpenEmergencyReportModal?: () => void;
  onOpenHotlineModal: () => void;
  onNavigateTab: (tab: any) => void;
  onSelectCategoryReport?: (cat: CaseCategory) => void;
  onSelectCase?: (c: DonkeyCase) => void;
  userCoordinates?: Coordinates;
  userAccuracy?: number;
  bgSettings?: BackgroundLocationSettings;
  onUpdateBgSettings?: (newSettings: BackgroundLocationSettings) => void;
  onAllocateCaseToOfficer?: (caseId: string, officer: UserProfile, distanceKm: number) => void;
  onSimulateLocation?: (coords: Coordinates, label: string) => void;
  onSyncGps?: (coords?: Coordinates) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  cases,
  currentUser,
  onOpenReportModal,
  onOpenEmergencyReportModal,
  onOpenHotlineModal,
  onNavigateTab,
  onSelectCategoryReport,
  onSelectCase,
  userCoordinates,
  userAccuracy,
  bgSettings,
  onUpdateBgSettings,
  onAllocateCaseToOfficer,
  onSimulateLocation,
  onSyncGps,
}) => {
  const [isGeneralReportModalOpen, setIsGeneralReportModalOpen] = useState(false);
  const isSuperUser = currentUser?.role === 'super_user';
  const locationInfo = userCoordinates ? detectLocationInfo(userCoordinates) : null;

  // Metrics
  const activeCases = cases.filter((c) => c.status !== 'resolved' && c.status !== 'dismissed');

  return (
    <div className="space-y-3.5 pb-16">
      {/* 1. Photo Hero Action Banner (Donkey Photo) */}
      <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-2xs">
        {/* Photo Container */}
        <div className="relative w-full h-56 sm:h-72 overflow-hidden bg-zinc-900 group">
          <img
            src={donkeyHeroImage}
            alt="Working donkeys in Kitui sanctuary - DIRA Donkey Incident Reporting APP (Kaa Rada!)"
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

        {/* Action Bar with Prominent "Ripoti Sasa" & "Emergency Report" */}
        <div className="p-3.5 sm:p-4 bg-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-200/80">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-zinc-950">
                Witnessed Donkey Theft, Slaughter, or Cruelty?
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-medium">
              Select <span className="font-bold text-red-700">Emergency Report</span> for 1-click brief narrative or <span className="font-bold text-zinc-900">Ripoti Sasa</span> for full details.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {onOpenEmergencyReportModal && (
              <button
                id="home-emergency-report-btn"
                onClick={onOpenEmergencyReportModal}
                className="bg-red-600 hover:bg-red-700 text-white font-black px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md animate-pulse border border-red-800 active:scale-95 transition-all"
                title="Briefer emergency reporting: brief narrative, optional photo, mandatory phone & automatic AI officer dispatch"
              >
                <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />
                <span>🚨 Emergency Report</span>
              </button>
            )}

            <button
              id="home-main-report-btn"
              onClick={onOpenReportModal}
              className="w-full sm:w-auto bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-black px-5 py-3 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg active:scale-95 transition-all shrink-0 border border-red-800"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Ripoti Sasa</span>
            </button>
          </div>
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
        {/* Embedded Map Radar View: Incident Map Only */}
        <div className="p-2 sm:p-3">
          <HotspotsMapView
            cases={cases}
            currentUser={currentUser}
            onOpenReportModal={onOpenReportModal}
            onOpenHotlineModal={onOpenHotlineModal}
            onSelectCase={onSelectCase}
            userCoordinates={userCoordinates}
            userAccuracy={userAccuracy}
            bgSettings={bgSettings}
            onUpdateBgSettings={onUpdateBgSettings}
            onAllocateCaseToOfficer={onAllocateCaseToOfficer}
            onSimulateLocation={onSimulateLocation}
            onSyncGps={onSyncGps}
            showNearbySection={false}
            incidentMapOnly={true}
          />
        </div>
      </div>

      {/* 6. Weekly Frequency Trends Line Chart Section */}
      <WeeklyIncidentChart 
        cases={cases} 
        onSelectCategory={onSelectCategoryReport}
        onOpenGeneralReportModal={() => setIsGeneralReportModalOpen(true)}
      />

      {/* General Report (Weekly, Monthly, Quarterly, Annually) Modal */}
      <GeneralReportModal
        isOpen={isGeneralReportModalOpen}
        onClose={() => setIsGeneralReportModalOpen(false)}
        cases={cases}
      />
    </div>
  );
};
