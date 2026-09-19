import React, { useMemo } from 'react';
import { 
  FileText, Plus, MapPin, Clock, CheckCircle2, 
  ChevronRight, PhoneCall, ShieldAlert, Sparkles, AlertTriangle, Eye, CheckCheck, LogIn, Calendar, ArrowDownUp, Download, Image as ImageIcon
} from 'lucide-react';
import { DonkeyCase } from '../types';
import { CATEGORY_INFO, EMERGENCY_HOTLINE, HOTLINE_DISPLAY } from '../data/mockData';
import { sortCasesLatestFirst, formatReportedDateTime, formatReportedRelative } from '../utils/dateUtils';
import { exportSingleCasePDF } from '../services/pdfReportService';

interface MyReportsViewProps {
  cases: DonkeyCase[];
  onOpenReportModal: () => void;
  onOpenAuthModal?: () => void;
  userPhone?: string;
  userName?: string;
  isLoggedIn?: boolean;
}

export const MyReportsView: React.FC<MyReportsViewProps> = ({
  cases,
  onOpenReportModal,
  onOpenAuthModal,
  userPhone = '',
  userName = '',
  isLoggedIn = false,
}) => {
  // Filter cases to strictly show only those reported by the logged-in user, sorted latest first
  const userCases = useMemo(() => {
    const list = cases.filter((c) => {
      if (!isLoggedIn && !userPhone && !userName) {
        return false;
      }
      const cleanUserPhone = (userPhone || '').replace(/\D/g, '');
      const cleanCasePhone = (c.reporter?.phone || c.reporterUserPhone || '').replace(/\D/g, '');
      const phoneMatch = cleanUserPhone && cleanCasePhone && (cleanUserPhone.endsWith(cleanCasePhone.slice(-9)) || cleanCasePhone.endsWith(cleanUserPhone.slice(-9)));
      const nameMatch = userName && c.reporter?.name && c.reporter.name.trim().toLowerCase() === userName.trim().toLowerCase();
      const idMatch = (c.reporterUserId && (c.reporterUserId === userPhone || c.reporter?.id === userPhone));

      return Boolean(phoneMatch || nameMatch || idMatch);
    });
    return sortCasesLatestFirst(list);
  }, [cases, isLoggedIn, userPhone, userName]);

  return (
    <div className="space-y-3.5 pb-16">
      {/* Header Banner in Brick Red with Caritas Kitui and DIRA Logos */}
      <div className="bg-gradient-to-r from-[#991B1B] via-[#7F1D1D] to-[#991B1B] text-white p-4 sm:p-5 rounded-3xl shadow-sm border border-red-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <img
              src="/caritas-kitui-logo.png"
              alt="Caritas Kitui Emblem"
              className="w-11 h-11 rounded-2xl object-cover border-2 border-white/40 shadow-sm bg-white"
              referrerPolicy="no-referrer"
            />
            <img
              src="/pwa-192x192.png"
              alt="DIRA Logo"
              className="w-11 h-11 rounded-2xl object-cover border-2 border-white/40 shadow-sm bg-zinc-950"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-200">
                Community Tracking Portal
              </span>
              <span className="text-[10px] bg-red-950/60 border border-red-400/30 px-2 py-0.5 rounded-full font-mono text-red-100">
                Official Evidence System
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black font-display text-white mt-0.5">
              My Submitted Cases (Ripoti Zangu)
            </h2>
            <p className="text-xs text-red-100 mt-0.5">
              Monitor real-time investigation updates, view photos, and download certified reports.
            </p>
          </div>
        </div>
        <button
          id="my-reports-new-case-btn"
          onClick={onOpenReportModal}
          className="bg-white hover:bg-zinc-100 text-[#991B1B] px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Report</span>
        </button>
      </div>

      {/* Guest Notice if not logged in */}
      {!isLoggedIn && (
        <div className="bg-zinc-900 text-white p-3.5 rounded-2xl border border-zinc-800 flex items-center justify-between shadow-xs">
          <div className="text-xs">
            <span className="font-bold block text-white">Not logged in?</span>
            <span className="text-[11px] text-zinc-400">Sign in with your phone number to track your reported cases across devices.</span>
          </div>
          {onOpenAuthModal && (
            <button
              onClick={onOpenAuthModal}
              className="bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs px-3 py-1.5 rounded-xl shrink-0 shadow-xs active:scale-95 transition-all ml-2 flex items-center gap-1"
            >
              <LogIn className="w-3.5 h-3.5 text-[#991B1B]" />
              <span>Log In</span>
            </button>
          )}
        </div>
      )}

      {/* Cases List */}
      <div className="space-y-2.5">
        {userCases.length > 0 && (
          <div className="flex items-center justify-between px-1 text-xs text-zinc-500 font-medium">
            <span>Showing {userCases.length} case{userCases.length === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center gap-1 font-bold text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-xl border border-zinc-200 text-[11px]">
              <ArrowDownUp className="w-3.5 h-3.5 text-[#991B1B]" />
              <span>Arranged: Latest to Oldest</span>
            </span>
          </div>
        )}

        {userCases.length === 0 ? (
          <div className="bg-white rounded-3xl border border-zinc-200 p-8 text-center space-y-3 shadow-2xs">
            <div className="w-12 h-12 bg-red-50 text-[#991B1B] rounded-2xl flex items-center justify-center mx-auto border border-red-200">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900">
              {isLoggedIn ? 'You have not submitted any cases yet' : 'Sign in to view your submitted cases'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {isLoggedIn
                ? `Cases logged from ${userName || userPhone} will be tracked here with officer updates and investigation logs.`
                : 'If you have lost a donkey, witnessed illegal bush slaughter, or observed cruelty in your village, submit a report for immediate officer action.'}
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={onOpenReportModal}
                className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md inline-flex items-center gap-1.5 border border-red-800 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Report Donkey Incident Now</span>
              </button>
              {!isLoggedIn && onOpenAuthModal && (
                <button
                  onClick={onOpenAuthModal}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5 text-amber-400" />
                  <span>Log In</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          userCases.map((c) => {
            const cat = CATEGORY_INFO[c.category] || CATEGORY_INFO['other'];
            const isResolved = c.status === 'resolved';

            return (
              <div
                key={c.id}
                id={`my-case-item-${c.id}`}
                className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-2xs space-y-2.5 hover:border-zinc-300 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${cat.badgeBg} ${cat.badgeBorder} ${cat.badgeText}`}>
                      {cat.label}
                    </span>
                    <span className="font-mono text-xs font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                      {c.trackingCode}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isResolved ? 'bg-zinc-100 text-zinc-900 border-zinc-300' : 'bg-red-50 text-red-900 border-red-200'
                  }`}>
                    {isResolved ? 'Resolved ✓' : c.status.replace('_', ' ')}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-zinc-950 font-display">
                    {c.title}
                  </h3>
                  <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed line-clamp-2">
                    {c.description}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                  <div className="flex items-center gap-1.5 text-zinc-600 truncate">
                    <MapPin className="w-3.5 h-3.5 text-[#991B1B] shrink-0" />
                    <span className="truncate">{c.location?.subCounty || 'Kitui'}{c.location?.village ? `, ${c.location.village}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-700 font-semibold bg-white px-2 py-0.5 rounded-lg border border-zinc-200 shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-[#991B1B] shrink-0" />
                    <span>Reported: {formatReportedDateTime(c.reportedAt)}</span>
                    {formatReportedRelative(c.reportedAt) && (
                      <span className="text-[9px] text-zinc-400 font-normal">({formatReportedRelative(c.reportedAt)})</span>
                    )}
                  </div>
                </div>

                {/* Evidence Photos Gallery */}
                {((c.photos && c.photos.length > 0) || (c.actionLogs && c.actionLogs.some(l => l.evidencePhoto))) && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 text-[#991B1B]" />
                      <span>Incident Field Photos & Evidence:</span>
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {c.photos?.map((p, idx) => {
                        const pUrl = typeof p === 'string' ? p : p.url;
                        if (!pUrl) return null;
                        return (
                          <div key={idx} className="relative group shrink-0">
                            <img
                              src={pUrl}
                              alt={(typeof p === 'object' && p.caption) || `Case photo #${idx + 1}`}
                              className="w-20 h-20 object-cover rounded-xl border border-zinc-200 shadow-2xs group-hover:scale-105 transition-all"
                              referrerPolicy="no-referrer"
                            />
                            {typeof p === 'object' && p.caption && (
                              <span className="absolute bottom-1 left-1 right-1 bg-black/70 text-white text-[8.5px] px-1 py-0.5 rounded truncate">
                                {p.caption}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {c.actionLogs?.filter(l => l.evidencePhoto).map((l, idx) => (
                        <div key={`log-${idx}`} className="relative group shrink-0">
                          <img
                            src={l.evidencePhoto}
                            alt={l.action}
                            className="w-20 h-20 object-cover rounded-xl border border-red-300 shadow-2xs group-hover:scale-105 transition-all"
                            referrerPolicy="no-referrer"
                          />
                          <span className="absolute bottom-1 left-1 right-1 bg-red-950/80 text-white text-[8.5px] px-1 py-0.5 rounded truncate">
                            Action Proof
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Latest Action Log / Status */}
                {c.actionLogs && c.actionLogs.length > 0 && (
                  <div className="p-2.5 bg-zinc-100/70 rounded-xl border border-zinc-200 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase">
                      <span>Latest Response Update</span>
                      <span>{new Date(c.actionLogs[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-zinc-800 text-[11px] leading-snug">
                      <strong>{c.actionLogs[0].officer || 'Caritas Desk'}:</strong> {c.actionLogs[0].notes}
                    </p>
                  </div>
                )}

                {/* Report Download Action Bar */}
                <div className="flex items-center justify-between pt-1.5 border-t border-zinc-100">
                  <span className="text-[11px] text-zinc-400 font-medium">
                    Certified Caritas Kitui Report
                  </span>
                  <button
                    id={`btn-download-report-pdf-${c.id}`}
                    onClick={async () => {
                      try {
                        await exportSingleCasePDF(c, { autoDownload: true });
                      } catch (err) {
                        console.error('Error downloading case report PDF:', err);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-[#991B1B] text-xs font-bold rounded-xl border border-red-200 active:scale-95 transition-all cursor-pointer shadow-2xs"
                    title="Download certified PDF report including logos and photos"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF Report</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
