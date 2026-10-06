import React from 'react';
import { 
  ShieldAlert, 
  X, 
  MapPin, 
  Phone, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Radio, 
  Compass, 
  User, 
  Car, 
  FileText, 
  ArrowRight,
  Flame,
  Check,
  ExternalLink
} from 'lucide-react';
import { DonkeyCase, UserProfile, CaseStatus } from '../types';
import { CATEGORY_INFO } from '../data/mockData';
import { formatReportedDateTime } from '../utils/dateUtils';

interface CaseAllocationAlertModalProps {
  isOpen: boolean;
  caseItem: DonkeyCase | null;
  currentUser: UserProfile | null;
  onClose: () => void;
  onUpdateStatus?: (caseId: string, newStatus: CaseStatus, note?: string) => void;
  onViewOnMap?: (caseItem: DonkeyCase) => void;
  onOpenResolveModal?: (caseItem: DonkeyCase) => void;
}

export const CaseAllocationAlertModal: React.FC<CaseAllocationAlertModalProps> = ({
  isOpen,
  caseItem,
  currentUser,
  onClose,
  onUpdateStatus,
  onViewOnMap,
  onOpenResolveModal,
}) => {
  if (!isOpen || !caseItem) return null;

  const catInfo = CATEGORY_INFO[caseItem.category] || {
    label: caseItem.category.replace('_', ' ').toUpperCase(),
    color: '#DC2626',
    badgeBg: 'bg-red-50',
    badgeBorder: 'border-red-200',
    badgeText: 'text-red-900',
  };

  const isCritical = caseItem.urgency === 'critical' || caseItem.urgency === 'high' || caseItem.isEmergency;
  const reporterPhone = caseItem.reporter?.phone || caseItem.emergencyPhone || caseItem.reporterUserPhone;
  const officerName = currentUser?.name || caseItem.assignedOfficer?.name || 'Super User';
  const officerRole = currentUser?.roleTitle || currentUser?.designation || caseItem.assignedOfficer?.title || 'Lead Responding Officer';

  const handleAcknowledgeAndInvestigate = () => {
    if (onUpdateStatus && caseItem.status !== 'investigating' && caseItem.status !== 'resolved') {
      onUpdateStatus(
        caseItem.id, 
        'investigating', 
        `Officer ${officerName} acknowledged instant allocation and initiated rapid field investigation.`
      );
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="allocation-alert-title"
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-3xl border-2 border-red-600 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Urgent Header Banner */}
        <div className="bg-gradient-to-r from-red-950 via-zinc-950 to-red-950 text-white p-4 sm:p-5 relative border-b border-red-800 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-600/30 border border-red-500 flex items-center justify-center text-red-400 shrink-0 shadow-lg shadow-red-950/50">
                <ShieldAlert className="w-7 h-7 text-red-400 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-600 text-white shadow-xs">
                    ⚡ Instant Case Allocation
                  </span>
                  <span className="text-[10px] font-mono font-bold text-red-200 bg-red-950/80 px-2 py-0.5 rounded border border-red-800">
                    #{caseItem.trackingCode}
                  </span>
                </div>
                <h2 id="allocation-alert-title" className="text-lg sm:text-xl font-black text-white mt-1 leading-snug">
                  Case Allocated to You for Immediate Action
                </h2>
                <p className="text-xs text-zinc-300 mt-0.5">
                  Assigned Officer: <span className="text-white font-bold">{officerName}</span> ({officerRole})
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-zinc-800 transition-colors"
              title="Dismiss alert"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body with ALL Details */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-left">
          {/* Action Directive Notification Box */}
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-950 shadow-xs">
            <Radio className="w-5 h-5 text-amber-700 shrink-0 mt-0.5 animate-pulse" />
            <div className="text-xs space-y-1">
              <div className="font-extrabold text-amber-950 flex items-center gap-1.5 uppercase tracking-wide">
                <span>Immediate Field Action Required</span>
                <span className="text-[10px] bg-amber-200/80 text-amber-900 px-1.5 py-0.2 rounded font-bold">Priority One</span>
              </div>
              <p className="text-amber-900 leading-relaxed">
                This incident has been automatically allocated to your Super User account based on AI proximity and sector readiness. 
                <strong> You will receive an automated action reminder every 1 hour until this case is resolved.</strong>
              </p>
            </div>
          </div>

          {/* Core Case Overview */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${catInfo.badgeBg} ${catInfo.badgeBorder} ${catInfo.badgeText}`}>
                  {catInfo.label}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                  isCritical 
                    ? 'bg-red-600 text-white font-black' 
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}>
                  Urgency: {caseItem.urgency?.toUpperCase() || 'HIGH'}
                </span>
                {caseItem.isEmergency && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-600 text-white flex items-center gap-1 animate-pulse">
                    <Flame className="w-3 h-3" />
                    Emergency Incident
                  </span>
                )}
              </div>

              <div className="text-[11px] font-bold text-zinc-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Status: <strong className="text-zinc-950 uppercase">{caseItem.status.replace('_', ' ')}</strong></span>
              </div>
            </div>

            <div>
              <h3 className="text-base font-extrabold text-zinc-950 leading-tight">
                {caseItem.title}
              </h3>
              <p className="text-xs text-zinc-700 mt-1.5 leading-relaxed bg-white p-3 rounded-xl border border-zinc-200">
                {caseItem.description || 'No additional narrative provided by reporter.'}
              </p>
            </div>

            {/* Metrics Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="bg-white p-2 rounded-xl border border-zinc-200">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">Donkeys Involved</span>
                <span className="font-extrabold text-zinc-900 text-sm">{caseItem.donkeysCount || 1} Donkey(s)</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-zinc-200">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">Incident Time</span>
                <span className="font-bold text-zinc-800 text-[11px] truncate block">
                  {formatReportedDateTime(caseItem.incidentDateTime || caseItem.reportedAt)}
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-zinc-200">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">Reported At</span>
                <span className="font-bold text-zinc-800 text-[11px] truncate block">
                  {formatReportedDateTime(caseItem.reportedAt)}
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-zinc-200">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">AI Dispatch Distance</span>
                <span className="font-extrabold text-red-600 text-sm">
                  {caseItem.aiAllocation?.distanceFormatted || '~2.4 km'}
                </span>
              </div>
            </div>
          </div>

          {/* Location Breakdown */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-red-600" />
                Incident Location & GPS Coordinates
              </span>
              {onViewOnMap && (
                <button
                  onClick={() => {
                    onViewOnMap(caseItem);
                    onClose();
                  }}
                  className="text-[11px] font-bold text-red-700 hover:text-red-900 flex items-center gap-1 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>View on Radar Map</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-white p-2 rounded-xl border border-zinc-200">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">Sub-County</span>
                <span className="font-bold text-zinc-900">{caseItem.location?.subCounty || 'Kitui Central'}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-zinc-200">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">Ward / Sub-Loc</span>
                <span className="font-bold text-zinc-900 truncate block">
                  {caseItem.location?.ward || 'Central Ward'} {caseItem.location?.subLocation ? `• ${caseItem.location.subLocation}` : ''}
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-zinc-200">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">Village</span>
                <span className="font-bold text-zinc-900">{caseItem.location?.village || 'Scene Village'}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-zinc-200 col-span-2">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">Landmark / Directions</span>
                <span className="font-medium text-zinc-800">{caseItem.location?.landmark || 'Near local centre'}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-zinc-200">
                <span className="text-[9px] font-bold text-zinc-400 uppercase block">GPS Coordinates</span>
                <span className="font-mono font-bold text-zinc-700 text-[11px]">
                  {caseItem.location?.coordinates 
                    ? `${caseItem.location.coordinates.lat.toFixed(4)}, ${caseItem.location.coordinates.lng.toFixed(4)}`
                    : '-1.3680, 38.0100'}
                </span>
              </div>
            </div>
          </div>

          {/* Reporter & Contact Details */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2">
            <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
              <User className="w-4 h-4 text-zinc-700" />
              Reporter Information & Direct Contact
            </span>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-zinc-200">
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold text-zinc-900">
                  {caseItem.reporter?.isAnonymous ? 'Anonymous Community Reporter' : (caseItem.reporter?.name || 'Local Resident')}
                </div>
                <div className="text-[11px] text-zinc-500">
                  Relationship: <span className="font-medium text-zinc-800 capitalize">{caseItem.reporter?.relationship || 'Community Member'}</span>
                  {reporterPhone && ` • Tel: ${reporterPhone}`}
                </div>
              </div>

              {reporterPhone && (
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${reporterPhone}`}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Reporter</span>
                  </a>
                  <a
                    href={`sms:${reporterPhone}?body=${encodeURIComponent(`Habari, I am ${officerName} from Caritas Kitui regarding your reported case #${caseItem.trackingCode}.`)}`}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <span>SMS</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Suspect / Vehicle Details (if reported) */}
          {caseItem.suspectDetails && (caseItem.suspectDetails.description || caseItem.suspectDetails.vehiclePlate || caseItem.suspectDetails.routeDirection) && (
            <div className="bg-red-50/60 border border-red-200 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-red-950 flex items-center gap-1.5">
                <Car className="w-4 h-4 text-red-700" />
                Suspect & Vehicle Intelligence
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {caseItem.suspectDetails.vehiclePlate && (
                  <div className="bg-white p-2 rounded-xl border border-red-200">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block">Vehicle Plate</span>
                    <span className="font-mono font-black text-red-900">{caseItem.suspectDetails.vehiclePlate}</span>
                  </div>
                )}
                {caseItem.suspectDetails.routeDirection && (
                  <div className="bg-white p-2 rounded-xl border border-red-200">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block">Escape / Flight Direction</span>
                    <span className="font-bold text-zinc-900">{caseItem.suspectDetails.routeDirection}</span>
                  </div>
                )}
                {caseItem.suspectDetails.description && (
                  <div className="bg-white p-2 rounded-xl border border-red-200 sm:col-span-3">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block">Suspect Description / Aliases</span>
                    <span className="text-zinc-800">{caseItem.suspectDetails.description}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Allocation Tactical Brief */}
          {caseItem.aiAllocation && (
            <div className="bg-zinc-900 text-zinc-200 rounded-2xl p-3.5 border border-zinc-800 text-xs space-y-1">
              <div className="font-bold text-white flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <span>⚡ AI Allocation Brief & ETA</span>
              </div>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                {caseItem.aiAllocation.reason}
              </p>
            </div>
          )}
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="bg-zinc-50 p-4 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs w-full sm:w-auto">
            <Clock className="w-3.5 h-3.5 text-red-600" />
            <span>Reminders: Every 1 hour until resolved</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {onOpenResolveModal && (
              <button
                onClick={() => {
                  onOpenResolveModal(caseItem);
                  onClose();
                }}
                className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Resolved ✓</span>
              </button>
            )}

            <button
              onClick={handleAcknowledgeAndInvestigate}
              className="px-4 py-2.5 bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer border border-red-800"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Acknowledge & Investigate</span>
            </button>

            <button
              onClick={onClose}
              className="px-3.5 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold rounded-xl text-xs transition-all"
            >
              Close Alert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
