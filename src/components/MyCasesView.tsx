import React, { useState } from 'react';
import { 
  FileText, MapPin, Clock, CheckCircle2, AlertTriangle, 
  ShieldAlert, ChevronRight, Plus, Copy, Check, Filter, Search,
  Star, MessageSquare, Shield, CheckCheck, Sparkles, User,
  Calendar, Phone, Info, Send, CornerDownRight, ThumbsUp, Radio, ArrowRight
} from 'lucide-react';
import { DonkeyCase, UserProfile, CaseStatus } from '../types';
import { CATEGORY_INFO } from '../data/mockData';

interface MyCasesViewProps {
  cases: DonkeyCase[];
  currentUser: UserProfile;
  onOpenReportModal: () => void;
  onRateCase?: (caseId: string, rating: number, feedback?: string) => void;
  onOpenAuthModal?: () => void;
}

interface StepDefinition {
  id: 'reported' | 'under_review' | 'active' | 'resolved';
  label: string;
  swahiliLabel: string;
  description: string;
}

const PROGRESS_STEPS: StepDefinition[] = [
  {
    id: 'reported',
    label: 'Reported',
    swahiliLabel: 'Imewasilishwa',
    description: 'Case recorded with GPS lock & assigned tracking code',
  },
  {
    id: 'under_review',
    label: 'Under Review',
    swahiliLabel: 'Inakaguliwa',
    description: 'Command triage, priority assessment & verification',
  },
  {
    id: 'active',
    label: 'Active / Action',
    swahiliLabel: 'Uchunguzi / Hatua',
    description: 'Field officer dispatched & tactical response active',
  },
  {
    id: 'resolved',
    label: 'Resolved',
    swahiliLabel: 'Imetatuliwa',
    description: 'Donkeys recovered, treated, or case finalized',
  },
];

export const MyCasesView: React.FC<MyCasesViewProps> = ({
  cases,
  currentUser,
  onOpenReportModal,
  onRateCase,
  onOpenAuthModal,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<DonkeyCase | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [ratingCaseId, setRatingCaseId] = useState<string | null>(null);
  const [ratingScore, setRatingScore] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [ratingSuccessMsg, setRatingSuccessMsg] = useState<string | null>(null);

  // Filter cases reported strictly by the logged-in user
  const userCases = cases.filter((c) => {
    if (!currentUser) return false;

    // Matching logic for reporter
    const cleanUserPhone = (currentUser.phone || '').replace(/\D/g, '');
    const cleanCasePhone = (c.reporter?.phone || c.reporterUserPhone || '').replace(/\D/g, '');
    const phoneMatch = cleanUserPhone && cleanCasePhone && (cleanUserPhone.endsWith(cleanCasePhone.slice(-9)) || cleanCasePhone.endsWith(cleanUserPhone.slice(-9)));
    const nameMatch = currentUser.name && c.reporter?.name && currentUser.name.trim().toLowerCase() === c.reporter.name.trim().toLowerCase();
    const idMatch = (c.reporterUserId && (c.reporterUserId === currentUser.id || c.reporter?.id === currentUser.id));

    const isUserCase = Boolean(phoneMatch || nameMatch || idMatch);
    if (!isUserCase) return false;

    if (filterStatus === 'all') return true;
    if (filterStatus === 'reported') return c.status === 'reported' || c.status === 'pending';
    if (filterStatus === 'under_review') return c.status === 'under_review';
    if (filterStatus === 'active') return c.status === 'investigating' || c.status === 'dispatched';
    if (filterStatus === 'resolved') return c.status === 'resolved';

    return c.status === filterStatus;
  });

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getStepIndex = (status: CaseStatus): number => {
    switch (status) {
      case 'reported':
      case 'pending':
        return 0;
      case 'under_review':
        return 1;
      case 'investigating':
      case 'dispatched':
        return 2;
      case 'resolved':
        return 3;
      default:
        return 0;
    }
  };

  const getRatingLabel = (score: number) => {
    switch (score) {
      case 5:
        return { text: 'Excellent • Bora Kabisa', color: 'text-amber-600 bg-amber-50 border-amber-200' };
      case 4:
        return { text: 'Very Good • Nzuri Sana', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 3:
        return { text: 'Good • Nzuri', color: 'text-blue-700 bg-blue-50 border-blue-200' };
      case 2:
        return { text: 'Fair • Wastani', color: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 1:
        return { text: 'Poor • Polepole', color: 'text-red-700 bg-red-50 border-red-200' };
      default:
        return { text: 'Select Rating', color: 'text-zinc-600 bg-zinc-50 border-zinc-200' };
    }
  };

  const startRating = (c: DonkeyCase) => {
    setRatingCaseId(c.id);
    setRatingScore(c.userRating?.rating || 5);
    setFeedbackText(c.userRating?.feedback || '');
    setRatingSuccessMsg(null);
  };

  const submitRating = (caseId: string) => {
    if (onRateCase) {
      onRateCase(caseId, ratingScore, feedbackText);
      setRatingSuccessMsg('Tathmini yako imehifadhiwa! (Your rating has been saved)');
      setTimeout(() => {
        setRatingCaseId(null);
        setRatingSuccessMsg(null);
      }, 1800);
    }
  };

  return (
    <div className="space-y-4 pb-20 max-w-4xl mx-auto">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-br from-[#991B1B] via-[#881313] to-[#681010] text-white rounded-3xl p-5 sm:p-6 border border-red-800 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/70 border border-red-700/60 text-[10px] font-extrabold uppercase tracking-wider text-red-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Real-time Case Progress & Feedback
            </div>
            <h1 className="text-xl sm:text-2xl font-black font-display tracking-tight text-white">
              My Submitted Cases (Ripoti Zangu)
            </h1>
            <p className="text-xs sm:text-sm text-red-100 max-w-xl font-medium">
              Track your case step-by-step from reporting to resolution, see officer updates, and rate handling performance.
            </p>
          </div>

          <button
            id="btn-my-cases-new-report"
            onClick={onOpenReportModal}
            className="self-start sm:self-auto bg-white hover:bg-zinc-100 text-[#991B1B] font-extrabold px-5 py-2.5 rounded-2xl text-xs sm:text-sm flex items-center gap-2 shadow-md active:scale-95 transition-all shrink-0 border border-white/20"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Ripoti Mpya</span>
          </button>
        </div>

        {/* User Identity Info */}
        <div className="mt-4 pt-3 border-t border-red-700/60 flex flex-wrap items-center justify-between gap-2 text-xs text-red-200">
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-red-300" />
            <span>Tracking reports filed by: <strong className="text-white">{currentUser.name}</strong> ({currentUser.phone})</span>
          </div>
          <div className="text-[11px] font-bold bg-black/25 px-2.5 py-0.5 rounded-lg border border-white/10">
            {userCases.length} {userCases.length === 1 ? 'Report Logged' : 'Reports Logged'}
          </div>
        </div>
      </div>

      {/* 2. Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none no-scrollbar">
        {[
          { id: 'all', label: 'All Cases', count: userCases.length },
          { id: 'reported', label: '1. Reported', count: userCases.filter(c => c.status === 'reported' || c.status === 'pending').length },
          { id: 'under_review', label: '2. Under Review', count: userCases.filter(c => c.status === 'under_review').length },
          { id: 'active', label: '3. Active / Investigating', count: userCases.filter(c => c.status === 'investigating' || c.status === 'dispatched').length },
          { id: 'resolved', label: '4. Resolved ✓', count: userCases.filter(c => c.status === 'resolved').length },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`filter-tab-${tab.id}`}
            onClick={() => setFilterStatus(tab.id)}
            className={`px-3.5 py-2 rounded-2xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
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

      {/* 3. Cases List */}
      <div className="space-y-4">
        {userCases.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-zinc-200 text-center space-y-4 shadow-2xs">
            <div className="w-16 h-16 rounded-3xl bg-red-50 text-[#991B1B] flex items-center justify-center mx-auto border border-red-200 shadow-2xs">
              <FileText className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 font-display">
                {filterStatus === 'all' 
                  ? 'No donkey cases recorded yet' 
                  : `No cases currently in "${filterStatus.replace('_', ' ')}" status`}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 max-w-md mx-auto">
                Whenever you report stolen donkeys, bush slaughter, or animal welfare cruelty in Kitui, you can monitor the live progress and rate the resolution here.
              </p>
            </div>
            <button
              onClick={onOpenReportModal}
              className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs sm:text-sm font-bold px-6 py-3 rounded-2xl shadow-md inline-flex items-center gap-2 border border-red-800 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Report Donkey Incident Now (Ripoti Sasa)</span>
            </button>
          </div>
        ) : (
          userCases.map((c) => {
            const cat = CATEGORY_INFO[c.category] || CATEGORY_INFO['other'];
            const currentStepIdx = getStepIndex(c.status);
            const isResolved = c.status === 'resolved';
            const hasRating = Boolean(c.userRating);
            const isRatingActive = ratingCaseId === c.id;

            return (
              <div
                key={c.id}
                id={`user-case-card-${c.id}`}
                className="bg-white rounded-3xl border border-zinc-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden"
              >
                {/* Top Card Header */}
                <div className="p-4 sm:p-5 border-b border-zinc-100 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-lg border ${cat.badgeBg} ${cat.badgeBorder} ${cat.badgeText}`}>
                          {cat.label}
                        </span>
                        
                        <button
                          onClick={() => handleCopy(c.trackingCode)}
                          className="font-mono text-[11px] font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 rounded-lg flex items-center gap-1 border border-zinc-200 transition-all"
                          title="Click to copy tracking code"
                        >
                          <span>{c.trackingCode}</span>
                          {copiedCode === c.trackingCode ? (
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                          ) : (
                            <Copy className="w-3 h-3 text-zinc-400" />
                          )}
                        </button>

                        <span className="text-[11px] text-zinc-400 font-medium">
                          {new Date(c.reportedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <h2 className="text-base sm:text-lg font-black text-zinc-950 font-display">
                        {c.title}
                      </h2>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        isResolved
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : c.status === 'investigating' || c.status === 'dispatched'
                          ? 'bg-amber-50 text-amber-900 border-amber-300'
                          : 'bg-red-50 text-red-900 border-red-200'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${isResolved ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                        {isResolved ? 'Resolved ✓' : c.status === 'investigating' ? 'Active Investigation' : c.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                    {c.description}
                  </p>

                  {/* Incident Snapshot Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-zinc-50 p-3 rounded-2xl border border-zinc-200/80">
                    <div className="flex items-center gap-1.5 text-zinc-700 truncate">
                      <MapPin className="w-4 h-4 text-[#991B1B] shrink-0" />
                      <span className="truncate font-medium">{c.location.subCounty}, {c.location.village}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-700">
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-semibold">{c.donkeysCount} Donkey(s) Involved</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-700 col-span-2 sm:col-span-1">
                      <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span className="text-[11px] truncate">Urgency: <strong className="uppercase text-red-700">{c.urgency}</strong></span>
                    </div>
                  </div>
                </div>

                {/* 4. PROGRESS PIPELINE TRACKER */}
                <div className="p-4 sm:p-5 bg-gradient-to-b from-white to-zinc-50 border-b border-zinc-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-[#991B1B]" />
                      Case Lifecycle Progress (Mwenendo wa Kesi)
                    </div>
                    <span className="text-[11px] font-bold text-zinc-500">
                      Stage {currentStepIdx + 1} of 4
                    </span>
                  </div>

                  {/* Horizontal Responsive Progress Bar */}
                  <div className="relative">
                    {/* Connecting Bar Background */}
                    <div className="hidden sm:block absolute top-5 left-8 right-8 h-1 bg-zinc-200 z-0">
                      <div 
                        className="h-full bg-[#991B1B] transition-all duration-500 rounded-full"
                        style={{ width: `${(currentStepIdx / 3) * 100}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-2 relative z-10">
                      {PROGRESS_STEPS.map((step, idx) => {
                        const isCompleted = idx < currentStepIdx || isResolved;
                        const isCurrent = idx === currentStepIdx && !isResolved;
                        const isUpcoming = idx > currentStepIdx && !isResolved;

                        return (
                          <div
                            key={step.id}
                            className={`p-3 rounded-2xl border transition-all flex sm:flex-col items-center sm:items-start justify-between sm:justify-start gap-2 ${
                              isCurrent
                                ? 'bg-red-50/90 border-[#991B1B] ring-2 ring-[#991B1B]/20 shadow-xs'
                                : isCompleted
                                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                : 'bg-zinc-50/60 border-zinc-200 text-zinc-400'
                            }`}
                          >
                            <div className="flex sm:flex-col items-center sm:items-start gap-2.5 w-full">
                              {/* Step Icon / Number */}
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-2xs border ${
                                isCompleted
                                  ? 'bg-emerald-600 border-emerald-700 text-white'
                                  : isCurrent
                                  ? 'bg-[#991B1B] border-red-800 text-white animate-pulse'
                                  : 'bg-zinc-200 border-zinc-300 text-zinc-600'
                              }`}>
                                {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                              </div>

                              <div>
                                <div className="flex items-center gap-1">
                                  <span className={`text-xs font-extrabold ${
                                    isCurrent ? 'text-[#991B1B]' : isCompleted ? 'text-emerald-900' : 'text-zinc-600'
                                  }`}>
                                    {step.label}
                                  </span>
                                  {isCurrent && (
                                    <span className="w-2 h-2 rounded-full bg-[#991B1B] animate-ping" />
                                  )}
                                </div>
                                <div className="text-[10px] font-bold text-zinc-500">
                                  {step.swahiliLabel}
                                </div>
                              </div>
                            </div>

                            <p className="hidden sm:block text-[11px] text-zinc-500 leading-snug mt-1 pt-1 border-t border-zinc-200/50 w-full">
                              {step.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Resolution Notes Banner if resolved */}
                  {c.resolutionNotes && (
                    <div className="mt-3.5 bg-emerald-50 border border-emerald-300 p-3.5 rounded-2xl text-xs text-emerald-950 space-y-1 shadow-2xs">
                      <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Resolution Details (Matokeo ya Kesi):</span>
                      </div>
                      <p className="text-emerald-800 leading-relaxed">
                        {c.resolutionNotes}
                      </p>
                      {c.resolvedAt && (
                        <div className="text-[10px] text-emerald-700 font-medium">
                          Resolved on: {new Date(c.resolvedAt).toLocaleString('en-GB')}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 5. CASE HANDLING RATING SECTION */}
                <div className="p-4 sm:p-5 bg-zinc-50/80 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-300">
                        <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-zinc-950">
                          Rate Case Handling (Tathmini ya Utunzaji wa Kesi)
                        </h4>
                        <p className="text-[11px] text-zinc-500">
                          Provide feedback on responsiveness, officer communication, and recovery support.
                        </p>
                      </div>
                    </div>

                    {!isRatingActive && hasRating && (
                      <button
                        onClick={() => startRating(c)}
                        className="text-xs font-bold text-[#991B1B] hover:text-[#7F1D1D] bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl border border-red-200 transition-all shrink-0"
                      >
                        Edit Review
                      </button>
                    )}
                  </div>

                  {/* Display existing rating if not editing */}
                  {!isRatingActive && hasRating && c.userRating && (
                    <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-4 h-4 ${
                                s <= c.userRating!.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-zinc-200'
                              }`}
                            />
                          ))}
                          <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md border ml-2 ${getRatingLabel(c.userRating.rating).color}`}>
                            {getRatingLabel(c.userRating.rating).text}
                          </span>
                        </div>

                        <span className="text-[10px] text-zinc-400">
                          {new Date(c.userRating.ratedAt).toLocaleDateString('en-GB')}
                        </span>
                      </div>

                      {c.userRating.feedback && (
                        <p className="text-xs text-zinc-700 italic bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                          "{c.userRating.feedback}"
                        </p>
                      )}
                    </div>
                  )}

                  {/* Prompt to rate if unrated or in editing mode */}
                  {(!hasRating || isRatingActive) && (
                    <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs space-y-3">
                      <div>
                        <span className="block text-xs font-bold text-zinc-700 mb-1.5">
                          How satisfied are you with how this case is being handled?
                        </span>

                        {/* Star Selection Row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 bg-zinc-50 p-1.5 rounded-xl border border-zinc-200">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setRatingScore(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                className="p-1 rounded-lg hover:scale-110 active:scale-95 transition-all"
                                title={`Rate ${star} Star${star > 1 ? 's' : ''}`}
                              >
                                <Star
                                  className={`w-6 h-6 transition-colors ${
                                    star <= (hoverRating || ratingScore)
                                      ? 'fill-amber-400 text-amber-400 drop-shadow-xs'
                                      : 'text-zinc-300'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>

                          <span className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${getRatingLabel(hoverRating || ratingScore).color}`}>
                            {getRatingLabel(hoverRating || ratingScore).text}
                          </span>
                        </div>
                      </div>

                      {/* Feedback Comment */}
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-zinc-600">
                          Optional Remarks / Comments (Maoni kwa Maafisa):
                        </label>
                        <textarea
                          rows={2}
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          placeholder="e.g., Chief and veterinary team arrived promptly at the village and helped secure the 2 missing donkeys..."
                          className="w-full text-xs p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/20 outline-hidden transition-all placeholder:text-zinc-400 resize-none"
                        />
                      </div>

                      {/* Success Toast / Notification */}
                      {ratingSuccessMsg && (
                        <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>{ratingSuccessMsg}</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => submitRating(c.id)}
                          className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1.5 border border-red-800"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Hifadhi Tathmini (Submit Rating)</span>
                        </button>

                        {isRatingActive && (
                          <button
                            type="button"
                            onClick={() => setRatingCaseId(null)}
                            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Bar with View Detailed Audit Trail */}
                <div className="p-3 sm:p-4 bg-zinc-100/60 border-t border-zinc-200/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{c.actionLogs?.length || 0} Action Log(s) recorded</span>
                  </div>

                  <button
                    onClick={() => setSelectedCase(c)}
                    className="font-bold text-zinc-900 hover:text-[#991B1B] flex items-center gap-1 transition-colors group"
                  >
                    <span>View Investigation Trail & Full Details</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. Comprehensive Case Detail Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 border border-zinc-200 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3">
              <div>
                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md border ${CATEGORY_INFO[selectedCase.category].badgeBg} ${CATEGORY_INFO[selectedCase.category].badgeBorder} ${CATEGORY_INFO[selectedCase.category].badgeText}`}>
                  {CATEGORY_INFO[selectedCase.category].label}
                </span>
                <h3 className="text-base sm:text-lg font-black font-display text-zinc-950 mt-1">
                  {selectedCase.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-sm transition-all"
              >
                ✕
              </button>
            </div>

            {/* Case Snapshot Grid */}
            <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Tracking Code</span>
                <span className="font-mono font-bold text-[#991B1B] bg-red-50 px-2 py-0.5 rounded border border-red-200">{selectedCase.trackingCode}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Current Status</span>
                <span className="font-bold text-zinc-900 capitalize">{selectedCase.status.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Location</span>
                <span className="font-semibold text-zinc-900">{selectedCase.location.subCounty}, {selectedCase.location.village}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Landmark</span>
                <span className="text-zinc-700 text-right max-w-xs truncate">{selectedCase.location.landmark}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Donkeys Affected</span>
                <span className="font-bold text-zinc-900">{selectedCase.donkeysCount} Animal(s)</span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <span className="text-xs font-bold text-zinc-700">Incident Narrative:</span>
              <p className="text-xs text-zinc-700 bg-zinc-50 p-3 rounded-2xl border border-zinc-200 leading-relaxed">
                {selectedCase.description}
              </p>
            </div>

            {/* Investigation Trail Logs */}
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#991B1B]" />
                Investigation Action Logs ({selectedCase.actionLogs?.length || 0})
              </h4>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {(!selectedCase.actionLogs || selectedCase.actionLogs.length === 0) ? (
                  <p className="text-xs text-zinc-400 italic bg-zinc-50 p-3 rounded-xl">
                    No officer action logs recorded yet. Triage will appear here shortly.
                  </p>
                ) : (
                  selectedCase.actionLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-bold text-zinc-900">
                        <span>{log.action}</span>
                        <span className="text-[10px] text-zinc-400 font-normal">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-600">
                        {log.notes || log.note}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        Officer: {log.officer || log.officerName || 'Welfare Unit'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedCase(null)}
              className="w-full bg-zinc-950 hover:bg-zinc-900 text-white font-bold py-3 rounded-2xl text-xs shadow-xs active:scale-95 transition-all"
            >
              Close Details (Funga)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
