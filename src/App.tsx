import React, { useState, useEffect, useRef } from 'react';
import { DonkeyCase, UserProfile, CaseStatus, ActionLog, CaseResolution, CaseRating, InAppNotification, Coordinates, BackgroundLocationSettings, DiraMessage, ActiveCallSession } from './types';
import { INITIAL_CASES, DEFAULT_PRIMARY_USER, INITIAL_OFFICERS, INITIAL_PRIMARY_USERS, ALL_PRELOADED_USERS } from './data/mockData';
import { HeaderBar } from './components/HeaderBar';
import { BottomNavBar, NavTab } from './components/BottomNavBar';
import { HomeDashboard } from './components/HomeDashboard';
import { SuperUserDashboard } from './components/SuperUserDashboard';
import { MyCasesView } from './components/MyCasesView';
import { HotspotsMapView } from './components/HotspotsMapView';
import { WelfareGuideView } from './components/WelfareGuideView';
import { CommunityChatView } from './components/CommunityChatView';
import { IncidentRingingBanner } from './components/IncidentRingingBanner';
import { InAppChatBroadcastAlert } from './components/InAppChatBroadcastAlert';
import { IncomingCallBanner } from './components/IncomingCallBanner';
import { CallModal } from './components/CallModal';
import { callService, getGuestSenderId } from './services/callService';
import { ReportCaseModal } from './components/ReportCaseModal';
import { EmergencyHotlineModal } from './components/EmergencyHotlineModal';
import { AuthModal } from './components/AuthModal';
import { AuthScreen } from './components/AuthScreen';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { GoogleDriveVaultModal } from './components/GoogleDriveVaultModal';
import { InAppNotificationAlert } from './components/InAppNotificationAlert';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { CaseDetailsPreviewModal } from './components/CaseDetailsPreviewModal';
import { EmergencyReportModal } from './components/EmergencyReportModal';
import { ApkExportModal } from './components/ApkExportModal';
import { DatabaseModal } from './components/DatabaseModal';
import { allocateCaseWithAI, autoAllocateCasesBatch } from './services/aiAllocationService';
import { sortCasesLatestFirst } from './utils/dateUtils';
import { 
  initAppDatabase, 
  saveCaseToDb, 
  saveAllCasesToDb, 
  subscribeToFirestoreCases,
  getAllUsersFromDb,
  saveUserToDb,
  deleteUserFromDb,
  subscribeToFirestoreUsers,
  deleteAllSignedUpUsersAndSampleData,
  SUPER_ADMIN_ACCOUNT,
  subscribeToGlobalChatBroadcast
} from './services/db';
import { 
  getSavedNotifications, 
  saveNotifications, 
  createNotificationFromCase, 
  broadcastCaseReported, 
  subscribeToCaseBroadcasts, 
  playNotificationChime, 
  triggerHapticAlert,
  playIncidentPhoneRing,
  showSystemIncidentNotification,
  playChatBroadcastChime,
  showSystemChatNotification,
  requestNotificationPermission
} from './services/notificationService';
import { 
  backgroundLocationTracker, 
  formatDistance,
  NAIROBI_COORDINATES,
  getStoredLastKnownLocation,
  saveLastKnownLocation,
  detectLocationInfo
} from './services/locationService';
import {
  registerCurrentDeviceLogin,
  updateCurrentDeviceLocation,
  markDeviceLoggedOut,
  getOrCreateDeviceId,
  subscribeToForceLogouts,
} from './services/deviceTrackingService';

const STORAGE_KEY_CASES = 'kaa_rada_cases_v2';
const STORAGE_KEY_USER = 'kaa_rada_current_user_v2';
const SAVED_PROFILES_KEY = 'kaa_rada_saved_profiles_v2';

export default function App() {
  // Load persistent cases from storage - defaults to empty [] so users start with clean slate for new data
  const [cases, setCases] = useState<DonkeyCase[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CASES);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sortCasesLatestFirst(autoAllocateCasesBatch(parsed, INITIAL_OFFICERS));
        }
        return [];
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

  // In-app notifications state
  const [notifications, setNotifications] = useState<InAppNotification[]>(() => getSavedNotifications());
  const [activeAlertCase, setActiveAlertCase] = useState<DonkeyCase | null>(null);
  const [activeRingingCase, setActiveRingingCase] = useState<DonkeyCase | null>(null);
  const ringingStopFnRef = useRef<(() => void) | null>(null);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [previewCase, setPreviewCase] = useState<DonkeyCase | null>(null);
  const [isSoundAlertEnabled, setIsSoundAlertEnabled] = useState(true);

  // All users stored in Firebase & local database
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Sync users from Firebase Firestore, server registry, and IndexedDB
  useEffect(() => {
    let isMounted = true;
    getAllUsersFromDb()
      .then((users) => {
        if (isMounted && users) {
          setAllUsers(users);
        }
      })
      .catch((err) => console.warn('Could not load users in App:', err));

    const unsubscribe = subscribeToFirestoreUsers((users) => {
      if (isMounted && users) {
        setAllUsers(users);
      }
    });

    // Cross-device user sync interval
    const syncInterval = setInterval(() => {
      if (!isMounted) return;
      getAllUsersFromDb()
        .then((users) => {
          if (isMounted && users && users.length > 0) {
            setAllUsers(users);
          }
        })
        .catch(() => {});
    }, 8000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(syncInterval);
    };
  }, []);

  const handleAddUser = async (newUser: UserProfile) => {
    await saveUserToDb(newUser);
    const updated = await getAllUsersFromDb();
    setAllUsers(updated);
  };

  const handleDeleteUser = async (userId: string, userPhone?: string) => {
    await deleteUserFromDb(userId, userPhone);
    const updated = await getAllUsersFromDb();
    setAllUsers(updated);
  };

  const handleRefreshUsers = async () => {
    const updated = await getAllUsersFromDb();
    setAllUsers(updated);
  };

  // Request system notification permission on user interaction or mount
  useEffect(() => {
    requestNotificationPermission().catch(() => {});
  }, []);

  // Stop ongoing incident phone ringtone
  const handleStopIncidentRing = () => {
    if (ringingStopFnRef.current) {
      try {
        ringingStopFnRef.current();
      } catch (e) {
        console.warn('Stop ring error:', e);
      }
      ringingStopFnRef.current = null;
    }
    setActiveRingingCase(null);
  };

  // Ring the phone when an incident is reported
  const triggerIncidentPhoneRing = (caseItem: DonkeyCase) => {
    setActiveRingingCase(caseItem);
    setActiveAlertCase(caseItem);

    // Stop any existing ringing
    if (ringingStopFnRef.current) {
      try {
        ringingStopFnRef.current();
      } catch {}
      ringingStopFnRef.current = null;
    }

    if (isSoundAlertEnabled) {
      try {
        const stopFn = playIncidentPhoneRing();
        ringingStopFnRef.current = stopFn;
      } catch (err) {
        console.warn('Audio ring playback notice:', err);
      }
    } else {
      triggerHapticAlert();
    }

    // Trigger system notification
    showSystemIncidentNotification(caseItem);
  };

  // Voice & Video Calling State (Active across all tabs and views)
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<ActiveCallSession | null>(null);

  // Synchronize current user credentials with CallService so all devices can receive calls
  useEffect(() => {
    const effectiveUserId = currentUser?.id || (currentUser?.phone ? `phone-${currentUser.phone}` : getGuestSenderId());
    const effectiveName = currentUser?.name || localStorage.getItem('dira_guest_name') || 'Community Member';
    callService.setCurrentUser(effectiveUserId, effectiveName, currentUser?.role, currentUser?.phone);
  }, [currentUser]);

  // Subscribe to real-time call states & incoming ringing invites globally
  useEffect(() => {
    const unsubCall = callService.onCallState(setActiveCall);
    const unsubIncoming = callService.onIncomingCall(setIncomingCall);
    return () => {
      unsubCall();
      unsubIncoming();
    };
  }, []);

  const handleAcceptIncomingCall = (call: ActiveCallSession) => {
    setIncomingCall(null);
    if (call.isGroup) {
      callService.joinGroupCall(call);
    } else {
      callService.answerCall(call);
    }
  };

  const handleDeclineIncomingCall = (callId: string) => {
    setIncomingCall(null);
    callService.rejectCall(callId);
  };

  const handleEndActiveCall = () => {
    callService.endCall();
    setActiveCall(null);
  };

  // Live Background Geolocation & Proximity Tracker
  const [userCoordinates, setUserCoordinates] = useState<Coordinates>(() => {
    try {
      const rawUser = localStorage.getItem(STORAGE_KEY_USER);
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed?.coordinates?.lat && parsed?.coordinates?.lng) {
          return parsed.coordinates;
        }
        if (parsed?.lastKnownLocation?.coordinates?.lat && parsed?.lastKnownLocation?.coordinates?.lng) {
          return parsed.lastKnownLocation.coordinates;
        }
      }
    } catch {}

    const stored = getStoredLastKnownLocation();
    if (stored && typeof stored.lat === 'number' && typeof stored.lng === 'number') {
      return stored;
    }
    return NAIROBI_COORDINATES;
  });
  const [userAccuracy, setUserAccuracy] = useState<number>(12);
  const [bgLocationSettings, setBgLocationSettings] = useState<BackgroundLocationSettings>(() => {
    return backgroundLocationTracker.getSettings();
  });

  // Dedicated GPS Sync function (query browser GPS or accept manual override)
  const syncLiveGpsLocation = (coordsOverride?: Coordinates) => {
    if (coordsOverride) {
      setUserCoordinates(coordsOverride);
      saveLastKnownLocation(coordsOverride, 10);
      if (currentUser) {
        updateCurrentDeviceLocation(coordsOverride, 10);
      }
      return;
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const freshCoords: Coordinates = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserCoordinates(freshCoords);
          setUserAccuracy(pos.coords.accuracy);
          saveLastKnownLocation(freshCoords, pos.coords.accuracy);
          if (currentUser) {
            updateCurrentDeviceLocation(freshCoords, pos.coords.accuracy);
          }
        },
        (err) => {
          console.warn('Direct GPS query notice:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
      );
    }
  };

  // Immediate GPS query on mount
  useEffect(() => {
    syncLiveGpsLocation();
  }, []);

  // Start background location tracking on mount and subscribe to live GPS movement updates
  useEffect(() => {
    backgroundLocationTracker.startTracking(bgLocationSettings.collectWhenNotInUse);

    const unsubscribe = backgroundLocationTracker.subscribe((coords, accuracy, details) => {
      setUserCoordinates(coords);
      setUserAccuracy(accuracy || 10);

      // Broadcast and persist live moved location to device tracking registry ONLY if user is logged in
      if (currentUser) {
        updateCurrentDeviceLocation(coords, accuracy, currentUser.id, details);
      }

      // Keep currentUser's location synchronized if logged in
      if (currentUser) {
        saveLastKnownLocation(coords, accuracy);
        setCurrentUser((prev) => {
          if (!prev) return prev;
          if (
            prev.coordinates &&
            Math.abs(prev.coordinates.lat - coords.lat) < 0.00002 &&
            Math.abs(prev.coordinates.lng - coords.lng) < 0.00002
          ) {
            return prev;
          }
          const updated = {
            ...prev,
            coordinates: coords,
            lastKnownLocation: {
              coordinates: coords,
              timestamp: new Date().toISOString(),
              accuracyMeters: accuracy ? Math.round(accuracy) : 10,
            },
          };
          try {
            localStorage.setItem('kaa_rada_current_user_v2', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [bgLocationSettings.collectWhenNotInUse, currentUser?.id]);

  // When currentUser changes (e.g. login or switch), update userCoordinates if user has location
  useEffect(() => {
    if (currentUser?.coordinates?.lat && currentUser?.coordinates?.lng) {
      setUserCoordinates(currentUser.coordinates);
      saveLastKnownLocation(currentUser.coordinates, 10);
    } else if (currentUser?.lastKnownLocation?.coordinates?.lat && currentUser?.lastKnownLocation?.coordinates?.lng) {
      setUserCoordinates(currentUser.lastKnownLocation.coordinates);
      saveLastKnownLocation(currentUser.lastKnownLocation.coordinates, 10);
    }
  }, [currentUser?.id]);

  // Sync current user's logged-in device session & live location to device tracking registry
  useEffect(() => {
    if (currentUser) {
      registerCurrentDeviceLogin(currentUser, userCoordinates, userAccuracy);
      updateCurrentDeviceLocation(userCoordinates, userAccuracy, currentUser.id);
    }
  }, [currentUser?.id]);

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  // Real-time Chat Broadcast & Unread Messaging State
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [activeChatBroadcast, setActiveChatBroadcast] = useState<DiraMessage | null>(null);
  const [targetChatChannelId, setTargetChatChannelId] = useState<string>('general');

  // Reset unread count and active alert when chat tab is open
  useEffect(() => {
    if (activeTab === 'chat') {
      setUnreadChatCount(0);
      setActiveChatBroadcast(null);
    }
  }, [activeTab]);

  // Open specific chat channel and clear alerts
  const handleOpenChatChannel = (channelId: string = 'general') => {
    setTargetChatChannelId(channelId);
    setActiveTab('chat');
    setActiveChatBroadcast(null);
    setUnreadChatCount(0);
  };

  // Modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isEmergencyReportModalOpen, setIsEmergencyReportModalOpen] = useState(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState(false);
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);
  const [isHotlineModalOpen, setIsHotlineModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  // Initialize IndexedDB Database & Cloud Sync on mount
  useEffect(() => {
    initAppDatabase().then((dbCases) => {
      if (dbCases && dbCases.length > 0) {
        setCases(sortCasesLatestFirst(autoAllocateCasesBatch(dbCases, INITIAL_OFFICERS)));
      }
    }).catch(err => {
      console.warn('Init DB warning:', err);
    });

    const unsubscribe = subscribeToFirestoreCases((cloudCases) => {
      if (cloudCases && cloudCases.length > 0) {
        setCases(sortCasesLatestFirst(autoAllocateCasesBatch(cloudCases, INITIAL_OFFICERS)));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Sync cases to both IndexedDB database and localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(cases));
      saveAllCasesToDb(cases).catch(e => console.warn('DB batch sync error:', e));
    } catch (e) {
      console.error('Failed to save cases to storage:', e);
    }
  }, [cases]);

  // Sync notifications to localStorage
  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  // Real-time multi-window / cross-tab broadcast listener
  // Whenever any tab reports a case, all logged-in users get the notification alert!
  useEffect(() => {
    const unsubscribe = subscribeToCaseBroadcasts((incomingCase) => {
      // 1. Sync case to local cases state if not yet present, ordered latest first
      setCases((prev) => {
        if (prev.some((c) => c.id === incomingCase.id || c.trackingCode === incomingCase.trackingCode)) {
          return prev;
        }
        return sortCasesLatestFirst([incomingCase, ...prev]);
      });

      // 2. Alert and ring phone for all logged in users!
      if (currentUser) {
        const notif = createNotificationFromCase(incomingCase, currentUser);
        setNotifications((prev) => [notif, ...prev.filter((n) => n.caseId !== incomingCase.id)]);
        triggerIncidentPhoneRing(incomingCase);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, isSoundAlertEnabled]);

  // Real-time Global Chat Broadcast Listener
  // Broadcasts incoming messages across Firestore and cross-tab/webview to all logged-in users!
  useEffect(() => {
    const unsubscribe = subscribeToGlobalChatBroadcast((incomingMsg) => {
      if (!incomingMsg || !incomingMsg.id) return;

      // Do not trigger incoming notification audio/toast if current user is the sender
      const isSentByMe = Boolean(
        currentUser && (
          incomingMsg.senderId === currentUser.id ||
          (currentUser.phone && incomingMsg.senderPhone === currentUser.phone)
        )
      );
      if (isSentByMe) return;

      // 1. Audio chime & vibration alert
      if (isSoundAlertEnabled) {
        playChatBroadcastChime();
        triggerHapticAlert(35);
      }

      // 2. Native notification for background/PWA
      showSystemChatNotification(incomingMsg);

      // 3. Show in-app broadcast banner and update unread count if not currently in chat
      if (activeTab !== 'chat') {
        setActiveChatBroadcast(incomingMsg);
        setUnreadChatCount((prev) => prev + 1);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser?.id, currentUser?.phone, isSoundAlertEnabled, activeTab]);

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

    // Automatic AI Proximity Allocation to nearest Super User
    const aiResult = allocateCaseWithAI(
      {
        category: newCaseData.category,
        urgency: newCaseData.urgency,
        title: newCaseData.title,
        description: newCaseData.description,
        location: newCaseData.location,
        isEmergency: newCaseData.isEmergency,
        donkeysCount: newCaseData.donkeysCount,
      },
      INITIAL_OFFICERS
    );

    const initialLog: ActionLog = {
      id: `log-${Date.now()}-1`,
      timestamp,
      officer: 'Caritas Kitui Intake Desk',
      action: newCaseData.isEmergency ? '🚨 Emergency Incident Logged' : 'Incident Logged',
      notes: `Report received from ${newCaseData.location?.village || 'Scene'}, ${newCaseData.location?.subCounty || 'Kitui'}. Emergency: ${newCaseData.isEmergency ? 'YES' : 'NO'}. Dispatched via AI Proximity Engine.`,
    };

    const assignedOfficer = newCaseData.assignedOfficer || {
      id: aiResult.allocatedOfficer.id,
      name: aiResult.allocatedOfficer.name,
      title: aiResult.allocatedOfficer.roleTitle || aiResult.allocatedOfficer.designation || 'Super User',
      department: aiResult.allocatedOfficer.department || 'Caritas Response Unit',
      phone: aiResult.allocatedOfficer.phone,
    };

    const fullCase: DonkeyCase = {
      ...newCaseData,
      id: generatedId,
      trackingCode: generatedCode,
      reportedAt: timestamp,
      status: 'dispatched',
      assignedOfficer,
      aiAllocation: newCaseData.aiAllocation || aiResult.metadata,
      actionLogs: [aiResult.actionLog, initialLog],
    };

    setCases((prev) => sortCasesLatestFirst([fullCase, ...prev.filter(c => c.id !== fullCase.id)]));

    // In-app notification and phone ring alert for all logged in users:
    if (currentUser) {
      const notif = createNotificationFromCase(fullCase, currentUser);
      setNotifications((prev) => [notif, ...prev.filter((n) => n.caseId !== fullCase.id)]);
      triggerIncidentPhoneRing(fullCase);
    }

    // Broadcast in real-time to all other open tabs / sessions
    broadcastCaseReported(fullCase, currentUser?.id);
  };

  // Notification action handlers
  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const handleClearNotifications = () => {
    setNotifications([]);
  };

  const handleViewCaseFromAlert = (caseItem: DonkeyCase) => {
    setActiveAlertCase(null);
    setPreviewCase(caseItem);
  };

  // Helper to trigger a demo test alert
  const handleTriggerTestAlert = () => {
    if (!currentUser) return;
    const testCase: DonkeyCase = {
      id: `KR-DEMO-${Math.floor(1000 + Math.random() * 9000)}`,
      trackingCode: `KR-${Math.floor(1000 + Math.random() * 9000)}`,
      category: 'donkey_theft',
      title: 'Alert Test: Stolen Donkeys Tracked near Wikililye',
      description: 'Community members reported suspicious night movement of 3 donkeys towards Katulani bypass.',
      donkeysCount: 3,
      incidentDateTime: new Date().toISOString(),
      reportedAt: new Date().toISOString(),
      urgency: 'critical',
      status: 'reported',
      location: {
        county: 'Kitui',
        subCounty: 'Kitui Rural',
        ward: 'Kisasi',
        subLocation: 'Wikililye Sub-Location',
        village: 'Wikililye Market',
        landmark: 'Near Borehole Junction',
        coordinates: { lat: -1.4502, lng: 38.0315 },
      },
      photos: [],
      reporter: {
        isAnonymous: false,
        name: 'Meshack Munyoki',
        relationship: 'owner',
        phone: '0722 456 789',
      },
      actionLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          officer: 'Caritas Kitui Intake Desk',
          action: 'Incident Logged & Dispatched',
          notes: 'Emergency alert dispatched to local chief & animal welfare patrol.',
        },
      ],
    };

    setCases((prev) => sortCasesLatestFirst([testCase, ...prev.filter(c => c.id !== testCase.id)]));
    const notif = createNotificationFromCase(testCase, currentUser);
    setNotifications((prev) => [notif, ...prev.filter((n) => n.caseId !== testCase.id)]);
    triggerIncidentPhoneRing(testCase);
    broadcastCaseReported(testCase, currentUser?.id);
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

  // Proximity-based case allocation handler
  const handleAllocateCaseByProximity = (caseId: string, officer: UserProfile, distanceKm: number) => {
    const distFormatted = formatDistance(distanceKm);
    handleEscalateCase(
      caseId,
      officer.name,
      officer.roleTitle || officer.designation,
      `Automatic Proximity Dispatch: Assigned based on live GPS radar. Officer is ~${distFormatted} from incident scene. Mobilize immediate response unit.`
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
    if (!newUser) {
      handleLogout();
      return;
    }
    if (currentUser && currentUser.id !== newUser.id) {
      try {
        markDeviceLoggedOut(getOrCreateDeviceId(), currentUser.id);
      } catch {}
    }
    setCurrentUser(newUser);
    if (newUser?.role === 'super_user') {
      setActiveTab('super_portal');
    }
  };

  const [remoteRevocationNotice, setRemoteRevocationNotice] = useState<string | null>(null);

  // Listen for Super Admin remote force-logout directed at this device or user
  useEffect(() => {
    const baseDevId = getOrCreateDeviceId();
    const currentUserId = currentUser?.id;

    const unsubscribe = subscribeToForceLogouts(baseDevId, currentUserId, (event) => {
      console.warn('Received remote revocation directive from Super Admin:', event);
      handleLogout();
      setRemoteRevocationNotice(
        `Your device session was remotely terminated by Super Administrator (${event.loggedOutBy || 'Super Admin'}). Your icon has been removed from the live map.`
      );
    });

    return unsubscribe;
  }, [currentUser?.id]);

  // Log out user - completely removes device from map and logged in users registry
  const handleLogout = () => {
    const baseDevId = getOrCreateDeviceId();
    const currentUserId = currentUser?.id;
    try {
      markDeviceLoggedOut(baseDevId, currentUserId);
    } catch (e) {
      console.error('Device logout error:', e);
    }
    setCurrentUser(null);
    setActiveChatBroadcast(null);
    setUnreadChatCount(0);
    setActiveTab('home');
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

  // Helper to clear all data and signed up users
  const handleClearAllData = async () => {
    setCases([]);
    try {
      await deleteAllSignedUpUsersAndSampleData();
      setAllUsers([SUPER_ADMIN_ACCOUNT]);
      if (currentUser && currentUser.id !== SUPER_ADMIN_ACCOUNT.id) {
        setCurrentUser(null);
      }
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
    <div className="min-h-screen min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-zinc-100 flex flex-col justify-between text-zinc-900 selection:bg-red-800 selection:text-white">
      {/* App Header Bar (Native Android Sticky Top Bar) */}
      <HeaderBar
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenHotlineModal={() => setIsHotlineModalOpen(true)}
        onOpenEmergencyReport={() => setIsEmergencyReportModalOpen(true)}
        onOpenDatabaseModal={() => setIsDatabaseModalOpen(true)}
        onOpenNotifications={() => setIsNotificationsModalOpen(true)}
        onNavigateToChat={() => handleOpenChatChannel('general')}
        unreadChatCount={unreadChatCount}
        bgTrackingActive={bgLocationSettings.collectWhenNotInUse}
        unreadNotificationsCount={notifications.filter((n) => !n.isRead).length}
        onLogout={currentUser ? handleLogout : undefined}
        pendingCasesCount={pendingCount}
      />

      {/* Super Admin Remote Revocation Notice Banner */}
      {remoteRevocationNotice && (
        <div className="bg-red-950 text-white px-4 py-3 border-b-2 border-red-500 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="font-extrabold text-red-200 uppercase tracking-wider text-[11px]">
                Session Terminated by Super Admin
              </div>
              <p className="text-zinc-200 text-xs mt-0.5">{remoteRevocationNotice}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRemoteRevocationNotice(null)}
            className="shrink-0 px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Viewport Content based on active navigation tab with ample bottom clearance */}
      <main
        className={`flex-1 w-full max-w-4xl mx-auto px-2 sm:px-4 ${
          activeTab === 'chat'
            ? 'py-1 pb-16 sm:pb-20 flex flex-col h-[calc(100dvh-56px)] overflow-hidden'
            : 'py-3 sm:py-5 overflow-y-auto overflow-x-hidden pb-20 sm:pb-24'
        }`}
      >
        {activeTab === 'home' && (
          <HomeDashboard
            cases={cases}
            currentUser={currentUser}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenEmergencyReportModal={() => setIsEmergencyReportModalOpen(true)}
            onOpenHotlineModal={() => setIsHotlineModalOpen(true)}
            onNavigateTab={(tab) => setActiveTab(tab)}
            userCoordinates={userCoordinates}
            userAccuracy={userAccuracy}
            bgSettings={bgLocationSettings}
            onUpdateBgSettings={setBgLocationSettings}
            onAllocateCaseToOfficer={handleAllocateCaseByProximity}
            onSimulateLocation={(coords, label) => {
              syncLiveGpsLocation(coords);
            }}
            onSyncGps={syncLiveGpsLocation}
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
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'chat' && (
          <CommunityChatView
            currentUser={currentUser}
            cases={cases}
            allUsers={allUsers}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            initialChannelId={targetChatChannelId}
            onSelectCase={(targetCase) => {
              setPreviewCase(targetCase);
            }}
          />
        )}

        {activeTab === 'hotspots' && (
          <HotspotsMapView
            cases={cases}
            currentUser={currentUser}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenHotlineModal={() => setIsHotlineModalOpen(true)}
            userCoordinates={userCoordinates}
            userAccuracy={userAccuracy}
            bgSettings={bgLocationSettings}
            onUpdateBgSettings={setBgLocationSettings}
            onAllocateCaseToOfficer={handleAllocateCaseByProximity}
            onSimulateLocation={(coords, label) => {
              syncLiveGpsLocation(coords);
            }}
            onSyncGps={syncLiveGpsLocation}
          />
        )}

        {activeTab === 'super_portal' && (
          <SuperUserDashboard
            cases={cases}
            currentUser={currentUser}
            allUsers={allUsers}
            onAddUser={handleAddUser}
            onDeleteUser={handleDeleteUser}
            onRefreshUsers={handleRefreshUsers}
            onUpdateCaseStatus={handleUpdateCaseStatus}
            onAddActionLog={handleAddActionLog}
            onEscalateCase={handleEscalateCase}
            onResolveCase={handleResolveCase}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onOpenChangePasswordModal={() => setIsChangePasswordModalOpen(true)}
            onOpenDriveModal={() => setIsDriveModalOpen(true)}
            onNavigateToRadarMap={() => setActiveTab('hotspots')}
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
                Manage database storage, wipe signed-up users and sample data, or test system alerts:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={handleClearAllData}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-red-50 text-zinc-700 hover:text-red-700 rounded-xl text-xs font-bold transition-all border border-zinc-200"
                >
                  Wipe All Signed-Up Users & Data ({cases.length} cases)
                </button>
                <button
                  onClick={handleTriggerTestAlert}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all border border-red-700 flex items-center gap-1.5 shadow-xs"
                >
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  Test Incident Phone Ring
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all border border-emerald-800 flex items-center gap-1.5 shadow-xs"
                >
                  Go to Community Messenger
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Incoming Incident Phone Ring Alert Banner with Audio & Vibration */}
      <IncidentRingingBanner
        caseItem={activeRingingCase}
        onViewCase={(caseItem) => {
          handleStopIncidentRing();
          handleViewCaseFromAlert(caseItem);
        }}
        onDismiss={handleStopIncidentRing}
      />

      {/* Floating In-App Live Case Notification Alert Banner */}
      <InAppNotificationAlert
        activeCase={activeAlertCase}
        onDismiss={() => setActiveAlertCase(null)}
        onViewCase={handleViewCaseFromAlert}
      />

      {/* Floating Real-time Chat Broadcast Alert Toast */}
      <InAppChatBroadcastAlert
        message={activeChatBroadcast}
        onDismiss={() => setActiveChatBroadcast(null)}
        onOpenChat={(channelId) => handleOpenChatChannel(channelId)}
      />

      {/* Real-time Voice & Video Incoming Call Ringing Banner (Active on all tabs) */}
      <IncomingCallBanner
        call={incomingCall}
        onAccept={handleAcceptIncomingCall}
        onDecline={handleDeclineIncomingCall}
      />

      {/* Global Voice & Video Call Modal / PiP - Stays connected across tab navigation */}
      {activeCall && (
        <CallModal
          call={activeCall}
          currentUser={currentUser}
          onEndCall={handleEndActiveCall}
        />
      )}

      {/* Notification Center History Drawer / Modal */}
      <NotificationCenterModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        notifications={notifications}
        cases={cases}
        onMarkAllAsRead={handleMarkAllNotificationsRead}
        onMarkAsRead={handleMarkNotificationRead}
        onClearAll={handleClearNotifications}
        onSelectCase={handleViewCaseFromAlert}
        isSoundEnabled={isSoundAlertEnabled}
        onToggleSound={() => setIsSoundAlertEnabled((prev) => !prev)}
      />

      {/* Instant Case Details Preview Modal (from notification or case icon click) */}
      <CaseDetailsPreviewModal
        isOpen={Boolean(previewCase)}
        onClose={() => setPreviewCase(null)}
        caseItem={previewCase}
        currentUser={currentUser}
        onRateCase={handleRateCase}
        onNavigateToTab={(tab) => {
          setActiveTab(tab);
          setPreviewCase(null);
        }}
      />

      {/* Android Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        userRole={currentUser?.role || 'primary_user'}
        pendingCount={pendingCount}
        myCasesCount={userReportedCasesCount}
        unreadChatCount={unreadChatCount}
      />

      {/* Modals */}
      <EmergencyReportModal
        isOpen={isEmergencyReportModalOpen}
        onClose={() => setIsEmergencyReportModalOpen(false)}
        onSubmitEmergencyCase={handleAddNewCase}
        currentUser={currentUser}
        userCoordinates={userCoordinates}
        userAccuracy={userAccuracy}
      />

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

      <DatabaseModal
        isOpen={isDatabaseModalOpen}
        onClose={() => setIsDatabaseModalOpen(false)}
        onCasesUpdated={setCases}
      />

      <ApkExportModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
      />
    </div>
  );
}
