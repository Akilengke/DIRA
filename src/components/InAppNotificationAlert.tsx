import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertTriangle, 
  X, 
  ChevronRight, 
  Bell, 
  MapPin, 
  Volume2, 
  VolumeX, 
  Clock,
  ShieldAlert,
  Radio
} from 'lucide-react';
import { DonkeyCase } from '../types';
import { CATEGORY_INFO } from '../data/mockData';

interface InAppNotificationAlertProps {
  activeCase: DonkeyCase | null;
  onDismiss: () => void;
  onViewCase: (caseItem: DonkeyCase) => void;
}

export const InAppNotificationAlert: React.FC<InAppNotificationAlertProps> = ({
  activeCase,
  onDismiss,
  onViewCase,
}) => {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const DURATION_MS = 8500;
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeCase) {
      setProgress(100);
      return;
    }

    setProgress(100);
    const startTime = Date.now();
    let elapsedBeforePause = 0;

    const interval = setInterval(() => {
      if (isPaused) return;

      const elapsed = Date.now() - startTime + elapsedBeforePause;
      const remaining = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 100);

    progressIntervalRef.current = interval;

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [activeCase, isPaused, onDismiss]);

  if (!activeCase) return null;

  const catInfo = CATEGORY_INFO[activeCase.category] || {
    label: activeCase.category,
    color: 'bg-zinc-100 text-zinc-800 border-zinc-300',
  };

  const isUrgent = activeCase.urgency === 'critical' || activeCase.urgency === 'high';

  return (
    <div 
      className="fixed top-3 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-md z-50 animate-in slide-in-from-top-4 duration-300 pointer-events-auto"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="alert"
      aria-live="assertive"
    >
      <div className={`rounded-2xl border shadow-xl backdrop-blur-md overflow-hidden transition-all ${
        isUrgent 
          ? 'bg-zinc-950/95 text-white border-red-500/60 shadow-red-950/40' 
          : 'bg-zinc-950/95 text-white border-zinc-700 shadow-black/40'
      }`}>
        {/* Top Header Bar with Live Indicator */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-white/10 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="font-extrabold tracking-wider uppercase text-[11px] text-red-400 flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse" />
              New Case Reported!
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 font-bold">
              #{activeCase.trackingCode}
            </span>
            <button
              onClick={onDismiss}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Dismiss notification"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-red-900/60 text-red-200 border border-red-700/50">
                  {catInfo.label}
                </span>
                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                  activeCase.urgency === 'critical'
                    ? 'bg-red-600 text-white border-red-500 animate-pulse'
                    : activeCase.urgency === 'high'
                    ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}>
                  {activeCase.urgency} Urgency
                </span>
                <span className="text-[11px] text-zinc-400 font-medium">
                  • {activeCase.donkeysCount} {activeCase.donkeysCount === 1 ? 'donkey' : 'donkeys'}
                </span>
              </div>

              <h4 className="text-sm font-bold text-white line-clamp-1 leading-snug">
                {activeCase.title}
              </h4>
            </div>
          </div>

          {/* Location & Details Preview */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-300 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/5">
            <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="truncate">
              <strong>{activeCase.location?.village || 'Incident Scene'}</strong>{activeCase.location?.subCounty ? `, ${activeCase.location.subCounty}` : ''}
            </span>
            {activeCase.reporter?.name && (
              <span className="text-[11px] text-zinc-400 shrink-0 ml-auto hidden xs:inline">
                by {activeCase.reporter.name.split(' ')[0]}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                onViewCase(activeCase);
                onDismiss();
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
            >
              <span>View Case Details</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Dismiss Progress Bar */}
        <div className="w-full bg-white/10 h-1">
          <div 
            className="h-full bg-red-500 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
