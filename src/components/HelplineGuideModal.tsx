import React from 'react';
import { 
  PhoneCall, ShieldAlert, Skull, Truck, Heart, 
  HelpCircle, Download, CheckCircle2, AlertTriangle, ExternalLink
} from 'lucide-react';
import { EMERGENCY_HOTLINE, HOTLINE_DISPLAY } from '../data/mockData';
import { CaritasLogo } from './CaritasLogo';

interface HelplineGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelplineGuideModal: React.FC<HelplineGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="space-y-4 pb-16">
      {/* 1. Toll Free Emergency Banner */}
      <div className="bg-gradient-to-br from-[#991B1B] via-[#7F1D1D] to-[#450A0A] text-white p-5 rounded-3xl shadow-lg border border-red-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full border border-white/20">
            Official Toll-Free Hotline
          </span>
          <span className="text-[11px] font-bold text-red-200">
            24 Hours • Free of Charge
          </span>
        </div>

        <div>
          <div className="text-[11px] font-bold text-red-200 uppercase tracking-wider">
            Caritas Kitui Emergency Dispatch
          </div>
          <div className="text-2xl sm:text-3xl font-black font-display text-white mt-0.5">
            {HOTLINE_DISPLAY}
          </div>
          <p className="text-xs text-red-100/90 mt-1 max-w-md">
            Directly connects community members, local chiefs, and donkey owners to Caritas Kitui welfare officers and police response units.
          </p>
        </div>

        <a
          href={`tel:${EMERGENCY_HOTLINE}`}
          className="inline-flex bg-white hover:bg-zinc-100 text-[#991B1B] font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm items-center gap-2 shadow-md active:scale-95 transition-all"
        >
          <PhoneCall className="w-4 h-4 fill-[#991B1B]" />
          <span>Call 0800 000 890 Now</span>
        </a>
      </div>

      {/* 2. Play Store PWA / Android Installation Guide */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200 shadow-2xs space-y-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-zinc-950 text-white flex items-center justify-center">
            <Download className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-zinc-950">
              Install DIRA (Kaa Rada!) on Android
            </h3>
            <span className="text-[11px] text-zinc-500">
              PWA & Google Play Store Ready (Trusted Web Activity)
            </span>
          </div>
        </div>

        <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 text-xs text-zinc-700 space-y-1.5 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="font-bold text-[#991B1B] shrink-0">1.</span>
            <span>Tap Chrome / Browser settings menu (<strong>⋮</strong>).</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-[#991B1B] shrink-0">2.</span>
            <span>Select <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong>.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-[#991B1B] shrink-0">3.</span>
            <span>DIRA will run as an authentic standalone Android application with offline support.</span>
          </div>
        </div>
      </div>

      {/* 3. Welfare Response Guides */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200 shadow-2xs space-y-3">
        <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-900">
          What to Do in Common Donkey Emergencies
        </h3>

        <div className="space-y-2.5 text-xs">
          {/* Theft */}
          <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-zinc-950">
              <ShieldAlert className="w-4 h-4 text-[#991B1B]" />
              Donkey Theft (Wizi wa Punda)
            </div>
            <p className="text-zinc-600 leading-relaxed">
              Report immediately within the first 1-3 hours. Provide distinct ear notches, hoof marks, coloring, and the direction of animal tracks.
            </p>
          </div>

          {/* Bush Slaughter */}
          <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-zinc-950">
              <Skull className="w-4 h-4 text-zinc-900" />
              Illegal Bush Slaughter (Uchinjaji Haramu)
            </div>
            <p className="text-zinc-600 leading-relaxed">
              Do not tamper with footprints or tire tracks. Call 0800000890 immediately and log GPS location so Caritas and ASTU police can intercept suspects.
            </p>
          </div>

          {/* Trafficking */}
          <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-zinc-950">
              <Truck className="w-4 h-4 text-zinc-800" />
              Trafficking & Night Lorries (Usafirishaji Haramu)
            </div>
            <p className="text-zinc-600 leading-relaxed">
              Note vehicle registration plates, vehicle color/model (e.g. Canter, Isuzu, Probox), and direction toward border or slaughter zones.
            </p>
          </div>

          {/* General Abuse */}
          <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-zinc-950">
              <Heart className="w-4 h-4 text-[#991B1B]" />
              Welfare & Abuse (Matunzo na Ukatili)
            </div>
            <p className="text-zinc-600 leading-relaxed">
              Caritas Kitui provides free harness padding training, wound treatments, and humane pack advice across all 8 sub-counties.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
