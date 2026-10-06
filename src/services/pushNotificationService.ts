import { UserProfile } from '../types';
import { getOrCreateDeviceId } from './deviceTrackingService';

export interface PushStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  endpoint?: string;
  error?: string;
}

const STORAGE_KEY_PUSH_ENABLED = 'dira_push_notifications_enabled';
const PUSH_LISTENERS: Set<(status: PushStatus) => void> = new Set();

let currentStatus: PushStatus = {
  isSupported: false,
  permission: 'default',
  isSubscribed: false,
};

function notifyListeners() {
  PUSH_LISTENERS.forEach(fn => fn(currentStatus));
}

/**
 * Standard utility to convert URL-safe base64 string to Uint8Array for pushManager
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Query current push notification readiness on phone/browser
 */
export async function checkPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined') {
    currentStatus = { isSupported: false, permission: 'default', isSubscribed: false };
    return currentStatus;
  }

  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const permission = 'Notification' in window ? Notification.permission : 'default';

  if (!isSupported) {
    currentStatus = { isSupported: false, permission, isSubscribed: false };
    notifyListeners();
    return currentStatus;
  }

  try {
    const reg = await getActiveRegistration();
    if (!reg) {
      currentStatus = { isSupported: true, permission, isSubscribed: false };
      notifyListeners();
      return currentStatus;
    }

    const sub = await reg.pushManager.getSubscription();
    const isSubscribed = Boolean(sub);

    currentStatus = {
      isSupported: true,
      permission,
      isSubscribed,
      endpoint: sub?.endpoint,
    };
    notifyListeners();
    return currentStatus;
  } catch (err: any) {
    currentStatus = {
      isSupported: true,
      permission,
      isSubscribed: false,
      error: err?.message || 'Error checking subscription',
    };
    notifyListeners();
    return currentStatus;
  }
}

/**
 * Get active service worker registration or register standard fallback
 */
async function getActiveRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      // Register root service worker
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('Service worker registration lookup note:', err);
    return null;
  }
}

/**
 * Fetch VAPID public key from backend server
 */
export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid-public-key');
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey || null;
  } catch (e) {
    console.warn('Failed to fetch VAPID key:', e);
    return null;
  }
}

/**
 * Enable background push notifications on phone or desktop browser.
 * Prompts user for system notification permission if not yet granted.
 */
export async function subscribeToPushNotifications(currentUser?: UserProfile | null): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') return { success: false, error: 'Window not available' };

  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
    return { success: false, error: 'Push notifications are not supported on this browser or platform.' };
  }

  try {
    // 1. Request permission if needed
    let permission = Notification.permission;
    if (permission !== 'granted') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      currentStatus = { ...currentStatus, permission, isSubscribed: false };
      notifyListeners();
      return { success: false, error: 'Notification permission was denied. Please allow notifications in phone settings.' };
    }

    // 2. Obtain VAPID public key
    const publicKey = await getVapidPublicKey();
    if (!publicKey) {
      return { success: false, error: 'Server push notification key is unavailable.' };
    }

    // 3. Register service worker and wait for ready
    const reg = await getActiveRegistration();
    if (!reg) {
      return { success: false, error: 'Could not initialize service worker for background alerts.' };
    }

    // 4. Subscribe with PushManager
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    // 5. Send subscription to server with user metadata
    const deviceId = getOrCreateDeviceId();
    const payload = {
      subscription: sub.toJSON(),
      userId: currentUser?.id || (currentUser?.phone ? `phone-${currentUser.phone}` : `guest-${deviceId}`),
      userName: currentUser?.name || 'DIRA User',
      userRole: currentUser?.role || 'primary_user',
      userPhone: currentUser?.phone || '',
      deviceId,
      userAgent: navigator.userAgent,
    };

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { success: false, error: errJson.error || 'Failed to register subscription with server.' };
    }

    localStorage.setItem(STORAGE_KEY_PUSH_ENABLED, 'true');

    currentStatus = {
      isSupported: true,
      permission: 'granted',
      isSubscribed: true,
      endpoint: sub.endpoint,
    };
    notifyListeners();

    return { success: true };
  } catch (err: any) {
    console.error('Push subscription failed:', err);
    currentStatus = {
      isSupported: true,
      permission: Notification.permission,
      isSubscribed: false,
      error: err?.message || 'Unknown error occurred during push setup',
    };
    notifyListeners();
    return { success: false, error: err?.message || 'Failed to setup push notifications' };
  }
}

/**
 * Disable background push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<{ success: boolean; error?: string }> {
  try {
    const reg = await getActiveRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
      }
    }

    localStorage.removeItem(STORAGE_KEY_PUSH_ENABLED);

    currentStatus = {
      isSupported: true,
      permission: Notification.permission,
      isSubscribed: false,
    };
    notifyListeners();

    return { success: true };
  } catch (err: any) {
    console.error('Failed to unsubscribe:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Dispatch a live test push notification to this phone/browser.
 * The user can minimize or close the app and see the phone ring/alert!
 */
export async function sendTestPushNotification(type: 'call' | 'chat' = 'call'): Promise<{ success: boolean; error?: string }> {
  try {
    const status = await checkPushStatus();
    if (!status.isSubscribed || !status.endpoint) {
      return { success: false, error: 'Push notifications are not active on this device. Please enable them first.' };
    }

    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: status.endpoint,
        type,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'Server failed to send test notification.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error triggering test' };
  }
}

/**
 * Subscribe to push status changes in UI components
 */
export function onPushStatusChange(listener: (status: PushStatus) => void): () => void {
  PUSH_LISTENERS.add(listener);
  listener(currentStatus);
  return () => {
    PUSH_LISTENERS.delete(listener);
  };
}

/**
 * Auto-sync push subscription on app boot or login if previously enabled
 */
export async function autoSyncPushSubscription(currentUser?: UserProfile | null): Promise<void> {
  if (typeof window === 'undefined') return;

  const wasEnabled = localStorage.getItem(STORAGE_KEY_PUSH_ENABLED) === 'true';
  const hasPermission = 'Notification' in window && Notification.permission === 'granted';

  if (wasEnabled || hasPermission) {
    try {
      await subscribeToPushNotifications(currentUser);
    } catch (e) {
      console.warn('Auto-sync push subscription note:', e);
    }
  } else {
    checkPushStatus();
  }
}
