import { DonkeyCase, InAppNotification, UserProfile, DiraMessage } from '../types';

const STORAGE_KEY_NOTIFICATIONS = 'kaa_rada_notifications_v1';
const BROADCAST_CHANNEL_NAME = 'dira_case_notifications_v1';
const STORAGE_SYNC_KEY = 'kaa_rada_sync_event_v1';

/**
 * Web Audio API notification chime generator (short alert for cases)
 */
export function playNotificationChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: High crisp initial beep (E5 - 659.25Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.26);

    // Tone 2: Harmonious higher chime (A5 - 880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.56);
  } catch {
    // Gracefully ignore if audio context blocked
  }
}

/**
 * Friendly, pleasant chat bubble chime for newly broadcast chat messages
 */
export function playChatBroadcastChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Pleasant bubble pop tone 1 (G5 - 784Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(783.99, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.16, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    // Harmonic follow-up tone 2 (C6 - 1046.5Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.5, now + 0.08);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.2, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.38);
  } catch {
    // Gracefully ignore if audio context blocked
  }
}

/**
 * Display browser system notification for incoming chat broadcast
 */
export function showSystemChatNotification(message: DiraMessage): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const channelNames: Record<string, string> = {
      general: 'Wanajamii Alerts',
      cases: 'Case Discussions',
      rescue: 'Search & Rescue',
      officers: 'Officers Desk',
    };
    const channelLabel = channelNames[message.channelId] || `#${message.channelId}`;
    const preview = message.content.length > 80 ? `${message.content.slice(0, 80)}...` : message.content;

    new Notification(`DIRA Chat: ${message.senderName} (${channelLabel})`, {
      body: preview || 'Sent an attachment or voice note.',
      icon: '/favicon.ico',
      tag: `dira-chat-${message.id}`,
    });
  } catch {
    // Ignore notification errors
  }
}

// Full phone ringtone for incoming incident reports
// Synthesizes a loud, recognizable emergency phone ring sequence (2 cycles of classic dual-frequency warble + siren)
let activeRingAudioContext: AudioContext | null = null;
let activeRingTimeout: any = null;

export function playIncidentPhoneRing(durationMs = 6000): () => void {
  // Stop any currently playing ring
  stopIncidentPhoneRing();

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return () => {};

    const ctx = new AudioContextClass();
    activeRingAudioContext = ctx;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.35, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Ring Cycle function: produces a European / Dispatch style dual ring: Ring-Ring... Pause... Ring-Ring
    const scheduleRingPulse = (startTime: number, freq1: number, freq2: number, pulseDuration: number) => {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const pulseGain = ctx.createGain();

      oscA.type = 'sawtooth';
      oscB.type = 'sine';
      oscA.frequency.setValueAtTime(freq1, startTime);
      oscB.frequency.setValueAtTime(freq2, startTime);

      // Attack & decay envelope
      pulseGain.gain.setValueAtTime(0, startTime);
      pulseGain.gain.linearRampToValueAtTime(0.4, startTime + 0.04);
      pulseGain.gain.setValueAtTime(0.4, startTime + pulseDuration - 0.04);
      pulseGain.gain.exponentialRampToValueAtTime(0.001, startTime + pulseDuration);

      oscA.connect(pulseGain);
      oscB.connect(pulseGain);
      pulseGain.connect(masterGain);

      oscA.start(startTime);
      oscB.start(startTime);
      oscA.stop(startTime + pulseDuration + 0.05);
      oscB.stop(startTime + pulseDuration + 0.05);
    };

    const t = ctx.currentTime + 0.05;

    // Cycle 1: Dual pulses
    scheduleRingPulse(t, 853, 960, 0.45);        // Pulse 1
    scheduleRingPulse(t + 0.55, 853, 960, 0.45); // Pulse 2

    // Urgent rising siren alert
    const sirenOsc = ctx.createOscillator();
    const sirenGain = ctx.createGain();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.setValueAtTime(600, t + 1.2);
    sirenOsc.frequency.exponentialRampToValueAtTime(1400, t + 1.8);
    sirenGain.gain.setValueAtTime(0, t + 1.2);
    sirenGain.gain.linearRampToValueAtTime(0.3, t + 1.25);
    sirenGain.gain.exponentialRampToValueAtTime(0.001, t + 1.85);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(masterGain);
    sirenOsc.start(t + 1.2);
    sirenOsc.stop(t + 1.9);

    // Cycle 2 (Repeat dual pulses at t + 2.2s)
    scheduleRingPulse(t + 2.2, 853, 960, 0.45);
    scheduleRingPulse(t + 2.75, 853, 960, 0.45);

    // Cycle 3 (Final high chime at t + 3.4s)
    scheduleRingPulse(t + 3.4, 960, 1200, 0.55);

    // Trigger long phone vibration
    triggerIncidentPhoneVibration();

    // Auto-stop after duration
    activeRingTimeout = setTimeout(() => {
      stopIncidentPhoneRing();
    }, durationMs);

    return stopIncidentPhoneRing;
  } catch (err) {
    console.warn('Could not trigger incident phone ring:', err);
    return () => {};
  }
}

// Stop current ringing
export function stopIncidentPhoneRing(): void {
  if (activeRingTimeout) {
    clearTimeout(activeRingTimeout);
    activeRingTimeout = null;
  }
  if (activeRingAudioContext) {
    try {
      activeRingAudioContext.close().catch(() => {});
    } catch {
      // Ignore
    }
    activeRingAudioContext = null;
  }
}

// In-app chat message received pop sound
export function playMessagePopSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch {
    // Ignore
  }
}

// Trigger realistic phone vibration on mobile devices (Ring pattern: buzz-buzz-pause-buzz-buzz)
export function triggerIncidentPhoneVibration(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([400, 150, 400, 300, 800, 300, 800]);
    }
  } catch {
    // Ignore unsupported devices
  }
}

// Trigger haptic vibration on mobile devices (short)
export function triggerHapticAlert(pattern: number | number[] = [120, 80, 180]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported devices
  }
}

// Request Browser System Notification Permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return 'denied';
  }
}

// Show native device notification for reported incident
export function showSystemIncidentNotification(caseItem: DonkeyCase): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const categoryLabels: Record<string, string> = {
      donkey_theft: '🚨 DONKEY THEFT',
      trafficking: '🚚 ILLEGAL TRAFFICKING',
      bush_slaughter: '⚠️ BUSH SLAUGHTER',
      general_abuse: '💔 DONKEY ABUSE',
      other: '🚨 INCIDENT REPORT',
    };

    const title = `${categoryLabels[caseItem.category] || '🚨 DIRA INCIDENT'} - ${caseItem.location?.village || 'Kitui'}`;
    const body = `${caseItem.title}\n📍 ${caseItem.location?.subCounty || 'Kitui'} • ${caseItem.donkeysCount || 1} Donkey(s) • Urgency: ${caseItem.urgency?.toUpperCase() || 'HIGH'}`;

    const options: NotificationOptions = {
      body,
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      tag: `dira-case-${caseItem.id}`,
      vibrate: [400, 150, 400, 300, 800],
      requireInteraction: true,
    } as any;

    new Notification(title, options);
  } catch (err) {
    console.warn('Failed to show system notification:', err);
  }
}

// Read saved notifications from localStorage
export function getSavedNotifications(): InAppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading notifications:', err);
  }
  return [];
}

// Persist notifications list to localStorage
export function saveNotifications(notifications: InAppNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(notifications.slice(0, 50)));
  } catch (err) {
    console.error('Error saving notifications:', err);
  }
}

// Format a DonkeyCase into an InAppNotification
export function createNotificationFromCase(
  caseItem: DonkeyCase,
  currentUser: UserProfile | null
): InAppNotification {
  const isMine = Boolean(
    currentUser?.id &&
    (caseItem.reporterUserId === currentUser.id ||
      caseItem.reporter?.id === currentUser.id ||
      (currentUser.phone && caseItem.reporter?.phone === currentUser.phone))
  );

  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    caseId: caseItem.id,
    trackingCode: caseItem.trackingCode,
    category: caseItem.category,
    urgency: caseItem.urgency,
    title: caseItem.title,
    village: caseItem.location?.village || 'Kitui Village',
    subCounty: caseItem.location?.subCounty || 'Kitui Central',
    donkeysCount: caseItem.donkeysCount || 1,
    reportedAt: caseItem.reportedAt || new Date().toISOString(),
    isRead: false,
    reporterName: caseItem.reporter?.name || (caseItem.reporter?.isAnonymous ? 'Anonymous' : 'Community Reporter'),
    reportedByCurrentUser: isMine,
  };
}

// Cross-tab broadcast listener setup
export interface BroadcastCasePayload {
  type: 'CASE_REPORTED';
  caseItem: DonkeyCase;
  reportedByUserId?: string;
  timestamp: number;
}

// Broadcast new case to all other open tabs/windows
export function broadcastCaseReported(caseItem: DonkeyCase, reportedByUserId?: string): void {
  const payload: BroadcastCasePayload = {
    type: 'CASE_REPORTED',
    caseItem,
    reportedByUserId,
    timestamp: Date.now(),
  };

  // 1. Try BroadcastChannel API
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage(payload);
      setTimeout(() => channel.close(), 1000);
    } catch (err) {
      console.warn('BroadcastChannel error:', err);
    }
  }

  // 2. Storage event fallback for cross-tab sync
  try {
    localStorage.setItem(
      STORAGE_SYNC_KEY,
      JSON.stringify({ ...payload, _random: Math.random() })
    );
  } catch {
    // Ignore storage quota errors
  }
}

// Subscribe to cross-tab case notifications
export function subscribeToCaseBroadcasts(
  onCaseReported: (caseItem: DonkeyCase, reportedByUserId?: string) => void
): () => void {
  let channel: BroadcastChannel | null = null;

  // 1. BroadcastChannel listener
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<BroadcastCasePayload>) => {
        if (event.data && event.data.type === 'CASE_REPORTED' && event.data.caseItem) {
          onCaseReported(event.data.caseItem, event.data.reportedByUserId);
        }
      };
    } catch (err) {
      console.warn('Failed to initialize BroadcastChannel listener:', err);
    }
  }

  // 2. Storage event listener fallback
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === STORAGE_SYNC_KEY && event.newValue) {
      try {
        const data = JSON.parse(event.newValue) as BroadcastCasePayload;
        if (data && data.type === 'CASE_REPORTED' && data.caseItem) {
          onCaseReported(data.caseItem, data.reportedByUserId);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  };

  window.addEventListener('storage', handleStorageEvent);

  // Return cleanup function
  return () => {
    if (channel) {
      channel.close();
    }
    window.removeEventListener('storage', handleStorageEvent);
  };
}
