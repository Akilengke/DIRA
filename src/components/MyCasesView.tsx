import React, { useState, useMemo } from 'react';
import { 
  FileText, MapPin, Clock, CheckCircle2, AlertTriangle, 
  ShieldAlert, ChevronRight, Plus, Copy, Check, Filter, Search,
  Star, MessageSquare, Shield, CheckCheck, Sparkles, User,
  Calendar, Phone, Info, Send, CornerDownRight, ThumbsUp, Radio, ArrowRight,
  Activity, Heart, LayoutGrid, List, Eye, ArrowDownUp, Download, Loader2
} from 'lucide-react';
import { DonkeyCase, UserProfile, CaseStatus } from '../types';
import { CATEGORY_INFO } from '../data/mockData';
import { exportCaseDossierToDrive } from '../services/googleDriveService';
import { hasValidGoogleToken, googleSignIn } from '../services/firebaseAuth';
import { CaseDetailsPreviewModal } from './CaseDetailsPreviewModal';
import { exportSingleCasePDF } from '../services/pdfReportService';
import { GeneralReportModal } from './GeneralReportModal';
import { sortCasesLatestFirst, formatReportedDateTime, formatReportedRelative } from '../utils/dateUtils';

interface MyCasesViewProps {
  cases: DonkeyCase[];
  currentUser: UserProfile;
  onOpenReportModal: () => void;
  onRateCase?: (caseId: string, rating: number, feedback?: string) => void;
  onOpenAuthModal?: () => void;
  onOpenDriveModal?: () => void;
  onNavigateToTab?: (tab: 'home' | 'my_cases' | 'hotspots' | 'super_portal' | 'helpline') => void;
}

export const MyCasesView: React.FC<MyCasesViewProps> = ({
  cases,
  currentUser,
  onOpenReportModal,
  onRateCase,
  onOpenAuthModal,
  onOpenDriveModal,
  onNavigateToTab,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<DonkeyCase | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [viewScope, setViewScope] = useState<'my' | 'all'>('my');
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid');

  // Google Drive export state
  const [exportingCaseId, setExportingCaseId] = useState<string | null>(null);
  const [driveSuccessToast, setDriveSuccessToast] = useState<string | null>(null);

  // PDF Report states
  const [exportingPDFCaseId, setExportingPDFCaseId] = useState<string | null>(null);
  const [isGeneralReportOpen, setIsGeneralReportOpen] = useState<boolean>(false);

  const handleQuickExportPDF = async (c: DonkeyCase, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExportingPDFCaseId(c.id);
    setDriveSuccessToast(null);
    try {
      const { filename } = await exportSingleCasePDF(c, { autoDownload: true });
      setDriveSuccessToast(`Case #${c.trackingCode} report downloaded: ${filename}`);
      setTimeout(() => setDriveSuccessToast(null), 5000);
    } catch (err: any) {
      console.error('PDF export failed:', err);
    } finally {
      setExportingPDFCaseId(null);
    }
  };

  const handleExportCase = async (c: DonkeyCase, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExportingCaseId(c.id);
    setDriveSuccessToast(null);
    try {
      if (!hasValidGoogleToken()) {
        await googleSignIn();
      }
      await exportCaseDossierToDrive(c);
      setDriveSuccessToast(`Case #${c.trackingCode} saved to your Google Drive Evidence Vault!`);
      setTimeout(() => setDriveSuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Drive export failed:', err);
    } finally {
      setExportingCaseId(null);
    }
  };

  // Filter cases reported strictly by the logged-in user
  const userReportedCases = cases.filter((c) => {
    if (!currentUser) return false;
    const cleanUserPhone = (currentUser.phone || '').replace(/\D/g, '');
    const cleanCasePhone = (c.reporter?.phone || c.reporterUserPhone || '').replace(/\D/g, '');
    const phoneMatch = cleanUserPhone && cleanCasePhone && (cleanUserPhone.endsWith(cleanCasePhone.slice(-9)) || cleanCasePhone.endsWith(cleanUserPhone.slice(-9)));
    const nameMatch = currentUser.name && c.reporter?.name && currentUser.name.trim().toLowerCase() === c.reporter.name.trim().toLowerCase();
    const idMatch = (c.reporterUserId && (c.reporterUserId === currentUser.id || c.reporter?.id === currentUser.id));
    return Boolean(phoneMatch || nameMatch || idMatch);
  });

  // Decide active pool based on viewScope (or fallback to all if user hasn't filed any yet)
  const effectivePool = (viewScope === 'my' && userReportedCases.length > 0) ? userReportedCases : cases;

  // Filter cases and arrange them strictly from latest to oldest
  const displayCases = useMemo(() => {
    const filtered = effectivePool.filter((c) => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'reported') return c.status === 'reported' || c.status === 'pending';
      if (filterStatus === 'under_review') return c.status === 'under_review';
      if (filterStatus === 'active') return c.status === 'investigating' || c.status === 'dispatched';
      if (filterStatus === 'resolved') return c.status === 'resolved';
      return c.status === filterStatus;
    });
    return sortCasesLatestFirst(filtered);
  }, [effectivePool, filterStatus]);

  const handleCopy = (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'donkey_theft':
        return <ShieldAlert className="w-5 h-5 text-red-600" />;
      case 'slaughter_bush':
        return <AlertTriangle className="w-5 h-5 text-rose-600" />;
      case 'cruelty_injury':
        return <Activity className="w-5 h-5 text-amber-600" />;
      case 'welfare_neglect':
        return <Heart className="w-5 h-5 text-orange-600" />;
      default:
        return <FileText className="w-5 h-5 text-blue-600" />;
    }
  };

  const getStatusColor = (status: CaseStatus) => {
    switch (status) {
      case 'resolved':
        return { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' };
      case 'investigating':
      case 'dispatched':
        return { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500 animate-pulse' };
      case 'under_review':
        return { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', dot: 'bg-blue-500' };
      default:
        return { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', dot: 'bg-red-500' };
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-red-950 text-white p-4 sm:p-5 rounded-3xl shadow-md border border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-red-600/30 border border-red-500/40 text-red-300">
                Case Management Hub
              </span>
              <span className="text-xs text-zinc-400">Clean Icon Interface</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black font-display text-white">
              Kitui Donkey Cases (Kesi Zilizoripotiwa)
            </h1>
            <p className="text-xs text-zinc-300 max-w-xl">
              Each case is represented by an icon with its reference number. Click any icon to view complete details, GPS coordinates, investigation progress, or rate officer performance.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-general-report-pdf"
              onClick={() => setIsGeneralReportOpen(true)}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3.5 py-2 rounded-2xl text-xs flex items-center gap-1.5 border border-zinc-700 shadow-xs active:scale-95 transition-all cursor-pointer"
              title="Export Weekly, Monthly, Quarterly or Annual Case Audit Report (PDF)"
            >
              <FileText className="w-3.5 h-3.5 text-red-400" />
              <span>General Report (PDF)</span>
            </button>

            <button
              onClick={onOpenReportModal}
              className="bg-red-600 hover:bg-red-700 text-white font-extrabold px-4 py-2 rounded-2xl text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Ripoti Mpya</span>
            </button>
          </div>
        </div>

        {/* User Identity & Sub-Controls */}
        <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="text-[11px]">Logged in as: <strong className="text-zinc-200">{currentUser.name}</strong></span>
            {userReportedCases.length > 0 && (
              <div className="flex items-center bg-black/40 rounded-xl p-0.5 border border-zinc-700">
                <button
                  onClick={() => setViewScope('my')}
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                    viewScope === 'my' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  My Reports ({userReportedCases.length})
                </button>
                <button
                  onClick={() => setViewScope('all')}
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                    viewScope === 'all' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  All County Cases ({cases.length})
                </button>
              </div>
            )}
          </div>

          {/* Layout Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400 font-medium">Layout:</span>
            <div className="flex items-center bg-black/40 rounded-xl p-0.5 border border-zinc-700">
              <button
                onClick={() => setViewLayout('grid')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewLayout === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
                title="Icon Tile Grid"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewLayout('list')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewLayout === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
                title="Compact List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Google Drive Status Toast */}
      {driveSuccessToast && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{driveSuccessToast}</span>
          </div>
        </div>
      )}

      {/* 2. Filter Tabs & Sort Order Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none no-scrollbar">
          {[
            { id: 'all', label: 'All Cases', count: effectivePool.length },
            { id: 'reported', label: '1. Reported', count: effectivePool.filter(c => c.status === 'reported' || c.status === 'pending').length },
            { id: 'under_review', label: '2. Under Review', count: effectivePool.filter(c => c.status === 'under_review').length },
            { id: 'active', label: '3. Active / Dispatched', count: effectivePool.filter(c => c.status === 'investigating' || c.status === 'dispatched').length },
            { id: 'resolved', label: '4. Resolved ✓', count: effectivePool.filter(c => c.status === 'resolved').length },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`filter-tab-${tab.id}`}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                filterStatus === tab.id
                  ? 'bg-zinc-950 text-white shadow-xs'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  filterStatus === tab.id ? 'bg-red-600 text-white' : 'bg-zinc-200 text-zinc-800'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {displayCases.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium shrink-0 self-end sm:self-center bg-zinc-100/90 px-2.5 py-1 rounded-xl border border-zinc-200">
            <ArrowDownUp className="w-3.5 h-3.5 text-[#991B1B]" />
            <span>Arranged: <strong className="text-zinc-800 font-bold">Latest to Oldest</strong></span>
          </div>
        )}
      </div>

      {/* 3. Cases Rendered Cleanly as Icons with Reference Numbers */}
      {displayCases.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-zinc-200 text-center space-y-4 shadow-2xs">
          <div className="w-14 h-14 rounded-3xl bg-red-50 text-red-700 flex items-center justify-center mx-auto border border-red-200 shadow-2xs">
            <FileText className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-900 font-display">
              {filterStatus === 'all' 
                ? 'No donkey cases recorded yet' 
                : `No cases currently in "${filterStatus.replace('_', ' ')}" status`}
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Whenever an incident is logged, it appears here as an interactive icon with its tracking reference number.
            </p>
          </div>
          <button
            onClick={onOpenReportModal}
            className="bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-xs inline-flex items-center gap-2 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Report Donkey Incident</span>
          </button>
        </div>
      ) : viewLayout === 'grid' ? (
        /* GRID LAYOUT: Clean Icon + Reference Number Tiles */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayCases.map((c) => {
            const cat = CATEGORY_INFO[c.category] || CATEGORY_INFO['other'];
            const statusStyle = getStatusColor(c.status);
            const isResolved = c.status === 'resolved';

            return (
              <div
                key={c.id}
                id={`case-icon-tile-${c.id}`}
                onClick={() => setSelectedCase(c)}
                className="group relative bg-white hover:bg-zinc-50/80 rounded-2xl border border-zinc-200/90 p-3.5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 text-left overflow-hidden hover:border-zinc-300"
              >
                {/* Top Row: Icon with Reference Number & Status */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    {/* Primary Case Icon Button */}
                    <div className="w-11 h-11 rounded-2xl bg-zinc-100 group-hover:bg-red-50 border border-zinc-200 group-hover:border-red-200 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all">
                      {getCategoryIcon(c.category)}
                    </div>

                    <div>
                      {/* Case Reference Number (Prominently Highlighted) */}
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black text-zinc-900 group-hover:text-red-700 transition-colors">
                          #{c.trackingCode}
                        </span>
                        <button
                          onClick={(e) => handleCopy(c.trackingCode, e)}
                          className="p-1 text-zinc-400 hover:text-zinc-700 transition-colors"
                          title="Copy reference code"
                        >
                          {copiedCode === c.trackingCode ? (
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      <span className="text-[10px] text-zinc-500 font-medium block truncate max-w-[130px]">
                        {c.location?.subCounty || 'Kitui'} • {c.location?.village || 'Area'}
                      </span>
                    </div>
                  </div>

                  {/* Status Indicator Pill */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                    <span>{isResolved ? 'Resolved' : c.status.replace('_', ' ')}</span>
                  </span>
                </div>

                {/* Case Title Preview */}
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 group-hover:text-zinc-950 line-clamp-1">
                    {c.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                    <span>{c.donkeysCount} {c.donkeysCount === 1 ? 'donkey' : 'donkeys'}</span>
                    <span>•</span>
                    <span className="capitalize">{cat.label}</span>
                  </div>
                </div>

                {/* Prominent Date Reported Badge */}
                <div className="bg-zinc-50 hover:bg-zinc-100/70 border border-zinc-200/80 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-[10px] transition-colors">
                  <div className="flex items-center gap-1.5 text-zinc-700 font-medium truncate">
                    <Calendar className="w-3.5 h-3.5 text-[#991B1B] shrink-0" />
                    <span>Reported: <strong className="text-zinc-900 font-extrabold">{formatReportedDateTime(c.reportedAt)}</strong></span>
                  </div>
                  {formatReportedRelative(c.reportedAt) && (
                    <span className="text-[9px] font-bold text-zinc-500 bg-white px-1.5 py-0.5 rounded border border-zinc-200 shrink-0 ml-1">
                      {formatReportedRelative(c.reportedAt)}
                    </span>
                  )}
                </div>

                {/* Bottom Row: Rating Chip & Quick Action prompt */}
                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px]">
                  {c.userRating ? (
                    <div className="flex items-center gap-1 text-amber-600 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      <span>{c.userRating.rating}/5 Rated</span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      ★ Rate Case
                    </span>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      id={`btn-pdf-case-${c.id}`}
                      onClick={(e) => handleQuickExportPDF(c, e)}
                      disabled={exportingPDFCaseId === c.id}
                      className="p-1 text-zinc-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                      title="Export Case Report PDF"
                    >
                      {exportingPDFCaseId === c.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <span className="text-[11px] font-bold text-zinc-700 group-hover:text-red-700 flex items-center gap-0.5 transition-colors">
                      <span>View</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST LAYOUT: Compact Reference Rows */
        <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden shadow-2xs">
          {displayCases.map((c) => {
            const cat = CATEGORY_INFO[c.category] || CATEGORY_INFO['other'];
            const statusStyle = getStatusColor(c.status);
            const isResolved = c.status === 'resolved';

            return (
              <div
                key={c.id}
                id={`case-icon-row-${c.id}`}
                onClick={() => setSelectedCase(c)}
                className="group p-3 sm:p-4 hover:bg-zinc-50/80 transition-colors flex items-center justify-between gap-3 cursor-pointer"
              >
                {/* Left: Icon & Code */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 group-hover:bg-red-50 border border-zinc-200 group-hover:border-red-200 flex items-center justify-center shrink-0 shadow-2xs">
                    {getCategoryIcon(c.category)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-zinc-900 group-hover:text-red-700 transition-colors">
                        #{c.trackingCode}
                      </span>
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text}`}>
                        {isResolved ? 'Resolved' : c.status.replace('_', ' ')}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-zinc-900 truncate">
                      {c.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500 mt-0.5">
                      <span>{c.location?.subCounty || 'Kitui'}{c.location?.village ? `, ${c.location.village}` : ''} • {c.donkeysCount || 1} Donkey(s)</span>
                      <span className="text-zinc-300">•</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-zinc-700 bg-zinc-100/90 px-1.5 py-0.5 rounded border border-zinc-200">
                        <Calendar className="w-3 h-3 text-[#991B1B]" />
                        <span>Reported: {formatReportedDateTime(c.reportedAt)}</span>
                        {formatReportedRelative(c.reportedAt) && (
                          <span className="text-[9px] text-zinc-400 font-normal">({formatReportedRelative(c.reportedAt)})</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Rating indicator & Click to View */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {c.userRating ? (
                    <div className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      <span>{c.userRating.rating}/5</span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 hidden sm:inline-block">
                      ★ Rate Case
                    </span>
                  )}

                  <button
                    id={`btn-list-pdf-${c.id}`}
                    onClick={(e) => handleQuickExportPDF(c, e)}
                    disabled={exportingPDFCaseId === c.id}
                    className="p-1.5 text-zinc-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200 cursor-pointer"
                    title="Export Case Report PDF"
                  >
                    {exportingPDFCaseId === c.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Full Case Details & Rating Modal */}
      <CaseDetailsPreviewModal
        isOpen={Boolean(selectedCase)}
        onClose={() => setSelectedCase(null)}
        caseItem={selectedCase}
        currentUser={currentUser}
        onRateCase={(caseId, rating, feedback) => {
          if (onRateCase) {
            onRateCase(caseId, rating, feedback);
          }
          // Also update local selected case userRating for instant reactivity
          if (selectedCase && selectedCase.id === caseId) {
            setSelectedCase({
              ...selectedCase,
              userRating: {
                rating,
                feedback,
                ratedAt: new Date().toISOString(),
                ratedByUserId: currentUser.id,
              },
            });
          }
        }}
        onNavigateToTab={onNavigateToTab}
      />

      {/* 5. General Report (Weekly, Monthly, Quarterly, Annually) Modal */}
      <GeneralReportModal
        isOpen={isGeneralReportOpen}
        onClose={() => setIsGeneralReportOpen(false)}
        cases={cases}
      />
    </div>
  );
};
