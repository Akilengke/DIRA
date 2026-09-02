import React from 'react';
import { PhoneCall, ShieldAlert } from 'lucide-react';
import { EMERGENCY_HOTLINE, HOTLINE_DISPLAY } from '../data/mockData';

interface TollFreeBannerProps {
  onOpenHotlineModal?: () => void;
  compact?: boolean;
}

export const TollFreeBanner: React.FC<TollFreeBannerProps> = ({
  onOpenHotlineModal,
  compact = false,
}) => {
  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${EMERGENCY_HOTLINE}`;
  };

  if (compact) {
    return (
      <div 
        onClick={onOpenHotlineModal}
        className="cursor-pointer bg-gradient-to-r from-[#991B1B] to-[#7F1D1D] text-white px-3.5 py-2.5 rounded-2xl flex items-center justify-between shadow-md border border-red-800 hover:brightness-105 transition-all"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center animate-emergency">
            <PhoneCall className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-[10px] font-bold tracking-wider uppercase text-red-200">
              Emergency Toll-Free Hotline
            </div>
            <div className="text-sm font-black tracking-tight font-display text-white">
              {HOTLINE_DISPLAY}
            </div>
          </div>
        </div>
        <a
          id="quick-call-tollfree-compact-btn"
          href={`tel:${EMERGENCY_HOTLINE}`}
          onClick={handleCall}
          className="bg-white text-[#991B1B] hover:bg-zinc-100 px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
        >
          <PhoneCall className="w-3.5 h-3.5 fill-[#991B1B]" />
          Piga Sasa
        </a>
      </div>
    );
  }

  return (
    <div 
      id="emergency-tollfree-banner"
      className="relative overflow-hidden bg-gradient-to-br from-[#991B1B] via-[#7F1D1D] to-[#450A0A] text-white p-4 sm:p-5 rounded-3xl shadow-lg border border-red-800/80 mb-4"
    >
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-white/15 text-white border border-white/20">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            24/7 Response Line
          </span>

          <span className="text-[11px] font-bold text-red-100 bg-black/40 px-2 py-0.5 rounded-lg border border-white/10">
            Piga Bure (100% Free)
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-bold text-red-200 uppercase tracking-wider">
              Caritas Kitui Donkey Welfare Desk
            </h2>
            <div className="text-2xl sm:text-3xl font-black tracking-tight font-display text-white flex items-center gap-2">
              <PhoneCall className="w-6 h-6 text-white animate-pulse shrink-0" />
              <span>{HOTLINE_DISPLAY}</span>
            </div>
            <p className="text-xs text-red-100/90 mt-0.5 max-w-sm">
              Call free of charge for live bush slaughter, theft in progress, or severe donkey trauma.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 sm:pt-0">
            <a
              id="call-tollfree-main-btn"
              href={`tel:${EMERGENCY_HOTLINE}`}
              onClick={handleCall}
              className="flex-1 sm:flex-initial bg-white hover:bg-zinc-100 text-[#991B1B] font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
            >
              <PhoneCall className="w-4 h-4 fill-[#991B1B]" />
              <span>Piga Simu Bure</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
