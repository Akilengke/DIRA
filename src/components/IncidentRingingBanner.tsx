import React from 'react';
import { PhoneCall, VolumeX, AlertTriangle, ExternalLink, ShieldAlert } from 'lucide-react';
import { DonkeyCase } from '../types';

interface IncidentRingingBannerProps {
  caseItem: DonkeyCase | null;
  onViewCase: (caseItem: DonkeyCase) => void;
  onDismiss: () => void;
}

export const IncidentRingingBanner: React.FC<IncidentRingingBannerProps> = ({
  caseItem,
  onViewCase,
  onDismiss,
}) => {
  if (!caseItem) return null;

  return (
    <div className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-50 animate-bounce-short">
      <div className="bg-gradient-to-r from-red-950 via-red-900 to-zinc-950 text-white p-3.5 sm:p-4 rounded-3xl border-2 border-red-500 shadow-2xl space-y-3 ring-4 ring-red-500/20">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
            </span>
            <span className="text-[11px] font-black uppercase tracking-widest text-red-200 flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5 animate-pulse text-red-400" />
              INCIDENT PHONE RINGING
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-red-800/80 text-[10px] font-bold text-red-100 uppercase border border-red-700">
            {caseItem.urgency}
          </span>
        </div>

        {/* Case Info */}
        <div className="space-y-1">
          <h4 className="text-sm font-black font-display tracking-tight text-white leading-snug line-clamp-1">
            {caseItem.title}
          </h4>
          <p className="text-xs text-red-200 flex items-center gap-1.5">
            <span>📍 {caseItem.location?.village || 'Kitui'}{caseItem.location?.subCounty ? `, ${caseItem.location.subCounty}` : ''}</span>
            <span>•</span>
            <span>{caseItem.donkeysCount || 1} Donkey(s)</span>
          </p>
        </div>

        {/* Action Buttons: Answer / View vs Mute */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={() => onViewCase(caseItem)}
            className="flex-1 px-3.5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
          >
            <ShieldAlert className="w-4 h-4 text-emerald-100" />
            <span>View Incident</span>
          </button>

          <button
            onClick={onDismiss}
            className="px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 font-bold text-xs flex items-center justify-center gap-1.5 transition-all border border-white/10"
            title="Silence ringtone"
          >
            <VolumeX className="w-4 h-4 text-red-300" />
            <span>Mute</span>
          </button>
        </div>
      </div>
    </div>
  );
};
