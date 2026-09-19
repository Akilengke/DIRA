import React, { useState, useMemo } from 'react';
import {
  X,
  FileText,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  TrendingUp,
  Shield,
  Loader2,
  ChevronDown,
  Clock,
  Sparkles
} from 'lucide-react';
import { DonkeyCase, CaseCategory } from '../types';
import { CATEGORY_INFO } from '../data/mockData';
import {
  ReportPeriodType,
  GeneralReportConfig,
  getPresetPeriodDates,
  exportGeneralReportPDF,
  filterCasesForReport,
  triggerPDFDownload,
} from '../services/pdfReportService';
import { exportTextFileToDrive } from '../services/googleDriveService';
import { hasValidGoogleToken, googleSignIn } from '../services/firebaseAuth';

interface GeneralReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  cases: DonkeyCase[];
}

export const GeneralReportModal: React.FC<GeneralReportModalProps> = ({
  isOpen,
  onClose,
  cases,
}) => {
  if (!isOpen) return null;

  const [periodType, setPeriodType] = useState<ReportPeriodType>('weekly');
  const [periodOffset, setPeriodOffset] = useState<number>(0);
  const [selectedSubCounty, setSelectedSubCounty] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Sub-county options in Kitui
  const subCounties = [
    { value: 'all', label: 'All Kitui Sub-Counties' },
    { value: 'Kitui Central', label: 'Kitui Central' },
    { value: 'Kitui South', label: 'Kitui South' },
    { value: 'Kitui Rural', label: 'Kitui Rural' },
    { value: 'Kitui East', label: 'Kitui East' },
    { value: 'Kitui West', label: 'Kitui West' },
    { value: 'Mwingi Central', label: 'Mwingi Central' },
    { value: 'Mwingi North', label: 'Mwingi North' },
    { value: 'Mwingi West', label: 'Mwingi West' },
  ];

  // Compute period dates
  const activePeriodInfo = useMemo(() => {
    return getPresetPeriodDates(periodType, periodOffset);
  }, [periodType, periodOffset]);

  // Options for period dropdown based on periodType
  const periodOptions = useMemo(() => {
    if (periodType === 'weekly') {
      return [
        { offset: 0, label: 'Current Week' },
        { offset: 1, label: 'Previous Week' },
        { offset: 2, label: '2 Weeks Ago' },
        { offset: 3, label: '3 Weeks Ago' },
        { offset: 4, label: '4 Weeks Ago' },
      ];
    }
    if (periodType === 'monthly') {
      return [
        { offset: 0, label: 'Current Month' },
        { offset: 1, label: 'Previous Month' },
        { offset: 2, label: '2 Months Ago' },
        { offset: 3, label: '3 Months Ago' },
        { offset: 6, label: '6 Months Ago' },
      ];
    }
    if (periodType === 'quarterly') {
      return [
        { offset: 0, label: 'Current Quarter' },
        { offset: 1, label: 'Previous Quarter' },
        { offset: 2, label: '2 Quarters Ago' },
        { offset: 3, label: '3 Quarters Ago' },
      ];
    }
    if (periodType === 'annually') {
      return [
        { offset: 0, label: 'Current Year (2026)' },
        { offset: 1, label: 'Previous Year (2025)' },
        { offset: 2, label: 'Year 2024' },
      ];
    }
    return [{ offset: 0, label: 'All Recorded History' }];
  }, [periodType]);

  // Construct config object
  const reportConfig: GeneralReportConfig = useMemo(() => {
    return {
      periodType,
      periodLabel: activePeriodInfo.label,
      startDate: periodType === 'all' ? null : activePeriodInfo.startDate,
      endDate: periodType === 'all' ? null : activePeriodInfo.endDate,
      subCounty: selectedSubCounty,
      category: selectedCategory,
    };
  }, [periodType, activePeriodInfo, selectedSubCounty, selectedCategory]);

  // Filter cases for live preview
  const matchingCases = useMemo(() => {
    return filterCasesForReport(cases, reportConfig);
  }, [cases, reportConfig]);

  // Preview stats
  const previewStats = useMemo(() => {
    let donkeys = 0;
    let resolved = 0;
    let photosCount = 0;
    matchingCases.forEach((c) => {
      donkeys += c.donkeysCount || 1;
      if (c.status === 'resolved') resolved += 1;
      if (c.photos && c.photos.length > 0) {
        photosCount += c.photos.length;
      }
      if (c.actionLogs) {
        c.actionLogs.forEach((l) => {
          if (l.evidencePhoto) photosCount += 1;
        });
      }
    });
    const resRate = matchingCases.length > 0 ? ((resolved / matchingCases.length) * 100).toFixed(0) : '0';
    return {
      totalCases: matchingCases.length,
      donkeysAffected: donkeys,
      resolvedCount: resolved,
      resolutionRate: resRate,
      photosCount,
    };
  }, [matchingCases]);

  // Handle PDF Export
  const handleExportPDF = async () => {
    setIsGenerating(true);
    setSuccessToast(null);
    try {
      const { filename } = await exportGeneralReportPDF(cases, reportConfig, { autoDownload: true });
      setSuccessToast(`Report exported successfully! Downloaded as ${filename}`);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Error exporting general report PDF:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Save to Google Drive
  const handleSaveToDrive = async () => {
    setIsSavingToDrive(true);
    setSuccessToast(null);
    try {
      if (!hasValidGoogleToken()) {
        await googleSignIn();
      }
      const { filename, blob } = await exportGeneralReportPDF(cases, reportConfig, { autoDownload: false });
      
      // Also save dossier markdown / metadata to drive
      const reportMarkdown = `# DIRA General Audit Report - ${reportConfig.periodLabel}
Generated: ${new Date().toISOString()}
Scope: ${selectedSubCounty} | Category: ${selectedCategory}
Total Cases: ${previewStats.totalCases}
Donkeys Affected: ${previewStats.donkeysAffected}
Resolution Rate: ${previewStats.resolutionRate}%
Cases:
${matchingCases.map(c => `- #${c.trackingCode} | ${c.title} | ${c.category} | ${c.location?.subCounty || 'Kitui'} | ${c.status}`).join('\n')}
`;
      await exportTextFileToDrive(filename.replace('.pdf', '.txt'), reportMarkdown, 'text/plain');
      setSuccessToast(`Report saved to your Google Drive Evidence Vault!`);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Drive save error:', err);
    } finally {
      setIsSavingToDrive(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="general-report-modal"
        className="w-full max-w-2xl bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-zinc-950 text-white p-4 sm:p-5 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <img
                src="/caritas-kitui-logo.png"
                alt="Caritas Kitui Emblem"
                className="w-10 h-10 rounded-xl object-cover border border-white/30 bg-white"
                referrerPolicy="no-referrer"
              />
              <img
                src="/pwa-192x192.png"
                alt="DIRA Logo"
                className="w-10 h-10 rounded-xl object-cover border border-white/30 bg-zinc-900"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-red-600/30 border border-red-500/40 text-red-300">
                  Caritas Kitui • DIRA Desk
                </span>
                <span className="text-xs text-zinc-400 font-mono">Official PDF Reports Engine</span>
              </div>
              <h2 className="text-base sm:text-lg font-black font-display text-white mt-0.5">
                Generate General Cases Audit Report
              </h2>
            </div>
          </div>

          <button
            id="btn-close-general-report-modal"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Toast Alert if any */}
          {successToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-900 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successToast}</span>
            </div>
          )}

          {/* 1. Frequency Horizon Selector Tabs */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block">
              1. Select Reporting Frequency
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 p-1 bg-zinc-100 rounded-2xl">
              <button
                id="tab-freq-weekly"
                onClick={() => {
                  setPeriodType('weekly');
                  setPeriodOffset(0);
                }}
                className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  periodType === 'weekly'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                }`}
              >
                Weekly
              </button>

              <button
                id="tab-freq-monthly"
                onClick={() => {
                  setPeriodType('monthly');
                  setPeriodOffset(0);
                }}
                className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  periodType === 'monthly'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                }`}
              >
                Monthly
              </button>

              <button
                id="tab-freq-quarterly"
                onClick={() => {
                  setPeriodType('quarterly');
                  setPeriodOffset(0);
                }}
                className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  periodType === 'quarterly'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                }`}
              >
                Quarterly
              </button>

              <button
                id="tab-freq-annually"
                onClick={() => {
                  setPeriodType('annually');
                  setPeriodOffset(0);
                }}
                className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  periodType === 'annually'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                }`}
              >
                Annually
              </button>

              <button
                id="tab-freq-all"
                onClick={() => {
                  setPeriodType('all');
                  setPeriodOffset(0);
                }}
                className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer col-span-2 sm:col-span-1 ${
                  periodType === 'all'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                }`}
              >
                All Time
              </button>
            </div>
          </div>

          {/* 2. Target Period Range Selector */}
          {periodType !== 'all' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-red-600" />
                <span>Target {periodType.charAt(0).toUpperCase() + periodType.slice(1)} Range</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  id="select-period-offset"
                  value={periodOffset}
                  onChange={(e) => setPeriodOffset(Number(e.target.value))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                >
                  {periodOptions.map((opt) => (
                    <option key={opt.offset} value={opt.offset}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <div className="bg-red-50/70 border border-red-200/80 rounded-xl px-3 py-2 text-xs flex items-center justify-between text-red-950 font-bold">
                  <span className="text-[11px] text-red-700 font-medium">Selected Period:</span>
                  <span className="font-mono text-xs">{activePeriodInfo.label}</span>
                </div>
              </div>
            </div>
          )}

          {/* 3. Scope Filters (Sub-County & Category) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 block">
                Filter by Kitui Sub-County
              </label>
              <select
                id="select-filter-subcounty"
                value={selectedSubCounty}
                onChange={(e) => setSelectedSubCounty(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-red-500"
              >
                {subCounties.map((sc) => (
                  <option key={sc.value} value={sc.value}>
                    {sc.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 block">
                Filter by Incident Category
              </label>
              <select
                id="select-filter-category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-red-500"
              >
                <option value="all">All Incident Categories</option>
                <option value="donkey_theft">Donkey Theft (Wizi wa Punda)</option>
                <option value="bush_slaughter">Illegal Bush Slaughter (Uchinjaji Haramu)</option>
                <option value="trafficking">Trafficking & Transit (Usafirishaji)</option>
                <option value="general_abuse">Abuse & Neglect (Ukatili na Majeraha)</option>
                <option value="other">Other / Welfare Reports</option>
              </select>
            </div>
          </div>

          {/* 4. Real-time Live Summary Metric Card */}
          <div className="bg-zinc-950 text-white p-4 rounded-2xl border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-red-500" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                  Report Scope Preview
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 font-mono">
                {activePeriodInfo.label}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">
                  Cases in Audit
                </span>
                <span className="text-xl font-black text-white font-mono mt-0.5 block">
                  {previewStats.totalCases}
                </span>
              </div>

              <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">
                  Donkeys Affected
                </span>
                <span className="text-xl font-black text-amber-400 font-mono mt-0.5 block">
                  {previewStats.donkeysAffected}
                </span>
              </div>

              <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">
                  Cases Resolved
                </span>
                <span className="text-xl font-black text-emerald-400 font-mono mt-0.5 block">
                  {previewStats.resolvedCount}
                </span>
              </div>

              <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                <span className="text-[10px] text-zinc-400 uppercase font-bold block">
                  Resolution Rate
                </span>
                <span className="text-xl font-black text-white font-mono mt-0.5 block">
                  {previewStats.resolutionRate}%
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-xs">
              <span className="text-zinc-400 text-[11px]">Audit Assets:</span>
              <div className="flex items-center gap-2">
                {previewStats.photosCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 rounded-md">
                    📷 {previewStats.photosCount} Incident Photo{previewStats.photosCount > 1 ? 's' : ''} Included in Gallery
                  </span>
                ) : (
                  <span className="text-zinc-400 text-[11px]">No photos attached in this period</span>
                )}
              </div>
            </div>

            {previewStats.totalCases === 0 && (
              <p className="text-xs text-amber-300/90 pt-1">
                Notice: No recorded cases match the exact filters for this period. An audit header will still be generated indicating zero incidents.
              </p>
            )}
          </div>

          {/* Report Features Included */}
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-1.5 text-xs text-zinc-600">
            <div className="font-bold text-zinc-900 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-red-600" />
              <span>What is included in the generated PDF report?</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-500 pl-1">
              <li><strong>Official Caritas Kitui & DIRA institutional letterhead and logos</strong> on every page (Weekly, Monthly, Quarterly, Annual, and All-Time reports)</li>
              <li><strong>Field photographic evidence gallery</strong> — all scene and enforcement action photos included automatically whenever cases have photos</li>
              <li>Executive KPI summary (Total volume, donkeys recovered, resolution metrics)</li>
              <li>Complete crime & welfare breakdown by category (theft, slaughter, transit, abuse)</li>
              <li>Geographic sub-county hotspot distribution matrix</li>
              <li>Full tabular incident ledger with timestamps, reference codes, status, and lead officers</li>
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-zinc-50 p-4 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            id="btn-save-report-drive"
            onClick={handleSaveToDrive}
            disabled={isSavingToDrive || isGenerating}
            className="w-full sm:w-auto bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
            title="Export general audit summary to Google Drive evidence folder"
          >
            {isSavingToDrive ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
            ) : (
              <svg viewBox="0 0 87.3 78" className="w-4 h-4 shrink-0">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A8.9 8.9 0 0 0 0 53h27.5z" fill="#00ac47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335"/>
                <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/>
                <path d="M59.8 53H87.3c0-1.55-.4-3.1-1.2-4.5l-13.75-23.8-13.75 23.8z" fill="#2684fc"/>
                <path d="m73.55 76.8-13.75-23.8H27.5L41.25 76.8c1.35.8 2.9 1.2 4.45 1.2h23.4c1.55 0 3.1-.4 4.45-1.2z" fill="#ffba00"/>
              </svg>
            )}
            <span>{isSavingToDrive ? 'Uploading to Drive...' : 'Save to Drive'}</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="btn-cancel-general-report"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              id="btn-download-general-report-pdf"
              onClick={handleExportPDF}
              disabled={isGenerating}
              className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Compiling PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-white" />
                  <span>Export {periodType.charAt(0).toUpperCase() + periodType.slice(1)} Report (PDF)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
