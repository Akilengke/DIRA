import React from 'react';
import { 
  Clock, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  MapPin, 
  Phone, 
  ChevronRight, 
  Radio, 
  ShieldAlert,
  ArrowRight,
  Bell
} from 'lucide-react';
import { DonkeyCase, UserProfile, CaseStatus, CaseResolution } from '../types';
import { CATEGORY_INFO } from '../data/mockData';
import { formatReportedDateTime, formatReportedRelative } from '../utils/dateUtils';
import { calculateHoursSinceAllocation } from '../services/caseReminderService';

interface HourlyReminderAlertModalProps {
  isOpen: boolean;
  caseItem: DonkeyCase | null;
  hourNumber: number;
  currentUser: UserProfile | null;
  onClose: () => void;
  onUpdateStatus?: (caseId: string, newStatus: CaseStatus, note?: string) => void;
  onOpenResolveModal?: (caseItem: DonkeyCase) => void;
  onSelectCase?: (caseItem: DonkeyCase) => void;
}

export const HourlyReminderAlertModal: React.FC<HourlyReminderAlertModalProps> = ({
  isOpen,
  caseItem,
  hourNumber,
  currentUser,
  onClose,
  onUpdateStatus,
  onOpenResolveModal,
  onSelectCase,
}) => {
  if (!isOpen || !caseItem) return null;

  const catInfo = CATEGORY_INFO[caseItem.category] || {
    label: caseItem.category.replace('_', ' ').toUpperCase(),
    color: '#DC2626',
    badgeBg: 'bg-red-50',
    badgeBorder: 'border-red-200',
    badgeText: 'text-red-900',
  };

  const reporterPhone = caseItem.reporter?.phone || caseItem.emergencyPhone || caseItem.reporterUserPhone;
  const hoursSince = calculateHoursSinceAllocation(caseItem.aiAllocation?.allocatedAt || caseItem.reportedAt) || hourNumber;

  const handleSetStatus = (newStatus: CaseStatus) => {
    if (onUpdateStatus) {
      onUpdateStatus(
        caseItem.id, 
        newStatus, 
        `Hourly reminder responded by ${currentUser?.name || 'Officer'}: status shifted to ${newStatus}.`
      );
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hourly-reminder-title"
    >
      <div 
        className="w-full max-w-lg bg-white rounded-3xl border-2 border-amber-500 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Urgency Badge */}
        <div className="bg-gradient-to-r from-amber-950 via-zinc-950 to-amber-950 text-white p-4 sm:p-5 relative border-b border-amber-700/60 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 shrink-0 shadow-md">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 font-display">
                    ⏰ Hourly Action Reminder #{hourNumber}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800">
                    #{caseItem.trackingCode}
                  </span>
                </div>
                <h2 id="hourly-reminder-title" className="text-base sm:text-lg font-black text-white mt-1 leading-snug">
                  Allocated Case Still Pending Action
                </h2>
                <p className="text-xs text-zinc-300 mt-0.5">
                  Assigned to <span className="text-white font-bold">{currentUser?.name || 'You'}</span> • Allocated ~{hoursSince}h ago
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors"
              title="Acknowledge reminder"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-left text-xs">
          {/* Ongoing Notification Message */}
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 space-y-1">
            <div className="font-bold flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
              <Radio className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span>Recurring Hourly Directive</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-900">
              This case has not yet been resolved. In accordance with rapid response protocols, reminders will continue every 1 hour until field intervention is logged or the case is marked as resolved.
            </p>
          </div>

          {/* Case Card Brief */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${catInfo.badgeBg} ${catInfo.badgeBorder} ${catInfo.badgeText}`}>
                {catInfo.label}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-200 uppercase">
                Status: {caseItem.status.replace('_', ' ')}
              </span>
            </div>

            <div>
              <h3 className="text-sm font-extrabold text-zinc-950 leading-snug">
                {caseItem.title}
              </h3>
              <p className="text-zinc-600 text-[11px] line-clamp-2 mt-1">
                {caseItem.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-zinc-200">
              <div className="flex items-center gap-1.5 text-zinc-700">
                <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span className="truncate">{caseItem.location?.village || 'Scene'}, {caseItem.location?.subCounty || 'Kitui'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-700 justify-end">
                <span className="font-bold text-zinc-900">{caseItem.donkeysCount || 1} Donkey(s)</span>
              </div>
            </div>
          </div>

          {/* Reporter Quick Contact */}
          {reporterPhone && (
            <div className="flex items-center justify-between gap-2 p-2.5 bg-zinc-100 rounded-xl border border-zinc-200">
              <div className="truncate">
                <span className="text-[10px] font-bold text-zinc-500 uppercase block">Reporter Contact</span>
                <span className="font-bold text-zinc-900 text-xs">{caseItem.reporter?.name || 'Reporter'} ({reporterPhone})</span>
              </div>
              <a
                href={`tel:${reporterPhone}`}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors shrink-0"
              >
                <Phone className="w-3 h-3" />
                <span>Call</span>
              </a>
            </div>
          )}

          {/* Fast Status Transitions */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-bold text-zinc-800 uppercase tracking-wide block">
              Quick Action: Update Status or Resolve
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSetStatus('investigating')}
                disabled={caseItem.status === 'investigating'}
                className="p-2.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-950 font-bold text-left transition-all active:scale-95 disabled:opacity-50"
              >
                <div className="text-[11px] font-black">Investigating</div>
                <div className="text-[10px] text-blue-800">Field response commenced</div>
              </button>

              <button
                type="button"
                onClick={() => handleSetStatus('dispatched')}
                disabled={caseItem.status === 'dispatched'}
                className="p-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-left transition-all active:scale-95 disabled:opacity-50"
              >
                <div className="text-[11px] font-black">Dispatched / En Route</div>
                <div className="text-[10px] text-amber-800">Responder on motorcycle</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-zinc-50 p-3.5 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-zinc-500 flex items-center gap-1 w-full sm:w-auto">
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>Next reminder in 60 mins if unresolved</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onOpenResolveModal && (
              <button
                onClick={() => {
                  onOpenResolveModal(caseItem);
                  onClose();
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition-all active:scale-95"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Resolved ✓</span>
              </button>
            )}

            <button
              onClick={() => {
                if (onSelectCase) onSelectCase(caseItem);
                onClose();
              }}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs transition-all active:scale-95"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
