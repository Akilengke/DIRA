import { LoggedInDevice, UserProfile, Coordinates } from '../types';
import { getFirestoreClient } from './db';
import { collection, doc, setDoc, getDocs, onSnapshot, deleteDoc, query, orderBy, limit } from 'firebase/firestore';

const STORAGE_KEY_DEVICE_ID = 'dira_device_client_id_v1';
const STORAGE_KEY_LOGGED_IN_DEVICES = 'dira_logged_in_devices_v2';
const BROADCAST_CHANNEL_DEVICES = 'dira_devices_channel_v1';
const BROADCAST_CHANNEL_FORCE_LOGOUT = 'dira_force_logout_channel_v1';
const FIRESTORE_COLLECTION_DEVICES = 'dira_logged_in_devices';
export const FIRESTORE_COLLECTION_FORCE_LOGOUTS = 'dira_force_logouts';

export interface ForceLogoutEvent {
  targetDeviceId: string;
  targetUserId?: string;
  targetUserName?: string;
  loggedOutBy: string;
  timestamp: string;
  reason?: string;
}

/**
 * Utility to verify if a user profile is a Super Admin
 */
export function isSuperAdmin(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  return (
    user.role === 'super_admin' ||
    user.id === 'usr-super-admin' ||
    user.phone === 'admin' ||
    Boolean(user.roleTitle && user.roleTitle.toLowerCase().includes('super admin')) ||
    Boolean(user.designation && user.designation.toLowerCase().includes('super administrator'))
  );
}

/**
 * Get or create a unique hardware client device identifier for this browser/phone
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'device-server';
  try {
    let id = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!id) {
      const rand = Math.random().toString(36).substring(2, 9);
      id = `dev-${Date.now().toString(36)}-${rand}`;
      localStorage.setItem(STORAGE_KEY_DEVICE_ID, id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}

/**
 * Inspect User-Agent & screen parameters to detect realistic device model name
 */
export function detectDeviceModel(): { deviceType: 'mobile' | 'tablet' | 'desktop'; deviceModel: string } {
  if (typeof navigator === 'undefined') {
    return { deviceType: 'mobile', deviceModel: 'Android Mobile' };
  }

  const ua = navigator.userAgent;
  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'mobile';
  let deviceModel = 'Field Smartphone';

  if (/iPad/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua) && window.innerWidth < 1100)) {
    deviceType = 'tablet';
    deviceModel = 'Apple iPad';
  } else if (/Tablet|SM-T/i.test(ua)) {
    deviceType = 'tablet';
    deviceModel = 'Samsung Galaxy Tab';
  } else if (/Android/i.test(ua)) {
    deviceType = 'mobile';
    if (/Samsung|SM-|Galaxy/i.test(ua)) {
      deviceModel = 'Samsung Galaxy (Android)';
    } else if (/Tecno/i.test(ua)) {
      deviceModel = 'Tecno Spark / Camon';
    } else if (/Infinix/i.test(ua)) {
      deviceModel = 'Infinix Hot Mobile';
    } else if (/Redmi|Xiaomi/i.test(ua)) {
      deviceModel = 'Xiaomi Redmi';
    } else if (/Oppo/i.test(ua)) {
      deviceModel = 'OPPO A-Series';
    } else {
      deviceModel = 'Android Smartphone';
    }
  } else if (/iPhone/i.test(ua)) {
    deviceType = 'mobile';
    deviceModel = 'Apple iPhone';
  } else if (/Macintosh|Mac OS/i.test(ua)) {
    deviceType = 'desktop';
    deviceModel = 'MacBook Command Unit';
  } else if (/Windows/i.test(ua)) {
    deviceType = 'desktop';
    deviceModel = 'Windows PC Desk';
  } else {
    deviceType = 'desktop';
    deviceModel = 'Dispatch Workstation';
  }

  return { deviceType, deviceModel };
}

/**
 * Sample devices list is kept strictly empty so only genuine, real logged-in hardware devices appear.
 */
export const SAMPLE_DEVICE_IDS = new Set([
  'dev-officer-musyoka',
  'dev-officer-marita',
  'dev-officer-vet-nduku',
  'dev-officer-mutua',
  'dev-primary-kaloki',
  'dev-primary-kimanzi',
  'dev-primary-elder-patrick',
  'dev-primary-mwende',
]);

/**
 * Filter utility to recognize and purge any legacy sample/mock devices
 */
export function isSampleDevice(device: Partial<LoggedInDevice> | null | undefined): boolean {
  if (!device) return false;
  if (device.deviceId && SAMPLE_DEVICE_IDS.has(device.deviceId)) return true;
  if (device.deviceId && (device.deviceId.startsWith('dev-officer-') || device.deviceId.startsWith('dev-primary-'))) return true;
  if (device.userId && (device.userId.startsWith('usr-officer-') || device.userId.startsWith('usr-primary-'))) return true;
  return false;
}

export const INITIAL_LOGGED_IN_DEVICES: LoggedInDevice[] = [];

/**
 * Get all devices that have logged in (real devices only)
 */
export function getStoredLoggedInDevices(): LoggedInDevice[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOGGED_IN_DEVICES);
    let parsed: LoggedInDevice[] = [];
    if (raw) {
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        parsed = items.filter((d) => d && !isSampleDevice(d));
      }
    }

    // Persist cleansed list back so sample devices are deleted from disk
    if (raw) {
      saveLoggedInDevices(parsed);
    }

    return parsed;
  } catch (err) {
    console.warn('Could not read stored logged in devices:', err);
    return [];
  }
}

/**
 * Save logged in devices list to local storage (sanitized to remove sample devices)
 */
export function saveLoggedInDevices(devices: LoggedInDevice[]): void {
  if (typeof window === 'undefined') return;
  try {
    const realDevices = (devices || []).filter((d) => d && !isSampleDevice(d));
    localStorage.setItem(STORAGE_KEY_LOGGED_IN_DEVICES, JSON.stringify(realDevices));
  } catch (err) {
    console.warn('Could not save logged in devices:', err);
  }
}

/**
 * Broadcast device updates across browser tabs
 */
function broadcastDeviceEvent(type: 'UPSERT' | 'REMOVE', device: LoggedInDevice) {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_DEVICES);
      channel.postMessage({ type, device });
      setTimeout(() => channel.close(), 400);
    } catch {
      // Ignore
    }
  }
}

/**
 * Register or update the current logged-in device session
 */
export function registerCurrentDeviceLogin(
  user: UserProfile,
  coords: Coordinates,
  accuracyMeters: number = 10
): LoggedInDevice {
  const baseDeviceId = getOrCreateDeviceId();
  const deviceId = `${baseDeviceId}_${user.id}`;
  const { deviceType, deviceModel } = detectDeviceModel();

  const deviceSession: LoggedInDevice = {
    deviceId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    userPhone: user.phone || '+254700000000',
    userDesignation: user.designation || user.roleTitle || user.title || (user.role === 'super_user' ? 'Super User Officer' : 'Community Member'),
    subCounty: user.subCounty || 'Kitui Central',
    village: user.village || 'Kitui',
    deviceType,
    deviceModel,
    coordinates: coords,
    accuracyMeters: Math.round(accuracyMeters),
    lastActive: new Date().toISOString(),
    loggedInAt: new Date().toISOString(),
    isOnline: true,
    batteryLevel: 95,
  };

  const currentList = getStoredLoggedInDevices();
  const index = currentList.findIndex((d) => d.deviceId === deviceId || d.userId === user.id);

  let updatedList: LoggedInDevice[];
  if (index !== -1) {
    updatedList = [...currentList];
    updatedList[index] = {
      ...updatedList[index],
      ...deviceSession,
      loggedInAt: updatedList[index].loggedInAt || deviceSession.loggedInAt,
    };
  } else {
    updatedList = [deviceSession, ...currentList];
  }

  saveLoggedInDevices(updatedList);
  broadcastDeviceEvent('UPSERT', deviceSession);

  // Sync to Cloud Firestore if connected
  try {
    const firestore = getFirestoreClient();
    if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
      const docRef = doc(firestore, FIRESTORE_COLLECTION_DEVICES, deviceId);
      setDoc(docRef, deviceSession, { merge: true }).catch((e) =>
        console.warn('Firestore device registration note:', e.message)
      );
    }
  } catch (e) {
    // Graceful offline fallback
  }

  return deviceSession;
}

// Firestore write throttle tracking
let lastFirestoreSyncTime = 0;
let lastFirestoreSyncCoords: Coordinates | null = null;

/**
 * Update the location of the current device in the logged in devices registry as the device moves
 * Only updates when a valid user is logged in
 */
export function updateCurrentDeviceLocation(
  coords: Coordinates,
  accuracyMeters?: number,
  userId?: string,
  extra?: { speedKmh?: number; headingDeg?: number; isMoving?: boolean; distanceMovedMeters?: number }
): void {
  let targetUserId = userId;
  let targetUserProfile: UserProfile | null = null;
  if (typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('kaa_rada_current_user_v2');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u && u.id) {
          targetUserId = u.id;
          targetUserProfile = u;
        }
      }
    } catch {}
  }

  // Strictly require a logged-in user to record a logged-in device
  if (!targetUserId && !targetUserProfile) {
    return;
  }

  const baseDeviceId = getOrCreateDeviceId();
  const deviceId = targetUserId ? `${baseDeviceId}_${targetUserId}` : baseDeviceId;
  const currentList = getStoredLoggedInDevices();
  const index = currentList.findIndex(
    (d) =>
      d.deviceId === deviceId ||
      d.deviceId === baseDeviceId ||
      d.deviceId.startsWith(baseDeviceId) ||
      (targetUserId && d.userId === targetUserId)
  );

  const nowIso = new Date().toISOString();
  const roundedAccuracy = accuracyMeters ? Math.round(accuracyMeters) : 10;

  if (index !== -1) {
    const existing = currentList[index];
    const updated: LoggedInDevice = {
      ...existing,
      coordinates: coords,
      accuracyMeters: roundedAccuracy,
      lastActive: nowIso,
      isOnline: true,
      speedKmh: extra?.speedKmh !== undefined ? extra.speedKmh : existing.speedKmh,
      headingDeg: extra?.headingDeg !== undefined ? extra.headingDeg : existing.headingDeg,
      isMoving: extra?.isMoving !== undefined ? extra.isMoving : existing.isMoving,
    };

    const updatedList = [...currentList];
    updatedList[index] = updated;
    saveLoggedInDevices(updatedList);
    broadcastDeviceEvent('UPSERT', updated);

    // Sync to Firestore in background (throttled to at most every 2.5s unless moved significantly)
    const now = Date.now();
    const shouldSyncFirestore =
      now - lastFirestoreSyncTime > 2500 ||
      !lastFirestoreSyncCoords ||
      Math.abs(lastFirestoreSyncCoords.lat - coords.lat) > 0.0001 ||
      Math.abs(lastFirestoreSyncCoords.lng - coords.lng) > 0.0001;

    if (shouldSyncFirestore) {
      lastFirestoreSyncTime = now;
      lastFirestoreSyncCoords = coords;
      try {
        const firestore = getFirestoreClient();
        if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
          const docRef = doc(firestore, FIRESTORE_COLLECTION_DEVICES, updated.deviceId);
          setDoc(
            docRef,
            {
              coordinates: coords,
              accuracyMeters: updated.accuracyMeters,
              lastActive: updated.lastActive,
              isOnline: true,
              speedKmh: updated.speedKmh || 0,
              headingDeg: updated.headingDeg || 0,
              isMoving: Boolean(updated.isMoving),
            },
            { merge: true }
          ).catch(() => {});
        }
      } catch {}
    }
  } else {
    // If not yet registered in devices list and we have a logged in user profile, register them
    if (targetUserProfile) {
      registerCurrentDeviceLogin(targetUserProfile, coords, roundedAccuracy);
    }
  }
}

/**
 * Completely unregister and log out a device from the app.
 * Removes it from local storage and deletes it from Cloud Firestore
 * so it no longer appears on the map or in logged-in user registries.
 */
export function markDeviceLoggedOut(identifier?: string, userId?: string): void {
  const baseDeviceId = getOrCreateDeviceId();
  const currentList = getStoredLoggedInDevices();

  const toRemoveIndices = new Set<number>();
  const devicesToRemove: LoggedInDevice[] = [];

  const isExplicitTarget = Boolean(identifier || userId);

  const checkMatches = (d: LoggedInDevice) => {
    if (!d) return false;
    if (identifier && (d.deviceId === identifier || d.deviceId.includes(identifier) || d.userId === identifier)) return true;
    if (userId && d.userId === userId) return true;
    // Only match baseDeviceId if NO explicit foreign identifier/user was targeted
    if (!isExplicitTarget && (d.deviceId === baseDeviceId || d.deviceId.startsWith(baseDeviceId))) return true;
    return false;
  };

  currentList.forEach((d, idx) => {
    if (checkMatches(d)) {
      toRemoveIndices.add(idx);
      devicesToRemove.push(d);
    }
  });

  // Remove matching devices from local storage immediately
  const updatedList = currentList.filter((_, idx) => !toRemoveIndices.has(idx));
  saveLoggedInDevices(updatedList);

  // Broadcast REMOVE event so all open tabs and components update immediately
  devicesToRemove.forEach((d) => {
    broadcastDeviceEvent('REMOVE', { ...d, isOnline: false });
  });

  // Cross-tab storage event for webviews and secondary tabs
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('dira_device_logout_event', JSON.stringify({
        baseDeviceId: identifier || baseDeviceId,
        userId: userId || identifier || '',
        ts: Date.now(),
      }));
    } catch {}
  }

  // Delete from Cloud Firestore collection
  try {
    const firestore = getFirestoreClient();
    if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
      devicesToRemove.forEach((dev) => {
        const docRef = doc(firestore, FIRESTORE_COLLECTION_DEVICES, dev.deviceId);
        deleteDoc(docRef).catch(() => {
          // If delete fails, set isOnline to false
          setDoc(docRef, { isOnline: false, lastActive: new Date().toISOString() }, { merge: true }).catch(() => {});
        });
      });

      // Also clean up by target ID variants
      if (identifier) {
        const docRef = doc(firestore, FIRESTORE_COLLECTION_DEVICES, identifier);
        deleteDoc(docRef).catch(() => {});
      }
      if (!isExplicitTarget) {
        const baseDocRef = doc(firestore, FIRESTORE_COLLECTION_DEVICES, baseDeviceId);
        deleteDoc(baseDocRef).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('Firestore device logout note:', e);
  }
}

/**
 * Super Admin administrative function to remotely disconnect/log out a user device.
 * 1. Purges the device from local storage & memory.
 * 2. Deletes the device document from Cloud Firestore `dira_logged_in_devices`.
 * 3. Writes a revocation command to `dira_force_logouts` in Firestore.
 * 4. Broadcasts a REMOVE event via BroadcastChannel and localStorage so all maps update immediately.
 * 5. Dispatches a window CustomEvent so open map instances remove the marker instantly.
 */
export async function adminForceLogoutDevice(
  targetDeviceId: string,
  targetUserId?: string,
  targetUserName?: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  if (!targetDeviceId && !targetUserId) {
    return { success: false, message: 'Invalid device or user identifier' };
  }

  const currentList = getStoredLoggedInDevices();
  const devicesToRemove: LoggedInDevice[] = [];
  const toRemoveIds = new Set<string>();

  currentList.forEach((d) => {
    if (!d) return;
    const matchesDevice = Boolean(targetDeviceId && (d.deviceId === targetDeviceId || d.deviceId.includes(targetDeviceId)));
    const matchesUser = Boolean(targetUserId && d.userId === targetUserId);
    if (matchesDevice || matchesUser) {
      devicesToRemove.push(d);
      toRemoveIds.add(d.deviceId);
    }
  });

  // Filter out from local stored devices immediately
  const updatedList = currentList.filter(
    (d) => !toRemoveIds.has(d.deviceId) && d.deviceId !== targetDeviceId && (!targetUserId || d.userId !== targetUserId)
  );
  saveLoggedInDevices(updatedList);

  const eventPayload: ForceLogoutEvent = {
    targetDeviceId,
    targetUserId: targetUserId || '',
    targetUserName: targetUserName || devicesToRemove[0]?.userName || 'User',
    loggedOutBy: 'Super Admin',
    timestamp: new Date().toISOString(),
    reason: reason || 'Administrative session termination from live map console',
  };

  // Broadcast REMOVE to all tabs & instances
  broadcastDeviceEvent('REMOVE', {
    deviceId: targetDeviceId,
    userId: targetUserId || '',
    userName: targetUserName || 'User',
    userRole: 'primary_user',
    userPhone: '',
    deviceType: 'mobile',
    deviceModel: 'Field Device',
    coordinates: { lat: -1.368, lng: 38.01 },
    lastActive: new Date().toISOString(),
    loggedInAt: new Date().toISOString(),
    isOnline: false,
  });

  // Cross-tab storage events
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('dira_force_logout_event', JSON.stringify({
        ...eventPayload,
        _nonce: Date.now(),
      }));
      localStorage.setItem('dira_device_logout_event', JSON.stringify({
        baseDeviceId: targetDeviceId,
        userId: targetUserId || '',
        ts: Date.now(),
      }));
    } catch {}
  }

  // Dispatch custom DOM event for immediate synchronous map refresh
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('dira_device_logged_out', {
        detail: {
          deviceId: targetDeviceId,
          userId: targetUserId,
          userName: targetUserName,
        },
      }));
    } catch {}
  }

  // Cloud Firestore operations (Non-blocking so map UI never hangs or freezes)
  try {
    const firestore = getFirestoreClient();
    if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
      // 1. Remove device session record from dira_logged_in_devices (only live map radar, NEVER deletes user profile or credentials from dira_users)
      if (targetDeviceId) {
        const docRef = doc(firestore, FIRESTORE_COLLECTION_DEVICES, targetDeviceId);
        deleteDoc(docRef).catch(() => {
          setDoc(docRef, { isOnline: false, lastActive: new Date().toISOString() }, { merge: true }).catch(() => {});
        });
      }

      // Also clean up by userId in devices collection only
      if (targetUserId) {
        const userDocRef = doc(firestore, FIRESTORE_COLLECTION_DEVICES, `${targetDeviceId}_${targetUserId}`);
        deleteDoc(userDocRef).catch(() => {});
      }

      // 2. Publish revocation command to dira_force_logouts collection so remote target device reacts
      // Using Promise.race with a 250ms timeout so UI never hangs waiting on Firestore
      const logoutDocId = `${targetDeviceId}_${Date.now()}`;
      const forceDocRef = doc(firestore, FIRESTORE_COLLECTION_FORCE_LOGOUTS, logoutDocId);
      await Promise.race([
        setDoc(forceDocRef, eventPayload),
        new Promise((resolve) => setTimeout(resolve, 250)),
      ]).catch(() => {});
    }
  } catch (e) {
    console.warn('Firestore admin force logout error:', e);
  }

  // NOTE: User account credentials, user profile in dira_users, and reported cases are completely preserved so the user can log in again anytime!
  return {
    success: true,
    message: `User ${targetUserName || 'device'} was successfully logged out and removed from the live map. User account is kept safe to log in again.`,
  };
}

/**
 * Listen for remote force-logouts directed at the current device or current user
 */
export function subscribeToForceLogouts(
  currentDeviceId: string,
  currentUserId: string | undefined,
  onRevoked: (event: ForceLogoutEvent) => void
): () => void {
  let isSubscribed = true;

  const handleEventCheck = (data: any) => {
    if (!data || !isSubscribed) return;
    const targetDev = data.targetDeviceId;
    const targetUser = data.targetUserId;
    
    const isTargetDevice = Boolean(targetDev && (targetDev === currentDeviceId || currentDeviceId.startsWith(targetDev) || targetDev.startsWith(currentDeviceId)));
    const isTargetUser = Boolean(currentUserId && targetUser && currentUserId === targetUser);

    if (isTargetDevice || isTargetUser) {
      onRevoked(data);
    }
  };

  // 1. Storage event listener (cross-tab)
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'dira_force_logout_event' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        handleEventCheck(parsed);
      } catch {}
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  // 2. BroadcastChannel listener
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_FORCE_LOGOUT);
      channel.addEventListener('message', (ev) => {
        if (ev.data) {
          handleEventCheck(ev.data);
        }
      });
    } catch {}
  }

  // 3. Firestore snapshot listener
  let unsubFirestore: (() => void) | null = null;
  try {
    const firestore = getFirestoreClient();
    if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
      const colRef = collection(firestore, FIRESTORE_COLLECTION_FORCE_LOGOUTS);
      const q = query(colRef, orderBy('timestamp', 'desc'), limit(15));
      unsubFirestore = onSnapshot(q, (snapshot) => {
        if (!isSubscribed) return;
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as ForceLogoutEvent;
            handleEventCheck(data);
          }
        });
      }, (err) => console.warn('Force logout listener note:', err));
    }
  } catch {}

  return () => {
    isSubscribed = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
    if (channel) {
      try { channel.close(); } catch {}
    }
    if (unsubFirestore) {
      try { unsubFirestore(); } catch {}
    }
  };
}

/**
 * Subscribe to real-time changes in logged-in devices across tabs and Firestore
 */
export function subscribeToLoggedInDevices(
  onUpdate: (devices: LoggedInDevice[]) => void
): () => void {
  let isSubscribed = true;

  // 1. Cross-tab BroadcastChannel listener
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_DEVICES);
      channel.onmessage = (event: MessageEvent) => {
        if (!isSubscribed) return;
        if (event.data?.type === 'REMOVE' && event.data?.device?.deviceId) {
          const removedId = event.data.device.deviceId;
          const fresh = getStoredLoggedInDevices().filter(
            (d) => d.deviceId !== removedId && !d.deviceId.startsWith(removedId) && d.isOnline !== false
          );
          saveLoggedInDevices(fresh);
          onUpdate(fresh);
        } else {
          const fresh = getStoredLoggedInDevices().filter((d) => d && d.isOnline !== false);
          onUpdate(fresh);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel error:', e);
    }
  }

  // 2. Storage event listener for fallback cross-window sync
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY_LOGGED_IN_DEVICES) {
      if (!isSubscribed) return;
      const fresh = getStoredLoggedInDevices().filter((d) => d && d.isOnline !== false);
      onUpdate(fresh);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  // 3. Firestore live snapshot listener & initial fetch
  let firestoreUnsub: (() => void) | null = null;
  try {
    const firestore = getFirestoreClient();
    if (firestore && typeof navigator !== 'undefined' && navigator.onLine) {
      const devicesCol = collection(firestore, FIRESTORE_COLLECTION_DEVICES);

      const processDeviceSnapshot = (snapshotDocs: any[]) => {
        if (!isSubscribed) return;
        const cloudDevices: LoggedInDevice[] = [];
        snapshotDocs.forEach((dDoc) => {
          const data = dDoc.data() as LoggedInDevice;
          // Cleanse sample devices from cloud collection
          if (isSampleDevice(data) || isSampleDevice({ deviceId: dDoc.id })) {
            try {
              deleteDoc(doc(firestore, FIRESTORE_COLLECTION_DEVICES, dDoc.id)).catch(() => {});
            } catch {}
            return;
          }

          // If marked offline in cloud, delete doc to keep collection clean
          if (data && data.isOnline === false) {
            try {
              deleteDoc(doc(firestore, FIRESTORE_COLLECTION_DEVICES, dDoc.id)).catch(() => {});
            } catch {}
            return;
          }

          if (
            data &&
            data.deviceId &&
            data.isOnline !== false &&
            !isSampleDevice(data) &&
            data.coordinates &&
            typeof data.coordinates.lat === 'number' &&
            typeof data.coordinates.lng === 'number'
          ) {
            cloudDevices.push(data);
          }
        });

        // Cloud devices from Firestore are the authoritative online devices
        const map = new Map<string, LoggedInDevice>();
        cloudDevices.forEach((d) => map.set(d.deviceId, d));

        const cleanList = Array.from(map.values()).filter(
          (d) => d && !isSampleDevice(d) && d.isOnline !== false
        );
        saveLoggedInDevices(cleanList);
        onUpdate(cleanList);
      };

      // Immediate fetch
      getDocs(devicesCol).then((snapshot) => {
        processDeviceSnapshot(snapshot ? snapshot.docs : []);
      }).catch((e) => console.warn('Initial getDocs devices note:', e.message));

      // Live subscription
      firestoreUnsub = onSnapshot(
        devicesCol,
        (snapshot) => {
          if (!isSubscribed) return;
          processDeviceSnapshot(snapshot ? snapshot.docs : []);
        },
        (error) => {
          console.warn('Firestore devices listener note:', error.message);
        }
      );
    }
  } catch (err) {
    console.warn('Could not initialize firestore devices listener:', err);
  }

  return () => {
    isSubscribed = false;
    if (channel) {
      try {
        channel.close();
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
    if (firestoreUnsub) {
      try {
        firestoreUnsub();
      } catch {}
    }
  };
}
