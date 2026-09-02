import React, { useState } from 'react';
import { 
  Shield, CheckCircle2, AlertTriangle, Clock, Filter, 
  MapPin, Phone, UserCheck, MessageSquare, Plus, ChevronRight, 
  Check, ArrowUpRight, Search, FileText, CheckCheck, RefreshCw, 
  PhoneCall, ExternalLink, Calendar, HelpCircle, LogIn, Lock,
  Send, UserPlus, ShieldAlert, ArrowRight, CheckSquare, X, KeyRound, Star
} from 'lucide-react';
import { DonkeyCase, CaseStatus, UserProfile, ActionLog, CaseResolution } from '../types';
import { CATEGORY_INFO, KITUI_SUB_COUNTIES, INITIAL_OFFICERS, INITIAL_PRIMARY_USERS, ALL_PRELOADED_USERS } from '../data/mockData';

interface SuperUserDashboardProps {
  cases: DonkeyCase[];
  currentUser: UserProfile | null;
  onUpdateCaseStatus: (caseId: string, status: CaseStatus, resolutionNotes?: string) => void;
  onAddActionLog: (caseId: string, log: Omit<ActionLog, 'id' | 'timestamp'>) => void;
  onEscalateCase?: (caseId: string, officerName: string, officerRole: string, instructions: string) => void;
  onResolveCase?: (caseId: string, resolution: CaseResolution) => void;
  onOpenReportModal: () => void;
  onOpenAuthModal: () => void;
  onOpenChangePasswordModal?: () => void;
}

export const SuperUserDashboard: React.FC<SuperUserDashboardProps> = ({
  cases,
  currentUser,
  onUpdateCaseStatus,
  onAddActionLog,
  onEscalateCase,
  onResolveCase,
  onOpenReportModal,
  onOpenAuthModal,
  onOpenChangePasswordModal,
}) => {
  const isSuperUser = currentUser?.role === 'super_user';

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(cases[0]?.id || null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubCounty, setFilterSubCounty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Direct Resolution Modal State (Act Directly & Label Resolved)
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [donkeysRecoveredCount, setDonkeysRecoveredCount] = useState<number>(1);
  const [suspectsApprehendedCount, setSuspectsApprehendedCount] = useState<number>(0);
  const [outcomeCategory, setOutcomeCategory] = useState<CaseResolution['outcomeCategory']>('donkeys_reunited');

  // Escalation Modal State (Escalate to Another User / Officer)
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [selectedEscalateOfficerId, setSelectedEscalateOfficerId] = useState<string>(INITIAL_OFFICERS[0]?.id || 'custom');
  const [customOfficerName, setCustomOfficerName] = useState('');
  const [customOfficerRole, setCustomOfficerRole] = useState('');
  const [escalationInstructions, setEscalationInstructions] = useState('');

  // Quick Action Log modal state
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [newLogNote, setNewLogNote] = useState('');
  const [newLogOfficer, setNewLogOfficer] = useState(currentUser?.name || 'Caritas Response Desk');

  // Filter reported cases
  const filteredCases = cases.filter((c) => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (filterCategory !== 'all' && c.category !== filterCategory) return false;
    if (filterSubCounty !== 'all' && c.location.subCounty !== filterSubCounty) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = c.title.toLowerCase().includes(q);
      const matchLoc = `${c.location.subCounty} ${c.location.ward} ${c.location.village} ${c.location.landmark}`.toLowerCase().includes(q);
      const matchCode = c.trackingCode.toLowerCase().includes(q);
      if (!matchTitle && !matchLoc && !matchCode) return false;
    }
    return true;
  });

  const selectedCase = cases.find((c) => c.id === selectedCaseId) || filteredCases[0] || null;

  // Open Direct Resolution
  const handleOpenDirectResolve = (c: DonkeyCase) => {
    setSelectedCaseId(c.id);
    setDonkeysRecoveredCount(c.donkeysCount || 1);
    setResolutionSummary(`Case investigated and resolved by ${currentUser?.name || 'Caritas Officer'}. Donkeys safely secured.`);
    setIsResolveModalOpen(true);
  };

  // Submit Direct Resolution
  const handleConfirmDirectResolve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;

    const resolution: CaseResolution = {
      resolvedAt: new Date().toISOString(),
      officerName: currentUser?.name || 'Authorized Officer',
      officerRole: currentUser?.roleTitle || 'Super User / Welfare Desk',
      summary: resolutionSummary.trim() || 'Case successfully resolved and donkeys safeguarded.',
      donkeysRecovered: Number(donkeysRecoveredCount) || 0,
      suspectsApprehended: Number(suspectsApprehendedCount) || 0,
      outcomeCategory: outcomeCategory || 'recovered_safely',
    };

    if (onResolveCase) {
      onResolveCase(selectedCase.id, resolution);
    } else {
      onUpdateCaseStatus(
        selectedCase.id, 
        'resolved', 
        `RESOLVED by ${currentUser?.name || 'Officer'}: ${resolution.summary} (Recovered ${resolution.donkeysRecovered} donkey(s))`
      );
    }

    setIsResolveModalOpen(false);
  };

  // Open Escalation
  const handleOpenEscalate = (c: DonkeyCase) => {
    setSelectedCaseId(c.id);
    setEscalationInstructions(`URGENT: Please dispatch team to ${c.location.village}, ${c.location.subCounty} to intercept and investigate.`);
    setIsEscalateModalOpen(true);
  };

  // Submit Escalation to another Officer/User
  const handleConfirmEscalate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;

    let targetName = customOfficerName.trim() || 'Assigned Officer';
    let targetRole = customOfficerRole.trim() || 'Field Officer';

    if (selectedEscalateOfficerId !== 'custom') {
      const off = ALL_PRELOADED_USERS.find((o) => o.id === selectedEscalateOfficerId);
      if (off) {
        targetName = off.name;
        targetRole = `${off.roleTitle || off.designation || 'Officer'} (${off.village ? off.village + ' / ' : ''}${off.subCounty || 'Mwingi West'}) - Tel: ${off.phone}`;
      }
    }

    if (onEscalateCase) {
      onEscalateCase(selectedCase.id, targetName, targetRole, escalationInstructions.trim());
    } else {
      // Add action log and update status
      onAddActionLog(selectedCase.id, {
        action: `Escalated to ${targetName}`,
        officer: currentUser?.name || 'Caritas Supervisor',
        notes: `Case re-assigned to ${targetName} [${targetRole}]. Orders: ${escalationInstructions.trim()}`,
        newStatus: 'dispatched',
      });
      onUpdateCaseStatus(selectedCase.id, 'dispatched', `Escalated to ${targetName} for urgent response.`);
    }

    setIsEscalateModalOpen(false);
  };

  const handleAddLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !newLogNote.trim()) return;

    onAddActionLog(selectedCase.id, {
      action: 'Investigation Log',
      officer: newLogOfficer.trim() || currentUser?.name || 'Caritas Desk',
      notes: newLogNote.trim(),
    });

    setNewLogNote('');
    setIsAddingLog(false);
  };

  // Metrics for reported cases
  const totalReportedCount = cases.length;
  const pendingCount = cases.filter((c) => c.status === 'reported' || c.status === 'pending' || c.status === 'under_review').length;
  const inProgressCount = cases.filter((c) => c.status === 'investigating' || c.status === 'dispatched').length;
  const resolvedCount = cases.filter((c) => c.status === 'resolved').length;

  // If user is not super user, display restriction view with sign in trigger
  if (!isSuperUser) {
    return (
      <div className="space-y-4 pb-16">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200 shadow-2xs text-center space-y-4 max-w-lg mx-auto mt-4">
          <div className="w-14 h-14 rounded-3xl bg-red-50 border border-red-200 text-[#991B1B] flex items-center justify-center mx-auto shadow-2xs">
            <Lock className="w-7 h-7" />
          </div>
          
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#991B1B] bg-red-50 border border-red-200 px-3 py-1 rounded-full">
              Super User Restricted Area
            </span>
            <h2 className="text-lg sm:text-xl font-black font-display text-zinc-950 mt-2">
              Super User Command & Resolution Desk
            </h2>
            <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
              This section is reserved for verified officers and Caritas Kitui administrators to review reported cases, act directly to mark cases as resolved, or escalate to law enforcement and veterinary units.
            </p>
          </div>

          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-left space-y-2">
            <div className="text-xs font-bold text-zinc-900">
              Primary User Capabilities:
            </div>
            <ul className="text-xs text-zinc-600 space-y-1 list-disc list-inside">
              <li>Report lost/stolen donkeys or cruelty incidents (auto-GPS tagged)</li>
              <li>View live map radar with unique category color dots</li>
              <li>Track progress status & officer resolution notes</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={onOpenAuthModal}
              className="flex-1 bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold py-3 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all border border-red-800"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In as Super User</span>
            </button>
            <button
              onClick={onOpenReportModal}
              className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold py-3 px-4 rounded-xl text-xs sm:text-sm active:scale-95 transition-all"
            >
              Report a Case Instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Officer Header / Super User Identity */}
      <div className="bg-zinc-950 text-white rounded-3xl p-4 sm:p-5 border border-zinc-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-red-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-800">
                  Super User Active
                </span>
                <span className="text-xs text-zinc-400 font-medium">
                  {currentUser?.department || 'Caritas Kitui Donkey Welfare'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black font-display text-white">
                Officer Triage & Resolution Desk
              </h2>
              <p className="text-xs text-zinc-400">
                Logged in as <span className="text-white font-bold">{currentUser.name}</span>
                {currentUser.roleTitle && ` • ${currentUser.roleTitle}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {onOpenChangePasswordModal && (
              <button
                id="btn-change-officer-password"
                onClick={onOpenChangePasswordModal}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white font-bold text-xs px-3 py-2 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1.5 border border-zinc-700"
                title="Update your account password or PIN"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Change PIN</span>
              </button>
            )}
            <button
              onClick={onOpenReportModal}
              className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1.5 border border-red-800"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Log Officer Report</span>
            </button>
          </div>
        </div>

        {/* Triage Metrics */}
        <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-zinc-800">
          <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800">
            <span className="text-[9px] font-bold text-zinc-400 uppercase">Total Reports</span>
            <div className="text-base sm:text-lg font-black text-white">{totalReportedCount}</div>
          </div>
          <div className="bg-red-950/40 p-2.5 rounded-xl border border-red-900/60">
            <span className="text-[9px] font-bold text-red-300 uppercase">Pending</span>
            <div className="text-base sm:text-lg font-black text-red-400">{pendingCount}</div>
          </div>
          <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/40">
            <span className="text-[9px] font-bold text-amber-300 uppercase">Investigating</span>
            <div className="text-base sm:text-lg font-black text-amber-400">{inProgressCount}</div>
          </div>
          <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800">
            <span className="text-[9px] font-bold text-emerald-400 uppercase">Resolved</span>
            <div className="text-base sm:text-lg font-black text-emerald-400">{resolvedCount}</div>
          </div>
        </div>
      </div>

      {/* Main Content Area: Case List & Resolution View */}
      {cases.length === 0 ? (
        <div className="bg-white rounded-3xl border border-zinc-200 p-8 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#991B1B] flex items-center justify-center mx-auto border border-red-200">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-zinc-900">
            No Reported Cases in System
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            When primary users or officers submit a donkey incident report, it will appear here for investigation, escalation, or direct resolution.
          </p>
          <button
            onClick={onOpenReportModal}
            className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs border border-red-800"
          >
            <Plus className="w-4 h-4" />
            <span>Create Test Case</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: List of Reported Cases */}
          <div className="lg:col-span-5 space-y-2">
            {/* Search & Filters */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-3 shadow-2xs space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by code, title, village..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-2 py-1 text-[11px] bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 font-medium"
                >
                  <option value="all">All Statuses</option>
                  <option value="reported">Reported / Pending</option>
                  <option value="investigating">Investigating</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="resolved">Resolved</option>
                </select>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-2 py-1 text-[11px] bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 font-medium"
                >
                  <option value="all">All Incident Types</option>
                  <option value="donkey_theft">Donkey Theft</option>
                  <option value="bush_slaughter">Bush Slaughter</option>
                  <option value="trafficking">Trafficking</option>
                  <option value="general_abuse">Abuse / Sores</option>
                </select>
              </div>
            </div>

            {/* Cases List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredCases.map((c) => {
                const cat = CATEGORY_INFO[c.category] || CATEGORY_INFO['other'];
                const isSelected = selectedCase?.id === c.id;
                const isResolved = c.status === 'resolved';

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-red-50/70 border-[#991B1B] shadow-xs'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0" 
                          style={{ backgroundColor: cat.dotColor || cat.color }} 
                        />
                        <span className="font-mono text-[10px] font-bold text-zinc-500">
                          {c.trackingCode}
                        </span>
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${cat.badgeBg} ${cat.badgeBorder} ${cat.badgeText}`}>
                          {cat.label}
                        </span>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isResolved 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                          : c.status === 'investigating' || c.status === 'dispatched'
                          ? 'bg-amber-50 text-amber-900 border border-amber-200'
                          : 'bg-red-50 text-red-900 border border-red-200'
                      }`}>
                        {isResolved ? 'Resolved ✓' : c.status.replace('_', ' ')}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-zinc-950 line-clamp-1">
                      {c.title}
                    </h4>

                    <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1 pt-1 border-t border-zinc-100">
                      <span className="flex items-center gap-1 truncate max-w-[190px]">
                        <MapPin className="w-3 h-3 text-[#991B1B] shrink-0" />
                        {c.location.subCounty}, {c.location.village}
                      </span>
                      <span className="font-bold text-zinc-900">
                        {c.donkeysCount} Donkey(s)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Case Details & Action / Escalation Center */}
          <div className="lg:col-span-7">
            {selectedCase ? (
              <div className="bg-white rounded-3xl border border-zinc-200 p-4 sm:p-5 shadow-2xs space-y-4">
                {/* Header & Status */}
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-zinc-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-extrabold text-[#991B1B]">
                        {selectedCase.trackingCode}
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-400">
                        ID: {selectedCase.id}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        selectedCase.status === 'resolved' 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                          : 'bg-red-50 text-red-900 border border-red-200'
                      }`}>
                        {selectedCase.status === 'resolved' ? 'Resolved ✓' : selectedCase.status.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-zinc-950">
                      {selectedCase.title}
                    </h3>
                  </div>

                  {/* Super User 2 Primary Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedCase.status !== 'resolved' && (
                      <>
                        {/* Option 1: Escalate to another user / officer */}
                        <button
                          id="escalate-case-btn"
                          onClick={() => handleOpenEscalate(selectedCase)}
                          className="bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95"
                        >
                          <Send className="w-3.5 h-3.5 text-zinc-700" />
                          <span>Escalate to Officer</span>
                        </button>

                        {/* Option 2: Act Themselves & Label as Resolved */}
                        <button
                          id="resolve-case-btn"
                          onClick={() => handleOpenDirectResolve(selectedCase)}
                          className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 border border-red-800"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Act & Resolve</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Case Description & Details */}
                <div className="space-y-3">
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 text-xs text-zinc-700 leading-relaxed">
                    <div className="text-[10px] font-bold uppercase text-zinc-400 mb-1">
                      Incident Summary
                    </div>
                    {selectedCase.description || 'No description provided.'}
                  </div>

                  {/* Location & GPS Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3">
                      <div className="text-[10px] font-bold uppercase text-[#991B1B] mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Location Details
                      </div>
                      <div className="font-bold text-zinc-900">
                        {selectedCase.location.village}, {selectedCase.location.ward}
                      </div>
                      <div className="text-zinc-500 text-[11px]">
                        Sub-County: {selectedCase.location.subCounty}
                      </div>
                      {selectedCase.location.coordinates && (
                        <div className="text-[10px] font-mono text-zinc-600 mt-1 bg-white p-1 rounded border border-zinc-200">
                          GPS: {selectedCase.location.coordinates.lat.toFixed(5)}, {selectedCase.location.coordinates.lng.toFixed(5)}
                        </div>
                      )}
                    </div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3">
                      <div className="text-[10px] font-bold uppercase text-zinc-500 mb-1">
                        Reporter & Animals
                      </div>
                      <div className="font-bold text-zinc-900">
                        Donkeys Affected: <span className="text-[#991B1B]">{selectedCase.donkeysCount}</span>
                      </div>
                      <div className="text-zinc-600 text-[11px] mt-0.5">
                        {selectedCase.reporter.isAnonymous ? (
                          <span className="italic text-zinc-500">Anonymous Reporter</span>
                        ) : (
                          <>Reporter: {selectedCase.reporter.name} ({selectedCase.reporter.phone || 'No phone'})</>
                        )}
                      </div>
                      <div className="text-zinc-500 text-[10px] mt-0.5">
                        Reported: {new Date(selectedCase.reportedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Assigned Officer / Escalation info if present */}
                  {selectedCase.assignedOfficer && (
                    <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                          Assigned Officer / Unit
                        </div>
                        <div className="font-bold text-zinc-900">
                          {selectedCase.assignedOfficer.name} ({selectedCase.assignedOfficer.title})
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          {selectedCase.assignedOfficer.department} • {selectedCase.assignedOfficer.phone}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Resolution Details if resolved */}
                  {selectedCase.status === 'resolved' && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-950 space-y-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Case Resolution Record
                      </div>
                      <div className="font-semibold">
                        {selectedCase.resolutionNotes || selectedCase.resolution?.summary || 'Resolved successfully by Caritas Kitui desk.'}
                      </div>
                      {selectedCase.resolution?.donkeysRecovered !== undefined && (
                        <div className="text-[11px] text-emerald-800">
                          Donkeys recovered / safe: <strong>{selectedCase.resolution.donkeysRecovered}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reporter Performance Rating & Feedback */}
                  {selectedCase.userRating && (
                    <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-3.5 text-xs text-amber-950 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
                          <span>Reporter Evaluation (Tathmini ya Mwanakijiji)</span>
                        </div>
                        <span className="text-[10px] text-amber-700">
                          {new Date(selectedCase.userRating.ratedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= selectedCase.userRating!.rating
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-zinc-300'
                            }`}
                          />
                        ))}
                        <span className="ml-1.5 font-extrabold text-amber-900 text-xs">
                          {selectedCase.userRating.rating}/5 Stars
                        </span>
                      </div>
                      {selectedCase.userRating.feedback && (
                        <p className="text-zinc-800 italic bg-white/80 p-2 rounded-xl border border-amber-200">
                          "{selectedCase.userRating.feedback}"
                        </p>
                      )}
                    </div>
                  )}

                  {/* Case Action Timeline */}
                  <div className="border-t border-zinc-100 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                        Action & Investigation Logs
                      </span>
                      <button
                        onClick={() => setIsAddingLog(true)}
                        className="text-[11px] font-bold text-[#991B1B] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Officer Note</span>
                      </button>
                    </div>

                    {isAddingLog && (
                      <form onSubmit={handleAddLogSubmit} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 space-y-2">
                        <input
                          type="text"
                          value={newLogOfficer}
                          onChange={(e) => setNewLogOfficer(e.target.value)}
                          placeholder="Officer Name..."
                          className="w-full px-2.5 py-1 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-900"
                        />
                        <textarea
                          rows={2}
                          value={newLogNote}
                          onChange={(e) => setNewLogNote(e.target.value)}
                          placeholder="Log scene observation, suspect tracking, vet treatment..."
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-900"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setIsAddingLog(false)}
                            className="px-2.5 py-1 text-xs text-zinc-600"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="bg-[#991B1B] text-white px-3 py-1 rounded-lg text-xs font-bold"
                          >
                            Save Log
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="space-y-2">
                      {selectedCase.actionLogs?.map((log) => (
                        <div key={log.id} className="bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs space-y-0.5">
                          <div className="flex items-center justify-between text-[10px] text-zinc-500">
                            <span className="font-bold text-zinc-800">{log.officer || log.officerName || 'Officer Desk'}</span>
                            <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="font-semibold text-zinc-900">{log.action}</div>
                          <div className="text-zinc-600 text-[11px]">{log.notes || log.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-zinc-200 p-8 text-center text-xs text-zinc-500">
                Select a reported case from the left to view details, escalate, or resolve.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Act Themselves & Label as Resolved */}
      {isResolveModalOpen && selectedCase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 border border-zinc-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <CheckCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-950">
                    Act Directly & Mark Case Resolved
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Case #{selectedCase.trackingCode} • {selectedCase.title}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsResolveModalOpen(false)} className="text-zinc-400 hover:text-zinc-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDirectResolve} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                  Resolution Summary * (Hatua Zilizochukuliwa)
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  placeholder="Detail the outcome: donkeys recovered, medical aid administered, perpetrator remanded..."
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-600 text-zinc-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Donkeys Secured / Safe
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={donkeysRecoveredCount}
                    onChange={(e) => setDonkeysRecoveredCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Suspects Apprehended
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={suspectsApprehendedCount}
                    onChange={(e) => setSuspectsApprehendedCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsResolveModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs active:scale-95 transition-all"
                >
                  Confirm & Mark Resolved ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Escalate to Another User / Officer */}
      {isEscalateModalOpen && selectedCase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 border border-zinc-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-100 text-[#991B1B] flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-950">
                    Escalate Case to Officer / Unit
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Case #{selectedCase.trackingCode} • {selectedCase.location.subCounty}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsEscalateModalOpen(false)} className="text-zinc-400 hover:text-zinc-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmEscalate} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                  Select Recipient Officer / Unit *
                </label>
                <select
                  value={selectedEscalateOfficerId}
                  onChange={(e) => setSelectedEscalateOfficerId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 font-medium"
                >
                  <optgroup label="⭐ Super Users (Command & Welfare Leads)">
                    {INITIAL_OFFICERS.map((off) => (
                      <option key={off.id} value={off.id}>
                        {off.name} — {off.roleTitle} ({off.phone})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="📍 Local Chiefs & Village Elders (25 Primary Users)">
                    {INITIAL_PRIMARY_USERS.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} — {user.designation} ({user.village}, {user.phone})
                      </option>
                    ))}
                  </optgroup>
                  <option value="custom">Other Officer / Local Administration</option>
                </select>
              </div>

              {selectedEscalateOfficerId === 'custom' && (
                <div className="space-y-2 p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
                  <input
                    type="text"
                    required
                    value={customOfficerName}
                    onChange={(e) => setCustomOfficerName(e.target.value)}
                    placeholder="Officer Name (e.g. Chief Mutisya)"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-900"
                  />
                  <input
                    type="text"
                    value={customOfficerRole}
                    onChange={(e) => setCustomOfficerRole(e.target.value)}
                    placeholder="Department / Title (e.g. Kitui South Admin)"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                  Escalation Instructions & Orders *
                </label>
                <textarea
                  required
                  rows={3}
                  value={escalationInstructions}
                  onChange={(e) => setEscalationInstructions(e.target.value)}
                  placeholder="Dispatch instructions, checkpoint setup, evidence gathering orders..."
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsEscalateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs active:scale-95 transition-all border border-red-800"
                >
                  Dispatch & Escalate →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
