import React, { useState, useEffect } from 'react';
import { DonkeyCase, UserProfile, CaseStatus, ActionLog, CaseResolution, CaseRating } from './types';
import { INITIAL_CASES, DEFAULT_PRIMARY_USER, INITIAL_OFFICERS, INITIAL_PRIMARY_USERS, ALL_PRELOADED_USERS } from './data/mockData';
import { HeaderBar } from './components/HeaderBar';
import { BottomNavBar, NavTab } from './components/BottomNavBar';
import { HomeDashboard } from './components/HomeDashboard';
import { SuperUserDashboard } from './components/SuperUserDashboard';
import { MyCasesView } from './components/MyCasesView';
import { HotspotsMapView } from './components/HotspotsMapView';
import { WelfareGuideView } from './components/WelfareGuideView';
import { ReportCaseModal } from './components/ReportCaseModal';
import { EmergencyHotlineModal } from './components/EmergencyHotlineModal';
import { AuthModal } from './components/AuthModal';
import { AuthScreen } from './components/AuthScreen';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { GoogleDriveVaultModal } from './components/GoogleDriveVaultModal';

const STORAGE_KEY_CASES = 'kaa_rada_cases_v2';
const STORAGE_KEY_USER = 'kaa_rada_current_user_v2';
const SAVED_PROFILES_KEY = 'kaa_rada_saved_profiles_v2';

export default function App() {
  // Load persistent cases from storage - defaults to empty [] so users start with clean slate for new data
  const [cases, setCases] = useState<DonkeyCase[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CASES);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse saved cases:', e);
    }
    // Default to clean empty list for real primary user data
    return [];
  });

  // Current user state (supports null for logged-out / guest state)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse saved user:', e);
    }
    return null;
  });

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  // Modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isHotlineModalOpen, setIsHotlineModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  // Sync cases to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(cases));
    } catch (e) {
      console.error('Failed to save cases to storage:', e);
    }
  }, [cases]);

  // Sync user to localStorage
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEY_USER);
      }
    } catch (e) {
      console.error('Failed to save user to storage:', e);
    }
  }, [currentUser]);

  // Password update handler for Super Users and primary users
  const handleUpdatePassword = (newPassword: string): boolean => {
    if (!currentUser) return false;
    try {
      const updatedUser: UserProfile = {
        ...currentUser,
        password: newPassword,
      };
      setCurrentUser(updatedUser);

      // Also update saved profiles in localStorage
      const saved = localStorage.getItem(SAVED_PROFILES_KEY);
      let profiles: UserProfile[] = saved ? JSON.parse(saved) : ALL_PRELOADED_USERS;
      const index = profiles.findIndex((p) => p.id === currentUser.id || (p.phone && p.phone === currentUser.phone));
      if (index !== -1) {
        profiles[index] = { ...profiles[index], password: newPassword };
      } else {
        profiles.push(updatedUser);
      }
      localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(profiles));
      return true;
    } catch (e) {
      console.error('Error updating password:', e);
      return false;
    }
  };

  // Handle new Case submission from primary user or officer
  const handleAddNewCase = (
    newCaseData: Omit<DonkeyCase, 'id' | 'trackingCode' | 'reportedAt' | 'status' | 'actionLogs'>
  ) => {
    const timestamp = new Date().toISOString();
    const generatedId = `KR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const generatedCode = `KR-${Math.floor(1000 + Math.random() * 9000)}`;

    const initialLog: ActionLog = {
      id: `log-${Date.now()}`,
      timestamp,
      officer: 'Caritas Kitui Intake Desk',
      action: 'Incident Logged & Dispatched',
      notes: `Report received from ${newCaseData.location.village}, ${newCaseData.location.subCounty}. Incident dispatched to sub-county welfare desk.`,
    };

    const fullCase: DonkeyCase = {
      ...newCaseData,
      id: generatedId,
      trackingCode: generatedCode,
      reportedAt: timestamp,
      status: 'reported',
      actionLogs: [initialLog],
    };

    setCases((prev) => [fullCase, ...prev]);
  };

  // Super User Action: Update case status
  const handleUpdateCaseStatus = (
    caseId: string,
    newStatus: CaseStatus,
    resolutionNotes?: string
  ) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;

        const newLog: ActionLog = {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          officer: currentUser?.name || 'Caritas Officer',
          action: newStatus === 'resolved' ? 'Case Resolved & Safeguarded ✓' : `Status updated to ${newStatus}`,
          notes: resolutionNotes || `Investigation status set to ${newStatus} by ${currentUser?.name || 'Officer'}.`,
        };

        return {
          ...c,
          status: newStatus,
          resolutionNotes: resolutionNotes || c.resolutionNotes,
          resolvedAt: newStatus === 'resolved' ? new Date().toISOString() : c.resolvedAt,
          actionLogs: [newLog, ...(c.actionLogs || [])],
        };
      })
    );
  };

  // Super User Action: Add arbitrary action log entry
  const handleAddActionLog = (
    caseId: string,
    logData: Omit<ActionLog, 'id' | 'timestamp'>
  ) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;

        const newLog: ActionLog = {
          ...logData,
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
        };

        return {
          ...c,
          actionLogs: [newLog, ...(c.actionLogs || [])],
        };
      })
    );
  };

  // Super User Action: Escalate case to another officer/user
  const handleEscalateCase = (
    caseId: string,
    officerName: string,
    officerRole: string,
    instructions: string
  ) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;

        const escalationLog: ActionLog = {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          officer: currentUser?.name || 'Supervisor Desk',
          action: `Escalated to ${officerName}`,
          notes: `Re-assigned to ${officerName} [${officerRole}]. Instructions: ${instructions}`,
          newStatus: 'dispatched',
        };

        return {
          ...c,
          status: 'dispatched' as CaseStatus,
          assignedOfficer: {
            id: `off-${Date.now()}`,
            name: officerName,
            title: officerRole,
            department: 'Assigned Response Unit',
            phone: '0722 000 000',
          },
          actionLogs: [escalationLog, ...(c.actionLogs || [])],
        };
      })
    );
  };

  // Super User Action: Resolve case directly
  const handleResolveCase = (
    caseId: string,
    resolution: CaseResolution
  ) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;

        const resolutionLog: ActionLog = {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          officer: resolution.officerName,
          action: 'Case Investigated & Resolved ✓',
          notes: `${resolution.summary} (Donkeys recovered: ${resolution.donkeysRecovered}${resolution.suspectsApprehended ? `, Suspects apprehended: ${resolution.suspectsApprehended}` : ''})`,
          newStatus: 'resolved',
        };

        return {
          ...c,
          status: 'resolved' as CaseStatus,
          resolution,
          resolutionNotes: resolution.summary,
          resolvedAt: resolution.resolvedAt,
          actionLogs: [resolutionLog, ...(c.actionLogs || [])],
        };
      })
    );
  };

  // Primary User Action: Rate case handling
  const handleRateCase = (caseId: string, rating: number, feedback?: string) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;

        const caseRating: CaseRating = {
          rating,
          feedback: feedback?.trim() || undefined,
          ratedAt: new Date().toISOString(),
          ratedByName: currentUser?.name || 'Reporter',
          ratedByPhone: currentUser?.phone,
        };

        const ratingLog: ActionLog = {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          officer: currentUser?.name || 'Primary Reporter',
          action: `Rated Case Handling: ${rating}/5 Stars (${rating === 5 ? 'Excellent' : rating === 4 ? 'Very Good' : rating === 3 ? 'Good' : rating === 2 ? 'Fair' : 'Poor'})`,
          notes: feedback ? `Reporter Review: "${feedback}"` : `Reporter submitted a ${rating}-star performance rating.`,
        };

        return {
          ...c,
          userRating: caseRating,
          actionLogs: [ratingLog, ...(c.actionLogs || [])],
        };
      })
    );
  };

  // User switcher & Login
  const handleSelectUser = (newUser: UserProfile | null) => {
    setCurrentUser(newUser);
    if (newUser?.role === 'super_user') {
      setActiveTab('super_portal');
    }
  };

  // Log out user
  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY_USER);
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to load sample data if user wants to demo test
  const handleLoadSampleDemoData = () => {
    setCases(INITIAL_CASES);
  };

  // Helper to clear all data
  const handleClearAllData = () => {
    setCases([]);
    try {
      localStorage.removeItem(STORAGE_KEY_CASES);
    } catch (e) {
      console.error(e);
    }
  };

  const pendingCount = cases.filter(
    (c) => c.status === 'reported' || c.status === 'under_review' || c.status === 'investigating'
  ).length;

  // Compute count of cases reported by currently logged in user
  const userReportedCasesCount = currentUser ? cases.filter((c) => {
    const cleanUserPhone = (currentUser.phone || '').replace(/\D/g, '');
    const cleanCasePhone = (c.reporter?.phone || c.reporterUserPhone || '').replace(/\D/g, '');
    const phoneMatch = cleanUserPhone && cleanCasePhone && (cleanUserPhone.endsWith(cleanCasePhone.slice(-9)) || cleanCasePhone.endsWith(cleanUserPhone.slice(-9)));
    const nameMatch = currentUser.name && c.reporter?.name && currentUser.name.trim().toLowerCase() === c.reporter.name.trim().toLowerCase();
    const idMatch = (c.reporterUserId && (c.reporterUserId === currentUser.id || c.reporter?.id === currentUser.id));
    return Boolean(phoneMatch || nameMatch || idMatch);
  }).length : 0;

  // When user is not logged in, show ONLY Log In and Sign Up options
  if (!currentUser) {
    return <AuthScreen onLogin={handleSelectUser} />;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-zinc-100 flex flex-col justify-between text-zinc-900 selection:bg-red-800 selection:text-white">
      {/* App Header Bar (Native Android Sticky Top Bar) */}
      <HeaderBar
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenHotlineModal={() => setIsHotlineModalOpen(true)}
        onOpenDriveModal={() => setIsDriveModalOpen(true)}
        onLogout={currentUser ? handleLogout : undefined}
        pendingCasesCount={pendingCount}
      />

      {/* Main Viewport Content based on active navigation tab */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-3.5 sm:p-5 overflow-y-auto">
        {activeTab === 'home' && (
          <HomeDashboard
            cases={cases}
            currentUser={currentUser}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenHotlineModal={() => setIsHotlineModalOpen(true)}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'my_cases' && (
          <MyCasesView
            cases={cases}
            currentUser={currentUser}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onRateCase={handleRateCase}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onOpenDriveModal={() => setIsDriveModalOpen(true)}
          />
        )}

        {activeTab === 'hotspots' && (
          <HotspotsMapView
            cases={cases}
            currentUser={currentUser}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenHotlineModal={() => setIsHotlineModalOpen(true)}
          />
        )}

        {activeTab === 'super_portal' && (
          <SuperUserDashboard
            cases={cases}
            currentUser={currentUser}
            onUpdateCaseStatus={handleUpdateCaseStatus}
            onAddActionLog={handleAddActionLog}
            onEscalateCase={handleEscalateCase}
            onResolveCase={handleResolveCase}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onOpenChangePasswordModal={() => setIsChangePasswordModalOpen(true)}
            onOpenDriveModal={() => setIsDriveModalOpen(true)}
          />
        )}

        {activeTab === 'helpline' && (
          <div className="space-y-4">
            <WelfareGuideView />
            
            {/* Developer & Data Management Options */}
            <div className="bg-white rounded-3xl p-4 border border-zinc-200 shadow-2xs space-y-2 text-xs text-zinc-600">
              <span className="font-bold text-zinc-900 uppercase tracking-wider text-[10px] block">
                Data & Storage Preferences
              </span>
              <p className="text-[11px]">
                Primary user reports are saved locally on this device. You can clear cases or reload demo scenarios anytime:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={handleClearAllData}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-red-50 text-zinc-700 hover:text-red-700 rounded-xl text-xs font-bold transition-all border border-zinc-200"
                >
                  Clear All Cases ({cases.length})
                </button>
                <button
                  onClick={handleLoadSampleDemoData}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-all border border-zinc-200"
                >
                  Load Kitui Sample Scenarios
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Android Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        userRole={currentUser?.role || 'primary_user'}
        pendingCount={pendingCount}
        myCasesCount={userReportedCasesCount}
      />

      {/* Modals */}
      <ReportCaseModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSubmitCase={handleAddNewCase}
        currentUser={currentUser}
        userPhone={currentUser?.phone || ''}
        userName={currentUser?.name || ''}
      />

      <EmergencyHotlineModal
        isOpen={isHotlineModalOpen}
        onClose={() => setIsHotlineModalOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onSelectUser={handleSelectUser}
        onLogout={handleLogout}
        onOpenChangePasswordModal={() => setIsChangePasswordModalOpen(true)}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        currentUser={currentUser}
        onUpdatePassword={handleUpdatePassword}
      />

      <GoogleDriveVaultModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        cases={cases}
        currentUser={currentUser}
      />
    </div>
  );
}
