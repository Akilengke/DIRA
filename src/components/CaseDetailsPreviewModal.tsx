import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  AlertTriangle, 
  Clock, 
  Shield, 
  Phone, 
  FileText, 
  CheckCircle2, 
  Camera, 
  ExternalLink,
  ChevronRight,
  Compass,
  Star,
  Send,
  ShieldAlert,
  Activity,
  Heart,
  Share2,
  Check,
  Calendar
} from 'lucide-react';
import { DonkeyCase, UserProfile } from '../types';
import { CATEGORY_INFO } from '../data/mockData';
import { exportCaseDossierToDrive } from '../services/googleDriveService';
import { hasValidGoogleToken, googleSignIn } from '../services/firebaseAuth';
import { formatReportedDateTime, formatReportedRelative } from '../utils/dateUtils';
import { exportSingleCasePDF } from '../services/pdfReportService';
import { Download, Loader2 } from 'lucide-react';

interface CaseDetailsPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseItem: DonkeyCase | null;
  currentUser: UserProfile | null;
  onNavigateToTab?: (tab: 'home' | 'my_cases' | 'hotspots' | 'super_portal' | 'helpline') => void;
  onRateCase?: (caseId: string, rating: number, feedback?: string) => void;
}

export const CaseDetailsPreviewModal: React.FC<CaseDetailsPreviewModalProps> = ({
  isOpen,
  onClose,
  caseItem,
  currentUser,
  onNavigateToTab,
  onRateCase,
}) => {
  if (!isOpen || !caseItem) return null;

  const [ratingScore, setRatingScore] = useState<number>(caseItem.userRating?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState<string>(caseItem.userRating?.feedback || '');
  const [isEditingRating, setIsEditingRating] = useState<boolean>(false);
  const [ratingSuccessMsg, setRatingSuccessMsg] = useState<string | null>(null);

  // Google Drive export state
  const [isExportingToDrive, setIsExportingToDrive] = useState<boolean>(false);
  const [driveSuccessToast, setDriveSuccessToast] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // PDF Export state
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);

  const catInfo = CATEGORY_INFO[caseItem.category] || {
    label: caseItem.category,
    color: 'bg-zinc-100 text-zinc-800 border-zinc-200',
  };

  const isSuperUser = currentUser?.role === 'super_user';

  // Get appropriate category icon
  const getCategoryIcon = () => {
    switch (caseItem.category) {
      case 'donkey_theft':
        return <ShieldAlert className="w-5 h-5 text-red-500" />;
      case 'slaughter_bush':
        return <AlertTriangle className="w-5 h-5 text-rose-500" />;
      case 'cruelty_injury':
        return <Activity className="w-5 h-5 text-amber-500" />;
      case 'welfare_neglect':
        return <Heart className="w-5 h-5 text-orange-500" />;
      default:
        return <FileText className="w-5 h-5 text-blue-500" />;
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(caseItem.trackingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSubmitRating = () => {
    if (!onRateCase) return;
    onRateCase(caseItem.id, ratingScore, feedbackText);
    setRatingSuccessMsg('Asante! Performance rating saved & synced to officers.');
    setIsEditingRating(false);
    setTimeout(() => setRatingSuccessMsg(null), 4000);
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    setDriveSuccessToast(null);
    try {
      const { filename } = await exportSingleCasePDF(caseItem, { autoDownload: true });
      setDriveSuccessToast(`Case dossier exported! Downloaded ${filename}`);
      setTimeout(() => setDriveSuccessToast(null), 5000);
    } catch (e: any) {
      console.warn('PDF export error:', e);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleExportDrive = async () => {
    setIsExportingToDrive(true);
    setDriveSuccessToast(null);
    try {
      if (!hasValidGoogleToken()) {
        await googleSignIn();
      }
      await exportCaseDossierToDrive(caseItem);
      setDriveSuccessToast('Dossier saved to Google Drive!');
      setTimeout(() => setDriveSuccessToast(null), 4500);
    } catch (e: any) {
      console.warn('Drive export error:', e);
    } finally {
      setIsExportingToDrive(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Case Icon & Reference Number */}
        <div className="bg-zinc-950 text-white p-4 sm:p-5 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
              {getCategoryIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCode}
                  className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-red-600/30 border border-red-500/50 text-red-300 font-black tracking-wide flex items-center gap-1 hover:bg-red-600/50 transition-colors"
                  title="Click to copy case reference number"
                >
                  <span>#{caseItem.trackingCode}</span>
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : null}
                </button>
                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                  caseItem.urgency === 'critical'
                    ? 'bg-red-600 text-white'
                    : caseItem.urgency === 'high'
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {caseItem.urgency} Urgency
                </span>
              </div>
              <h3 className="text-base font-bold text-white line-clamp-1 mt-1">
                {caseItem.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Drive Toast if any */}
          {driveSuccessToast && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{driveSuccessToast}</span>
            </div>
          )}

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Case Category
              </span>
              <span className="text-xs font-black text-zinc-900 mt-0.5 block">
                {catInfo.label}
              </span>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Donkeys Affected
              </span>
              <span className="text-xs font-black text-zinc-900 mt-0.5 block">
                {caseItem.donkeysCount} {caseItem.donkeysCount === 1 ? 'Donkey' : 'Donkeys'}
              </span>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-2xl col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Current Status
              </span>
              <span className="text-xs font-black text-emerald-800 uppercase mt-0.5 block">
                {caseItem.status.replace('_', ' ')}
              </span>
            </div>

            {/* Date Reported */}
            <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-2xl col-span-2 sm:col-span-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Date Reported
                </span>
                <span className="text-xs font-black text-zinc-900 mt-0.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#991B1B]" />
                  <span>{formatReportedDateTime(caseItem.reportedAt)}</span>
                </span>
              </div>
              {formatReportedRelative(caseItem.reportedAt) && (
                <span className="text-[10px] font-bold text-zinc-500 bg-white px-2 py-1 rounded-lg border border-zinc-200">
                  {formatReportedRelative(caseItem.reportedAt)}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {caseItem.description && (
            <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Incident Description
              </span>
              <p className="text-xs text-zinc-800 leading-relaxed">
                {caseItem.description}
              </p>
            </div>
          )}

          {/* Location Details */}
          <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-zinc-900 font-bold text-xs">
              <MapPin className="w-4 h-4 text-red-600 shrink-0" />
              <span>Location in Kitui</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <div>
                <span className="text-[10px] text-zinc-400 block">Sub-County:</span>
                <strong className="text-zinc-900">{caseItem.location?.subCounty || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Ward / Area:</span>
                <strong className="text-zinc-900">{caseItem.location?.ward || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Village:</span>
                <strong className="text-zinc-900">{caseItem.location?.village || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Landmark:</span>
                <strong className="text-zinc-900">{caseItem.location?.landmark || 'None'}</strong>
              </div>
            </div>

            {caseItem.location?.coordinates && (
              <div className="pt-2 border-t border-zinc-200/60 flex items-center justify-between text-[11px] text-zinc-500">
                <span>
                  GPS: {caseItem.location.coordinates.lat.toFixed(4)}, {caseItem.location.coordinates.lng.toFixed(4)}
                </span>
                {onNavigateToTab && (
                  <button
                    onClick={() => {
                      onNavigateToTab('hotspots');
                      onClose();
                    }}
                    className="text-red-700 hover:text-red-800 font-bold flex items-center gap-1"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>View on Hotspots Map</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Suspect / Route Information */}
          {caseItem.suspectDetails && (caseItem.suspectDetails.description || caseItem.suspectDetails.vehiclePlate || caseItem.suspectDetails.routeDirection) && (
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl space-y-1.5 text-xs text-amber-950">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Suspect / Trafficking Lead:</span>
              </div>
              {caseItem.suspectDetails.vehiclePlate && (
                <div className="text-[11px]">
                  <strong>Vehicle Plate:</strong> <span className="font-mono bg-white/70 px-1.5 py-0.5 rounded border border-amber-300">{caseItem.suspectDetails.vehiclePlate}</span>
                </div>
              )}
              {caseItem.suspectDetails.routeDirection && (
                <div className="text-[11px]">
                  <strong>Route Taken / Direction:</strong> {caseItem.suspectDetails.routeDirection}
                </div>
              )}
              {caseItem.suspectDetails.description && (
                <div className="text-[11px]">
                  <strong>Details:</strong> {caseItem.suspectDetails.description}
                </div>
              )}
            </div>
          )}

          {/* Photos if any */}
          {caseItem.photos && caseItem.photos.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Evidence Photos ({caseItem.photos.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {caseItem.photos.map((photo, i) => (
                  <div key={photo.id || i} className="relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100 aspect-video">
                    <img 
                      src={photo.url} 
                      alt={photo.caption || 'Case photo'} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Case Performance Rating Section */}
          <div className="bg-gradient-to-br from-amber-50/70 to-zinc-50 border border-amber-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-950">
                    Rate Case Response Quality (Tathmini Huduma)
                  </h4>
                  <span className="text-[10px] text-zinc-500">
                    Feedback on officer speed, coordination, and donkey recovery
                  </span>
                </div>
              </div>

              {caseItem.userRating && !isEditingRating && (
                <button
                  onClick={() => setIsEditingRating(true)}
                  className="text-[11px] text-amber-800 hover:text-amber-950 font-bold underline"
                >
                  Edit Rating
                </button>
              )}
            </div>

            {ratingSuccessMsg && (
              <div className="p-2 bg-emerald-100 border border-emerald-300 rounded-xl text-[11px] text-emerald-900 font-bold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                <span>{ratingSuccessMsg}</span>
              </div>
            )}

            {caseItem.userRating && !isEditingRating ? (
              <div className="p-3 bg-white rounded-xl border border-amber-200/60 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= (caseItem.userRating?.rating || 0)
                            ? 'text-amber-500 fill-amber-400'
                            : 'text-zinc-300'
                        }`}
                      />
                    ))}
                    <span className="text-xs font-black text-zinc-900 ml-1.5">
                      {caseItem.userRating.rating}/5 Stars
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {caseItem.userRating.ratedAt ? new Date(caseItem.userRating.ratedAt).toLocaleDateString('en-GB') : 'Rated'}
                  </span>
                </div>
                {caseItem.userRating.feedback && (
                  <p className="text-xs text-zinc-700 italic bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                    "{caseItem.userRating.feedback}"
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const activeScore = hoverRating || ratingScore;
                    const isFilled = star <= activeScore;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRatingScore(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 hover:scale-115 transition-transform"
                        title={`Rate ${star} star`}
                      >
                        <Star
                          className={`w-6 h-6 transition-colors ${
                            isFilled
                              ? 'text-amber-500 fill-amber-400'
                              : 'text-zinc-300 hover:text-amber-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                  <span className="text-xs font-bold text-amber-900 ml-2">
                    {ratingScore === 5 ? '5/5 Excellent' : ratingScore === 4 ? '4/5 Very Good' : ratingScore === 3 ? '3/5 Good' : ratingScore === 2 ? '2/5 Fair' : '1/5 Needs Attention'}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Optional feedback (e.g., Fast police recovery in Ngutani)..."
                    className="flex-1 bg-white border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                  <button
                    type="button"
                    onClick={handleSubmitRating}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition-all shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Logs */}
          {caseItem.actionLogs && caseItem.actionLogs.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Activity & Response History
              </span>
              <div className="space-y-1.5">
                {caseItem.actionLogs.slice(0, 4).map((log) => (
                  <div key={log.id} className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span className="font-bold text-zinc-700">{log.officer || log.officerName || 'Response Desk'}</span>
                      <span>{new Date(log.timestamp).toLocaleDateString('en-GB')}</span>
                    </div>
                    <div className="font-semibold text-zinc-900 mt-0.5">
                      {log.action}
                    </div>
                    {(log.notes || log.note) && (
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {log.notes || log.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-zinc-50 p-3 sm:p-4 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              id="export-case-pdf-btn"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className="bg-red-700 hover:bg-red-800 text-white font-extrabold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Download official PDF incident dossier for this case"
            >
              {isExportingPDF ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Download className="w-3.5 h-3.5 text-white" />
              )}
              <span>{isExportingPDF ? 'Generating...' : 'Export PDF Report'}</span>
            </button>

            <button
              id="export-case-drive-btn"
              onClick={handleExportDrive}
              disabled={isExportingToDrive}
              className="bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
              title="Export complete case evidence to Google Drive"
            >
              <svg viewBox="0 0 87.3 78" className="w-3.5 h-3.5 shrink-0">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A8.9 8.9 0 0 0 0 53h27.5z" fill="#00ac47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335"/>
                <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/>
                <path d="M59.8 53H87.3c0-1.55-.4-3.1-1.2-4.5l-13.75-23.8-13.75 23.8z" fill="#2684fc"/>
                <path d="m73.55 76.8-13.75-23.8H27.5L41.25 76.8c1.35.8 2.9 1.2 4.45 1.2h23.4c1.55 0 3.1-.4 4.45-1.2z" fill="#ffba00"/>
              </svg>
              <span>{isExportingToDrive ? 'Saving...' : 'Drive Backup'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isSuperUser && onNavigateToTab && (
              <button
                onClick={() => {
                  onNavigateToTab('super_portal');
                  onClose();
                }}
                className="bg-zinc-950 hover:bg-zinc-900 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>Triage Desk</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

