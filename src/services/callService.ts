import { ActiveCallSession, CallParticipant, CallSignalMessage, CallType, UserRole } from '../types';
import { getFirestoreClient } from './db';
import { getOrCreateDeviceId } from './deviceTrackingService';
import { collection, doc, setDoc, onSnapshot, updateDoc, deleteDoc, Unsubscribe } from 'firebase/firestore';

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

const CALL_BROADCAST_CHANNEL = 'dira_calls_broadcast_v1';

// ---------------------------------------------------------------------------
// AUDIO SYNTHESIZER (Web Audio API for Ringtones)
// ---------------------------------------------------------------------------
// Phone number normalizer for matching across Kenyan formats (+254, 07xx, 2547xx)
export function normalizePhoneNumber(phone?: string): string {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
}

// Persistent guest identity across views and reloads
export function getGuestSenderId(): string {
  if (typeof window !== 'undefined') {
    let gid = localStorage.getItem('dira_guest_sender_id');
    if (!gid) {
      gid = `guest-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem('dira_guest_sender_id', gid);
    }
    return gid;
  }
  return 'guest-user';
}

// Show browser/OS level push banner when app is in background
export function showSystemCallNotification(call: ActiveCallSession): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      const isVideo = call.callType === 'video';
      const title = call.isGroup
        ? `📞 DIRA Group ${isVideo ? 'Video' : 'Voice'} Call: #${call.channelName || 'general'}`
        : `📞 Incoming ${isVideo ? 'Video' : 'Voice'} Call: ${call.initiator.name}`;
      const body = call.isGroup
        ? `Started by ${call.initiator.name}. Tap to join now.`
        : `${call.initiator.role ? call.initiator.role.replace('_', ' ') : 'Community Member'} is calling you. Tap to answer.`;

      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: `call-${call.callId}`,
        requireInteraction: true,
        silent: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {}
  }
}

class CallAudioRinger {
  private ctx: AudioContext | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: any = null;
  private vibrateInterval: any = null;
  private isPlaying = false;
  private fallbackAudio: HTMLAudioElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('click', unlockAudio);
      window.addEventListener('touchstart', unlockAudio);
      window.addEventListener('pointerdown', unlockAudio);
      window.addEventListener('keydown', unlockAudio);
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private ensureRingGain(ctx: AudioContext): GainNode {
    if (!this.ringGain) {
      this.ringGain = ctx.createGain();
      this.ringGain.connect(ctx.destination);
    }
    this.ringGain.gain.cancelScheduledValues(0);
    this.ringGain.gain.setValueAtTime(1.0, ctx.currentTime);
    return this.ringGain;
  }

  // Play outgoing ringing tone (dual frequency 440Hz + 480Hz) - rings continuously until answered
  playOutgoingRing() {
    this.stop();
    this.isPlaying = true;

    const ctx = this.getContext();
    if (!ctx) return;
    const ringMaster = this.ensureRingGain(ctx);

    const playBurst = () => {
      if (!this.isPlaying) return;
      try {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.value = 440;
        osc2.frequency.value = 480;

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
        gain.gain.setValueAtTime(0.2, now + 1.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ringMaster);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.85);
        osc2.stop(now + 1.85);
      } catch (e) {
        console.warn('Outgoing ringtone burst note:', e);
      }
    };

    playBurst();
    this.ringInterval = setInterval(playBurst, 3200);
  }

  // Play melodic incoming call chime with phone vibration - rings continuously until answered
  playIncomingRing() {
    this.stop();
    this.isPlaying = true;

    // Trigger physical phone vibration on mobile devices (repeats continuously while ringing)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([400, 200, 400, 200, 600, 300, 600]);
        this.vibrateInterval = setInterval(() => {
          if (!this.isPlaying) {
            clearInterval(this.vibrateInterval);
            return;
          }
          navigator.vibrate([400, 200, 400, 200, 600, 300, 600]);
        }, 2800);
      } catch {}
    }

    const ctx = this.getContext();
    if (!ctx) return;
    const ringMaster = this.ensureRingGain(ctx);

    const playMelody = () => {
      if (!this.isPlaying) return;
      try {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        // Loud, penetrating dual-tone phone chime
        const now = ctx.currentTime;
        const chords = [
          { f1: 523.25, f2: 659.25, t: 0, d: 0.22 },     // C5 + E5
          { f1: 659.25, f2: 783.99, t: 0.24, d: 0.22 },  // E5 + G5
          { f1: 783.99, f2: 1046.5, t: 0.48, d: 0.35 },  // G5 + C6
          { f1: 1046.5, f2: 1318.5, t: 0.9, d: 0.45 },   // C6 + E6
        ];

        chords.forEach(({ f1, f2, t, d }) => {
          const startTime = now + t;
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'sine';
          osc2.type = 'triangle';
          osc1.frequency.value = f1;
          osc2.frequency.value = f2;

          gain.gain.setValueAtTime(0.001, startTime);
          gain.gain.linearRampToValueAtTime(0.35, startTime + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + d);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ringMaster);

          osc1.start(startTime);
          osc2.start(startTime);
          osc1.stop(startTime + d + 0.02);
          osc2.stop(startTime + d + 0.02);
        });
      } catch (e) {
        console.warn('Incoming ringtone error:', e);
      }
    };

    playMelody();
    this.ringInterval = setInterval(playMelody, 2000);
  }

  // Play call end / hangup chime
  playHangupChime() {
    this.stop();
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.3);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.33);
    } catch {}
  }

  isRinging(): boolean {
    return this.isPlaying;
  }

  stop() {
    this.isPlaying = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (this.vibrateInterval) {
      clearInterval(this.vibrateInterval);
      this.vibrateInterval = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
    // Hard instant zero-latency mute on any in-flight Web Audio ringing tones
    if (this.ctx && this.ringGain) {
      try {
        this.ringGain.gain.cancelScheduledValues(0);
        this.ringGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {}
    }
  }
}

export const callRinger = new CallAudioRinger();

// ---------------------------------------------------------------------------
// CALL SERVICE CLIENT
// ---------------------------------------------------------------------------
class CallService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private activeCall: ActiveCallSession | null = null;
  private incomingCall: ActiveCallSession | null = null;
  private currentUserId: string = '';
  private currentUserPhone: string = '';
  private currentUserName: string = '';
  private currentUserRole: string = '';
  private broadcastChannel: BroadcastChannel | null = null;
  private facingMode: 'user' | 'environment' = 'user';
  private screenStream: MediaStream | null = null;
  private isScreenSharing = false;
  private savedCameraTrack: MediaStreamTrack | null = null;
  private eventSource: EventSource | null = null;
  private sseRetryTimeout: any = null;
  private callPingInterval: any = null;
  private firestoreCallsUnsub: Unsubscribe | null = null;
  private fallbackPollingInterval: any = null;

  // Listeners
  private onCallStateListeners: Set<(call: ActiveCallSession | null) => void> = new Set();
  private onIncomingCallListeners: Set<(call: ActiveCallSession | null) => void> = new Set();
  private onRemoteStreamsUpdatedListeners: Set<(streams: Map<string, MediaStream>) => void> = new Set();
  private onLocalStreamUpdatedListeners: Set<(stream: MediaStream | null) => void> = new Set();
  private onActiveCallsListListeners: Set<(calls: ActiveCallSession[]) => void> = new Set();
  private onCallEndedListeners: Set<(data: { callId: string; reason?: string; duration?: string; title?: string }) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const storedUser = localStorage.getItem('kaa_rada_current_user_v2') || localStorage.getItem('dira_current_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed?.id) this.currentUserId = parsed.id;
          if (parsed?.name) this.currentUserName = parsed.name;
          if (parsed?.phone) this.currentUserPhone = parsed.phone;
          if (parsed?.role) this.currentUserRole = parsed.role;
        }
      } catch {}

      if (!this.currentUserId) {
        this.currentUserId = getGuestSenderId();
        this.currentUserName = localStorage.getItem('dira_guest_name') || 'Community Member';
      }

      try {
        this.broadcastChannel = new BroadcastChannel(CALL_BROADCAST_CHANNEL);
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingSignal(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel not available:', e);
      }

      // Connect to global SSE stream to receive real-time call invites & signals
      this.initSSEListener();

      // Connect to Firestore real-time calls collection for instant cross-device sync
      this.initFirestoreCallsListener();

      // Poll active calls every 2.5 seconds as a bulletproof fallback for background tabs or proxy delays
      this.fallbackPollingInterval = setInterval(() => {
        this.syncActiveCallsFallback();
      }, 2500);
    }
  }

  // Real-time Cloud Firestore listener for all active calls
  public initFirestoreCallsListener() {
    if (typeof window === 'undefined') return;
    if (this.firestoreCallsUnsub) return;

    try {
      const db = getFirestoreClient();
      if (!db) return;

      const callsCol = collection(db, 'dira_calls');
      this.firestoreCallsUnsub = onSnapshot(callsCol, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const call = change.doc.data() as ActiveCallSession;
          if (!call || !call.callId) return;

          if (change.type === 'added' || change.type === 'modified') {
            if (call.status === 'calling' || call.status === 'ringing') {
              this.handleCallInvite(call);
            } else if (call.status === 'connected') {
              callRinger.stop();
              this.handleCallUpdated(call);
            } else if (call.status === 'ended' || call.status === 'rejected') {
              this.handleCallEnded(call.callId, call.status);
            }
          } else if (change.type === 'removed') {
            this.handleCallEnded(change.doc.id, 'ended');
          }
        });

        // Broadcast active calls list
        const activeList = snapshot.docs
          .map((d) => d.data() as ActiveCallSession)
          .filter((c) => c && c.status !== 'ended' && c.status !== 'rejected');
        this.notifyActiveCallsList(activeList);
      }, (err) => {
        console.warn('[CallService] Firestore calls sync note:', err.message);
      });
    } catch (e) {
      console.warn('[CallService] Firestore calls init error:', e);
    }
  }

  // Fallback poller to guarantee calls are noticed even if SSE is buffered or mobile webview paused
  private async syncActiveCallsFallback() {
    try {
      const calls = await this.fetchActiveCalls();
      if (Array.isArray(calls)) {
        this.notifyActiveCallsList(calls);
        calls.forEach((call) => {
          if (call.status === 'calling' || call.status === 'ringing') {
            this.handleCallInvite(call);
          } else if (call.status === 'connected' && this.activeCall && this.activeCall.callId === call.callId) {
            callRinger.stop();
            this.handleCallUpdated(call);
          }
        });

        // If incoming call was answered elsewhere or ended, stop ringing immediately
        if (this.incomingCall) {
          const matchingCall = calls.find((c) => c.callId === this.incomingCall?.callId);
          if (matchingCall && (matchingCall.status === 'ended' || matchingCall.status === 'rejected')) {
            callRinger.stop();
            this.notifyIncomingCall(null);
          } else if (matchingCall && !matchingCall.isGroup && matchingCall.status === 'connected') {
            callRinger.stop();
            this.notifyIncomingCall(null);
          } else if (!matchingCall && calls.length > 0) {
            this.notifyIncomingCall(null);
            callRinger.stop();
          }
        }

        // If our outgoing active call has connected or has remote participants, ensure ringing stops
        if (this.activeCall) {
          const matchingActive = calls.find((c) => c.callId === this.activeCall?.callId);
          if (matchingActive) {
            const hasJoinedRemote = matchingActive.participants && matchingActive.participants.some(p => p.id !== this.currentUserId);
            if (matchingActive.status === 'connected' || hasJoinedRemote) {
              callRinger.stop();
              this.handleCallUpdated(matchingActive);
            }
          }
        }
      }
    } catch {}
  }

  // Unified helper to check if this user or device is the intended target of a call
  private isTargetForMe(targetUserId?: string, targetPhone?: string, targetName?: string, targetDeviceId?: string): boolean {
    if (!targetUserId && !targetPhone && !targetName && !targetDeviceId) return true;

    const myDeviceId = getOrCreateDeviceId();
    if (targetDeviceId && (targetDeviceId === myDeviceId || targetDeviceId.startsWith(myDeviceId) || myDeviceId.startsWith(targetDeviceId))) {
      return true;
    }

    const myId = (this.currentUserId || '').trim();
    const myPhone = normalizePhoneNumber(this.currentUserPhone);
    const myName = (this.currentUserName || '').toLowerCase().trim();

    const tId = (targetUserId || '').trim();
    const tPhone = normalizePhoneNumber(targetPhone);
    const tName = (targetName || '').toLowerCase().trim();

    // Broadcast or all targets
    if (tId === 'all' || tId === 'broadcast' || tId === 'anyone' || tId === '*') return true;

    // Direct hardware device ID match
    if (tId && (tId === myDeviceId || tId.startsWith(myDeviceId) || myDeviceId.startsWith(tId))) return true;

    // 1. Exact ID match
    if (myId && tId && myId === tId) return true;

    // 2. Exact phone match (clean phone digits)
    if (myPhone && tPhone && myPhone === tPhone) return true;

    // 3. String contains match (handles phone-0712345678 vs 0712345678, etc.)
    if (myPhone && tId && (tId.includes(myPhone) || myPhone.includes(tId))) return true;
    if (tPhone && myId && (myId.includes(tPhone) || tPhone.includes(myId))) return true;

    // 4. Raw phone match if not empty (e.g. 'admin')
    if (this.currentUserPhone && targetPhone && this.currentUserPhone.toLowerCase() === targetPhone.toLowerCase()) return true;

    // 5. Name match fallback
    if (myName && tName && myName.length > 2 && (myName.includes(tName) || tName.includes(myName))) return true;

    return false;
  }

  public initSSEListener() {
    if (typeof window === 'undefined') return;

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }

    const effectiveId = encodeURIComponent(this.currentUserId || '');
    const effectiveName = encodeURIComponent(this.currentUserName || '');
    const effectivePhone = encodeURIComponent(this.currentUserPhone || '');
    const effectiveRole = encodeURIComponent(this.currentUserRole || '');
    const url = `/api/chat/stream?userId=${effectiveId}&userName=${effectiveName}&userPhone=${effectivePhone}&userRole=${effectiveRole}`;

    try {
      const es = new EventSource(url);
      this.eventSource = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (!data) return;

          if (data.type === 'CONNECTED') {
            // Check if there are active calls in progress or ringing
            if (Array.isArray(data.activeCalls)) {
              this.notifyActiveCallsList(data.activeCalls);
              data.activeCalls.forEach((call: ActiveCallSession) => {
                if (call.status === 'calling' || call.status === 'ringing') {
                  this.handleCallInvite(call);
                }
              });
            }
          } else if (data.type === 'CALL_INVITE' && data.call) {
            this.handleCallInvite(data.call);
          } else if (data.type === 'CALL_PARTICIPANT_JOINED' && data.call) {
            this.handleCallUpdated(data.call);
          } else if (data.type === 'CALL_PARTICIPANT_LEFT' && data.callId) {
            this.handleParticipantLeft(data.callId, data.participantId);
          } else if (data.type === 'CALL_UPDATED' && data.call) {
            this.handleCallUpdated(data.call);
          } else if (data.type === 'CALL_ENDED' && data.callId) {
            this.handleCallEnded(data.callId, data.reason, data.duration);
          } else if (data.type === 'CALL_SIGNAL' && data.signal) {
            this.handleIncomingSignal(data.signal);
          }
        } catch {}
      };

      es.onerror = () => {
        try {
          es.close();
        } catch {}
        this.eventSource = null;
        if (this.sseRetryTimeout) clearTimeout(this.sseRetryTimeout);
        this.sseRetryTimeout = setTimeout(() => this.initSSEListener(), 3000);
      };
    } catch (e) {
      console.warn('Failed to connect to SSE stream:', e);
    }
  }

  setCurrentUser(userId: string, name?: string, role?: string, phone?: string) {
    const changed = this.currentUserId !== userId || this.currentUserPhone !== (phone || '');
    this.currentUserId = userId;
    this.currentUserPhone = phone || '';
    this.currentUserName = name || '';
    this.currentUserRole = role || '';

    // Heartbeat presence to server
    if (userId && typeof window !== 'undefined') {
      fetch('/api/presence/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name, role, phone }),
      }).catch(() => {});
    }

    if (changed) {
      this.initSSEListener();
      this.syncActiveCallsFallback();
    }
  }

  getCurrentUserId() {
    return this.currentUserId;
  }

  getCurrentUserPhone() {
    return this.currentUserPhone;
  }

  getActiveCall(): ActiveCallSession | null {
    return this.activeCall;
  }

  getIncomingCall(): ActiveCallSession | null {
    return this.incomingCall;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStreams(): Map<string, MediaStream> {
    return new Map(this.remoteStreams);
  }

  // Subscribe to call state changes
  onCallState(cb: (call: ActiveCallSession | null) => void): () => void {
    this.onCallStateListeners.add(cb);
    cb(this.activeCall);
    return () => this.onCallStateListeners.delete(cb);
  }

  onCallStateChanged(cb: (call: ActiveCallSession | null) => void): () => void {
    return this.onCallState(cb);
  }

  // Subscribe to incoming call rings
  onIncomingCall(cb: (call: ActiveCallSession | null) => void): () => void {
    this.onIncomingCallListeners.add(cb);
    if (this.incomingCall) cb(this.incomingCall);
    return () => this.onIncomingCallListeners.delete(cb);
  }

  // Notify incoming call banner
  private notifyIncomingCall(call: ActiveCallSession | null) {
    this.incomingCall = call;
    this.onIncomingCallListeners.forEach(cb => cb(call));
  }

  // Subscribe to remote streams update
  onRemoteStreamsUpdated(cb: (streams: Map<string, MediaStream>) => void): () => void {
    this.onRemoteStreamsUpdatedListeners.add(cb);
    cb(new Map(this.remoteStreams));
    return () => this.onRemoteStreamsUpdatedListeners.delete(cb);
  }

  // Subscribe to local media stream update
  onLocalStreamUpdated(cb: (stream: MediaStream | null) => void): () => void {
    this.onLocalStreamUpdatedListeners.add(cb);
    cb(this.localStream);
    return () => this.onLocalStreamUpdatedListeners.delete(cb);
  }

  private notifyLocalStream() {
    this.onLocalStreamUpdatedListeners.forEach(cb => cb(this.localStream));
  }

  // Subscribe to active channel calls
  onActiveCallsList(cb: (calls: ActiveCallSession[]) => void): () => void {
    this.onActiveCallsListListeners.add(cb);
    this.fetchActiveCalls().then(cb).catch(() => {});
    return () => this.onActiveCallsListListeners.delete(cb);
  }

  // Subscribe to call ended events across the app
  onCallEnded(cb: (data: { callId: string; reason?: string; duration?: string; title?: string }) => void): () => void {
    this.onCallEndedListeners.add(cb);
    return () => this.onCallEndedListeners.delete(cb);
  }

  private notifyActiveCallsList(calls: ActiveCallSession[]) {
    this.onActiveCallsListListeners.forEach(cb => cb(calls));
  }

  private notifyCallState() {
    const snapshot = this.activeCall ? {
      ...this.activeCall,
      participants: this.activeCall.participants.map(p => ({ ...p })),
    } : null;
    this.onCallStateListeners.forEach(cb => cb(snapshot));
  }

  public stopRinging() {
    callRinger.stop();
  }

  private notifyRemoteStreams() {
    if (this.remoteStreams.size > 0) {
      callRinger.stop();
      if (this.activeCall && this.activeCall.status !== 'connected') {
        this.activeCall.status = 'connected';
        if (!this.activeCall.connectedAt) {
          this.activeCall.connectedAt = new Date().toISOString();
        }
        this.notifyCallState();
      }
    }
    const copy = new Map(this.remoteStreams);
    this.onRemoteStreamsUpdatedListeners.forEach(cb => cb(copy));
  }

  // ---------------------------------------------------------------------------
  // MEDIA DEVICE CAPTURE
  // ---------------------------------------------------------------------------
  async acquireMediaStream(callType: CallType): Promise<MediaStream> {
    if (this.localStream) {
      const hasAudio = this.localStream.getAudioTracks().some(t => t.readyState === 'live');
      const hasVideo = this.localStream.getVideoTracks().some(t => t.readyState === 'live');

      if (hasAudio && (callType === 'audio' || hasVideo)) {
        return this.localStream;
      }
      // If missing video when requested or tracks stopped, cleanly release old tracks
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: callType === 'video'
          ? {
              facingMode: this.facingMode,
            }
          : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;
      return stream;
    } catch (err: any) {
      console.warn('[CallService] Camera/mic access error, trying resilient fallback:', err);
      // Fallback 1: basic audio & video without constraints
      if (callType === 'video') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          this.localStream = stream;
          return stream;
        } catch {}
      }

      // Fallback 2: audio only
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.localStream = audioOnly;
        return audioOnly;
      } catch (audioErr) {
        console.warn('[CallService] Audio access fallback error:', audioErr);
      }

      // Fallback 3: resilient dummy silent media stream
      const dummyStream = this.createSilentStream();
      this.localStream = dummyStream;
      return dummyStream;
    }
  }

  // Create fallback silent audio stream if hardware permissions are denied
  private createSilentStream(): MediaStream {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        return dst.stream;
      }
    } catch {}
    return new MediaStream();
  }

  // Toggle Mute Audio
  toggleAudio(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const isMuted = !audioTrack.enabled;
      if (this.activeCall) {
        const me = this.activeCall.participants.find(p => p.id === this.currentUserId);
        if (me) me.isMuted = isMuted;
        this.notifyCallState();
        this.sendSignal({
          type: 'CALL_PARTICIPANT_UPDATE',
          callId: this.activeCall.callId,
          callType: this.activeCall.callType,
          isGroup: this.activeCall.isGroup,
          caller: this.activeCall.initiator,
          participant: { ...me, id: this.currentUserId, name: me?.name || 'User', isMuted },
          timestamp: new Date().toISOString(),
        });
      }
      return audioTrack.enabled;
    }
    return false;
  }

  // Toggle Video Camera On / Off
  async toggleVideo(): Promise<boolean> {
    if (!this.localStream) {
      this.localStream = await this.acquireMediaStream('video');
    }
    let videoTrack = this.localStream.getVideoTracks().find(t => t.readyState === 'live');

    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const isVideoOff = !videoTrack.enabled;
      if (this.activeCall) {
        const me = this.activeCall.participants.find(p => p.id === this.currentUserId);
        if (me) me.isVideoOff = isVideoOff;
        if (!isVideoOff) {
          this.activeCall.callType = 'video';
        }
        this.notifyCallState();
        this.sendSignal({
          type: 'CALL_PARTICIPANT_UPDATE',
          callId: this.activeCall.callId,
          callType: this.activeCall.callType,
          isGroup: this.activeCall.isGroup,
          caller: this.activeCall.initiator,
          participant: { ...me, id: this.currentUserId, name: me?.name || 'User', isVideoOff },
          timestamp: new Date().toISOString(),
        });
      }
      this.notifyLocalStream();
      return videoTrack.enabled;
    } else {
      // Add video track if not present
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.facingMode },
        });
        const newTrack = videoStream.getVideoTracks()[0];
        if (newTrack) {
          this.localStream.addTrack(newTrack);
          this.notifyLocalStream();

          if (this.activeCall) {
            this.activeCall.callType = 'video';
            const me = this.activeCall.participants.find(p => p.id === this.currentUserId);
            if (me) me.isVideoOff = false;
            this.notifyCallState();
          }

          // Add or replace track in all peer connections and trigger WebRTC renegotiation
          for (const [peerId, pc] of this.peerConnections.entries()) {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
              await sender.replaceTrack(newTrack);
            } else {
              pc.addTrack(newTrack, this.localStream!);
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.sendSignal({
                  type: 'CALL_OFFER',
                  callId: this.activeCall?.callId || '',
                  callType: 'video',
                  isGroup: Boolean(this.activeCall?.isGroup),
                  caller: { id: this.currentUserId, name: this.currentUserName || 'User' },
                  targetUserId: peerId,
                  sdp: offer,
                  timestamp: new Date().toISOString(),
                });
              } catch (renegErr) {
                console.warn('Renegotiation error on video add:', renegErr);
              }
            }
          }

          this.sendSignal({
            type: 'CALL_PARTICIPANT_UPDATE',
            callId: this.activeCall?.callId || '',
            callType: 'video',
            isGroup: Boolean(this.activeCall?.isGroup),
            caller: this.activeCall?.initiator || { id: this.currentUserId, name: 'User' },
            participant: { id: this.currentUserId, name: this.currentUserName || 'User', isVideoOff: false },
            timestamp: new Date().toISOString(),
          });

          return true;
        }
      } catch (e) {
        console.warn('Could not add camera track:', e);
      }
    }
    return false;
  }

  // Flip Camera (Front / Rear)
  async flipCamera(): Promise<void> {
    if (!this.localStream) return;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';

    const oldVideo = this.localStream.getVideoTracks()[0];
    if (oldVideo) {
      oldVideo.stop();
      this.localStream.removeTrack(oldVideo);
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode },
      });
      const newVideo = newStream.getVideoTracks()[0];
      if (newVideo) {
        this.localStream.addTrack(newVideo);
        // Replace track in peer connections
        this.peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideo);
          } else {
            pc.addTrack(newVideo, this.localStream!);
          }
        });
        this.notifyCallState();
      }
    } catch (e) {
      console.warn('Flip camera error:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // SCREEN SHARING CONTROLS
  // ---------------------------------------------------------------------------
  getIsScreenSharing(): boolean {
    return this.isScreenSharing;
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  async startScreenShare(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      console.warn('[CallService] Screen sharing is not supported in this browser environment.');
      return false;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        } as any,
        audio: false,
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return false;

      // Save active camera track so we can seamlessly restore it when screen share stops
      if (this.localStream) {
        const activeCamera = this.localStream.getVideoTracks().find(t => t.readyState === 'live');
        if (activeCamera) {
          this.savedCameraTrack = activeCamera;
          this.localStream.removeTrack(activeCamera);
        }
        this.localStream.addTrack(screenTrack);
      } else {
        this.localStream = new MediaStream([screenTrack]);
      }

      this.notifyLocalStream();
      this.screenStream = displayStream;
      this.isScreenSharing = true;

      // Replace video track on all peer connections
      for (const [peerId, pc] of this.peerConnections.entries()) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, this.localStream!);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignal({
              type: 'CALL_OFFER',
              callId: this.activeCall?.callId || '',
              callType: 'video',
              isGroup: Boolean(this.activeCall?.isGroup),
              caller: { id: this.currentUserId, name: this.currentUserName || 'User' },
              targetUserId: peerId,
              sdp: offer,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {
            console.warn('[CallService] Renegotiation error on screen share start:', e);
          }
        }
      }

      // Automatically handle when user clicks native "Stop sharing" chrome banner
      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      if (this.activeCall) {
        this.activeCall.callType = 'video';
        const me = this.activeCall.participants.find(p => p.id === this.currentUserId);
        if (me) {
          me.isScreenSharing = true;
          me.isVideoOff = false;
        }
        this.notifyCallState();
        this.sendSignal({
          type: 'CALL_PARTICIPANT_UPDATE',
          callId: this.activeCall.callId,
          callType: 'video',
          isGroup: this.activeCall.isGroup,
          caller: this.activeCall.initiator,
          participant: { ...me, id: this.currentUserId, name: me?.name || 'User', isScreenSharing: true, isVideoOff: false },
          timestamp: new Date().toISOString(),
        });
      }

      return true;
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        console.warn('[CallService] Screen share error:', err);
      }
      return false;
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.isScreenSharing) return;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    this.isScreenSharing = false;

    // Restore camera track if previously active
    const restoredTrack = this.savedCameraTrack && this.savedCameraTrack.readyState === 'live'
      ? this.savedCameraTrack
      : null;

    if (this.localStream) {
      // Remove any stopped screen tracks
      this.localStream.getVideoTracks().forEach(t => {
        if (t !== restoredTrack) {
          this.localStream!.removeTrack(t);
        }
      });

      if (restoredTrack && !this.localStream.getVideoTracks().includes(restoredTrack)) {
        this.localStream.addTrack(restoredTrack);
      }
    }

    // Replace track back on peer connections
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(restoredTrack);
      }
    }

    this.savedCameraTrack = null;
    this.notifyLocalStream();

    if (this.activeCall) {
      const me = this.activeCall.participants.find(p => p.id === this.currentUserId);
      if (me) {
        me.isScreenSharing = false;
        me.isVideoOff = !restoredTrack || !restoredTrack.enabled;
      }
      this.notifyCallState();
      this.sendSignal({
        type: 'CALL_PARTICIPANT_UPDATE',
        callId: this.activeCall.callId,
        callType: this.activeCall.callType,
        isGroup: this.activeCall.isGroup,
        caller: this.activeCall.initiator,
        participant: { ...me, id: this.currentUserId, name: me?.name || 'User', isScreenSharing: false, isVideoOff: !restoredTrack || !restoredTrack.enabled },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async toggleScreenShare(): Promise<boolean> {
    if (this.isScreenSharing) {
      await this.stopScreenShare();
      return false;
    } else {
      return await this.startScreenShare();
    }
  }

  // Helper to ensure local audio and video (or screen share) tracks are attached to all senders
  private attachLocalTracksToPeer(pc: RTCPeerConnection) {
    const audioTrack = this.localStream?.getAudioTracks().find(t => t.readyState === 'live');
    const screenTrack = this.isScreenSharing && this.screenStream ? this.screenStream.getVideoTracks().find(t => t.readyState === 'live') : null;
    const cameraTrack = this.localStream?.getVideoTracks().find(t => t.readyState === 'live');
    const activeVideoTrack = screenTrack || cameraTrack || null;

    const senders = pc.getSenders();

    // 1. Audio sender
    const audioSender = senders.find(s => s.track?.kind === 'audio' || (s as any).kind === 'audio');
    if (audioSender) {
      if (audioTrack && audioSender.track !== audioTrack) {
        audioSender.replaceTrack(audioTrack).catch(() => {});
      }
    } else if (audioTrack) {
      try {
        pc.addTrack(audioTrack, this.localStream!);
      } catch {}
    }

    // 2. Video sender (camera or screen share)
    const videoSender = senders.find(s => s.track?.kind === 'video' || (s as any).kind === 'video' || ((s as any).transport && (!s.track || s.track.kind === 'video')));
    if (videoSender) {
      if (videoSender.track !== activeVideoTrack) {
        videoSender.replaceTrack(activeVideoTrack).catch(() => {});
      }
    } else if (activeVideoTrack) {
      try {
        pc.addTrack(activeVideoTrack, this.localStream!);
      } catch {}
    }
  }

  // ---------------------------------------------------------------------------
  // WEBRTC PEER CONNECTION HELPERS
  // ---------------------------------------------------------------------------
  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    let pc = this.peerConnections.get(peerId);
    if (pc) {
      this.attachLocalTracksToPeer(pc);
      return pc;
    }

    pc = new RTCPeerConnection(STUN_CONFIG);

    // Pre-allocate transceivers for bidirectional audio & video to reserve SDP m-lines
    try {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
    } catch (e) {
      console.warn('[CallService] addTransceiver note:', e);
    }

    // Attach active local audio & video/screen tracks
    this.attachLocalTracksToPeer(pc);

    // Handle remote tracks (audio & video combined)
    pc.ontrack = (event) => {
      let remoteStream = this.remoteStreams.get(peerId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
      }
      // Replace existing track of same kind so new track takes effect
      const existingTracks = remoteStream.getTracks().filter(t => t.kind === event.track.kind);
      existingTracks.forEach(t => remoteStream!.removeTrack(t));
      remoteStream.addTrack(event.track);

      // Create a fresh MediaStream instance with tracks so React components detect change
      const freshStreamInstance = new MediaStream(remoteStream.getTracks());
      this.remoteStreams.set(peerId, freshStreamInstance);
      this.notifyRemoteStreams();

      event.track.onended = () => {
        this.notifyRemoteStreams();
      };
      event.track.onmute = () => {
        this.notifyRemoteStreams();
      };
      event.track.onunmute = () => {
        this.notifyRemoteStreams();
      };
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.activeCall) {
        this.sendSignal({
          type: 'CALL_CANDIDATE',
          callId: this.activeCall.callId,
          channelId: this.activeCall.channelId,
          callType: this.activeCall.callType,
          isGroup: this.activeCall.isGroup,
          caller: {
            id: this.currentUserId,
            name: this.currentUserName || 'User',
            role: this.currentUserRole as UserRole,
            phone: this.currentUserPhone,
          },
          targetUserId: peerId,
          candidate: event.candidate,
          timestamp: new Date().toISOString(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc?.iceConnectionState === 'failed') {
        try {
          (pc as any).restartIce?.();
        } catch {}
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === 'connected' && this.activeCall) {
        this.activeCall.status = 'connected';
        if (!this.activeCall.connectedAt) {
          this.activeCall.connectedAt = new Date().toISOString();
        }
        callRinger.stop();
        this.notifyCallState();
      }
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  // ---------------------------------------------------------------------------
  // CALL ACTIONS
  // ---------------------------------------------------------------------------

  // Start a Call (Group or Direct 1-on-1)
  async startCall(params: {
    channelId?: string;
    channelName?: string;
    callType: CallType;
    isGroup: boolean;
    initiator: { id: string; name: string; role?: UserRole; phone?: string; subCounty?: string };
    targetUser?: { id: string; name: string; role?: UserRole; phone?: string };
    targetDeviceId?: string;
    targetDeviceName?: string;
  }): Promise<ActiveCallSession> {
    this.currentUserId = params.initiator.id;

    // Check if initiating a group call and one is ALREADY ongoing in this channel
    if (params.isGroup && params.channelId) {
      try {
        const activeList = await this.fetchActiveCalls(params.channelId);
        const existing = activeList.find(c => c.isGroup && c.channelId === params.channelId && c.status !== 'ended' && c.status !== 'rejected');
        if (existing) {
          console.log(`[CallService] Group call already ongoing in #${params.channelName || params.channelId}. Joining ongoing call instead.`);
          await this.joinGroupCall(existing);
          return existing;
        }
      } catch (checkErr) {
        console.warn('[CallService] Group call pre-check note:', checkErr);
      }
    }

    // Capture user media
    await this.acquireMediaStream(params.callType);

    const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const myDeviceId = getOrCreateDeviceId();

    const session: ActiveCallSession = {
      callId,
      channelId: params.channelId,
      channelName: params.channelName,
      callType: params.callType,
      isGroup: params.isGroup,
      initiator: params.initiator,
      initiatorDeviceId: myDeviceId,
      targetDeviceId: params.targetDeviceId,
      targetDeviceName: params.targetDeviceName,
      targetUser: params.targetUser,
      participants: [{
        id: params.initiator.id,
        name: params.initiator.name,
        role: params.initiator.role,
        phone: params.initiator.phone,
        subCounty: params.initiator.subCounty,
        joinedAt: now,
        isLocal: true,
        isMuted: false,
        isVideoOff: params.callType === 'audio',
      }],
      status: 'calling',
      startedAt: now,
      connectedAt: undefined,
    };

    this.activeCall = session;
    this.notifyCallState();

    // Play outgoing ring continuously for all calls (both direct and group) until someone answers!
    callRinger.playOutgoingRing();

    // Ping server regularly while call is alive
    if (this.callPingInterval) clearInterval(this.callPingInterval);
    this.callPingInterval = setInterval(() => {
      if (this.activeCall) {
        fetch('/api/calls/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId, participantId: this.currentUserId }),
        }).catch(() => {});
      } else {
        clearInterval(this.callPingInterval);
        this.callPingInterval = null;
      }
    }, 12000);

    // Save to Cloud Firestore for instant cross-device and cross-network delivery
    try {
      const db = getFirestoreClient();
      if (db) {
        setDoc(doc(db, 'dira_calls', callId), session).catch((err) => {
          console.warn('[CallService] Firestore call doc save note:', err);
        });
      }
    } catch {}

    // Inform server of new call
    try {
      const resp = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });

      if (resp.status === 409) {
        const conflictData = await resp.json().catch(() => ({}));
        if (conflictData.call) {
          console.log('[CallService] Server returned 409 GROUP_CALL_ALREADY_ACTIVE. Joining existing active call.');
          await this.joinGroupCall(conflictData.call);
          return conflictData.call;
        }
      }
    } catch (err) {
      console.warn('Call initiate server notify failed:', err);
    }

    // Broadcast on local channel for instant multi-tab sync
    this.broadcastSignal({
      type: 'CALL_INVITE',
      callId,
      channelId: params.channelId,
      callType: params.callType,
      isGroup: params.isGroup,
      caller: params.initiator,
      targetUserId: params.targetUser?.id,
      targetPhone: params.targetUser?.phone,
      call: session,
      timestamp: now,
    });

    return session;
  }

  // Answer an incoming call
  async answerCall(call: ActiveCallSession, callTypeOverride?: CallType) {
    callRinger.stop();
    this.notifyIncomingCall(null);
    const type = callTypeOverride || call.callType;
    await this.acquireMediaStream(type);

    call.status = 'connected';
    call.connectedAt = new Date().toISOString();

    const meParticipant: CallParticipant = {
      id: this.currentUserId,
      name: this.currentUserName || localStorage.getItem('dira_guest_name') || 'Community Member',
      role: this.currentUserRole as UserRole,
      phone: this.currentUserPhone,
      joinedAt: new Date().toISOString(),
      isLocal: true,
      isMuted: false,
      isVideoOff: type === 'audio',
    };

    const existingMe = call.participants.find(p => p.id === this.currentUserId);
    if (!existingMe) {
      call.participants.push(meParticipant);
    }

    this.activeCall = call;
    this.notifyCallState();

    // Start periodic call ping
    if (this.callPingInterval) clearInterval(this.callPingInterval);
    this.callPingInterval = setInterval(() => {
      if (this.activeCall) {
        fetch('/api/calls/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: call.callId, participantId: this.currentUserId }),
        }).catch(() => {});
      } else {
        clearInterval(this.callPingInterval);
        this.callPingInterval = null;
      }
    }, 12000);

    // Update call status in Cloud Firestore
    try {
      const db = getFirestoreClient();
      if (db) {
        updateDoc(doc(db, 'dira_calls', call.callId), {
          status: 'connected',
          connectedAt: new Date().toISOString(),
          participants: call.participants,
        }).catch(() => {});
      }
    } catch {}

    // Notify server
    try {
      await fetch('/api/calls/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: call.callId,
          participant: meParticipant,
        }),
      });
    } catch {}

    // Send accept signal
    this.sendSignal({
      type: 'CALL_ACCEPT',
      callId: call.callId,
      channelId: call.channelId,
      callType: type,
      isGroup: call.isGroup,
      caller: {
        id: this.currentUserId,
        name: this.currentUserName || 'User',
        role: this.currentUserRole as UserRole,
        phone: this.currentUserPhone,
      },
      targetUserId: call.initiator.id,
      participant: meParticipant,
      timestamp: new Date().toISOString(),
    });
  }

  // Reject an incoming call
  rejectCall(callId: string) {
    callRinger.stop();
    callRinger.playHangupChime();
    this.notifyIncomingCall(null);

    // Update in Cloud Firestore
    try {
      const db = getFirestoreClient();
      if (db) {
        updateDoc(doc(db, 'dira_calls', callId), {
          status: 'rejected',
          endedAt: new Date().toISOString(),
        }).then(() => {
          setTimeout(() => {
            deleteDoc(doc(db, 'dira_calls', callId)).catch(() => {});
          }, 4000);
        }).catch(() => {});
      }
    } catch {}

    fetch('/api/calls/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, reason: 'rejected' }),
    }).catch(() => {});

    this.sendSignal({
      type: 'CALL_REJECT',
      callId,
      callType: 'audio',
      isGroup: false,
      caller: { id: this.currentUserId, name: this.currentUserName || 'User' },
      timestamp: new Date().toISOString(),
    });

    if (this.activeCall?.callId === callId) {
      this.cleanupCallState();
    }
  }

  // Hang up / End active call
  endCall() {
    callRinger.stop();
    callRinger.playHangupChime();
    this.notifyIncomingCall(null);

    if (!this.activeCall) return;
    const callId = this.activeCall.callId;

    let durStr = '00:00';
    if (this.activeCall.connectedAt) {
      const diff = Math.floor((Date.now() - new Date(this.activeCall.connectedAt).getTime()) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    this.activeCall.status = 'ended';
    this.activeCall.endedAt = new Date().toISOString();
    this.activeCall.endedReason = 'You ended the call';
    this.activeCall.endedDuration = durStr;
    this.notifyCallState();

    // Update in Cloud Firestore
    try {
      const db = getFirestoreClient();
      if (db) {
        updateDoc(doc(db, 'dira_calls', callId), {
          status: 'ended',
          endedAt: new Date().toISOString(),
        }).then(() => {
          setTimeout(() => {
            deleteDoc(doc(db, 'dira_calls', callId)).catch(() => {});
          }, 4000);
        }).catch(() => {});
      }
    } catch {}

    fetch('/api/calls/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, participantId: this.currentUserId }),
    }).catch(() => {});

    this.sendSignal({
      type: 'CALL_END',
      callId,
      channelId: this.activeCall.channelId,
      callType: this.activeCall.callType,
      isGroup: this.activeCall.isGroup,
      caller: this.activeCall.initiator,
      timestamp: new Date().toISOString(),
    });

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;
    this.savedCameraTrack = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.notifyRemoteStreams();

    setTimeout(() => {
      if (this.activeCall && this.activeCall.callId === callId) {
        this.cleanupCallState();
      }
    }, 3500);
  }

  // Join an ongoing group call
  async joinGroupCall(call: ActiveCallSession) {
    callRinger.stop();
    this.notifyIncomingCall(null);
    await this.acquireMediaStream(call.callType);

    const meParticipant: CallParticipant = {
      id: this.currentUserId,
      name: this.currentUserName || localStorage.getItem('dira_guest_name') || 'Community Member',
      role: this.currentUserRole as UserRole,
      phone: this.currentUserPhone,
      joinedAt: new Date().toISOString(),
      isLocal: true,
      isMuted: false,
      isVideoOff: call.callType === 'audio',
    };

    if (!call.participants.some(p => p.id === this.currentUserId)) {
      call.participants.push(meParticipant);
    }
    call.status = 'connected';
    this.activeCall = call;
    this.notifyCallState();

    // Start periodic call ping
    if (this.callPingInterval) clearInterval(this.callPingInterval);
    this.callPingInterval = setInterval(() => {
      if (this.activeCall) {
        fetch('/api/calls/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: call.callId, participantId: this.currentUserId }),
        }).catch(() => {});
      } else {
        clearInterval(this.callPingInterval);
        this.callPingInterval = null;
      }
    }, 12000);

    // Register with server
    try {
      await fetch('/api/calls/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.callId, participant: meParticipant }),
      });
    } catch {}

    // Send Join signal to other participants to trigger WebRTC mesh
    this.sendSignal({
      type: 'CALL_JOIN',
      callId: call.callId,
      channelId: call.channelId,
      callType: call.callType,
      isGroup: true,
      caller: {
        id: this.currentUserId,
        name: this.currentUserName || 'User',
        role: this.currentUserRole as UserRole,
        phone: this.currentUserPhone,
      },
      participant: meParticipant,
      timestamp: new Date().toISOString(),
    });

    // Existing participants will send offers upon receiving CALL_JOIN.
    // Fallback: If any peer connection remains uninitiated after 2000ms, send a targeted offer
    setTimeout(() => {
      if (!this.activeCall || this.activeCall.callId !== call.callId) return;
      call.participants.forEach(async (participant) => {
        if (participant.id !== this.currentUserId) {
          const pc = this.peerConnections.get(participant.id);
          if (!pc || (pc.signalingState === 'stable' && pc.connectionState !== 'connected')) {
            const conn = this.getOrCreatePeerConnection(participant.id);
            if (conn.signalingState === 'stable') {
              try {
                const offer = await conn.createOffer();
                await conn.setLocalDescription(offer);
                this.sendSignal({
                  type: 'CALL_OFFER',
                  callId: call.callId,
                  callType: call.callType,
                  isGroup: true,
                  caller: { id: this.currentUserId, name: meParticipant.name },
                  targetUserId: participant.id,
                  sdp: offer,
                  timestamp: new Date().toISOString(),
                });
              } catch (e) {
                console.warn('Mesh fallback offer error:', e);
              }
            }
          }
        }
      });
    }, 2000);
  }

  // Join or answer a call by its callId (used when waking up app from push notification)
  async joinOrAnswerCallById(callId: string): Promise<boolean> {
    try {
      const res = await fetch('/api/calls/active');
      if (res.ok) {
        const data = await res.json();
        const call = (data.calls || []).find((c: ActiveCallSession) => c.callId === callId);
        if (call && call.status !== 'ended' && call.status !== 'rejected') {
          if (call.isGroup) {
            await this.joinGroupCall(call);
          } else {
            await this.answerCall(call);
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('[CallService] joinOrAnswerCallById error:', e);
    }
    return false;
  }

  private cleanupCallState() {
    if (this.callPingInterval) {
      clearInterval(this.callPingInterval);
      this.callPingInterval = null;
    }

    // Stop screen sharing if active
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;
    this.savedCameraTrack = null;

    // Stop local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();

    this.activeCall = null;
    this.notifyCallState();
    this.notifyRemoteStreams();
  }

  // ---------------------------------------------------------------------------
  // SIGNALING DISPATCH & HANDLERS
  // ---------------------------------------------------------------------------
  private sendSignal(signal: CallSignalMessage) {
    // 1. Post to Server
    fetch('/api/calls/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    }).catch(() => {});

    // 2. Broadcast on Local Channel for multi-tab
    this.broadcastSignal(signal);
  }

  private broadcastSignal(signal: any) {
    try {
      this.broadcastChannel?.postMessage(signal);
    } catch {}
  }

  private handleCallInvite(call: ActiveCallSession) {
    if (!call || !call.callId) return;
    if (call.status === 'ended' || call.status === 'rejected') return;

    // If we are already connected to or ringing for this exact call, ignore
    if (this.activeCall && this.activeCall.callId === call.callId) return;
    if (this.incomingCall && this.incomingCall.callId === call.callId) return;

    // Only skip ringing if THIS EXACT HARDWARE/BROWSER DEVICE placed the call
    const myDeviceId = getOrCreateDeviceId();
    if (call.initiatorDeviceId && (call.initiatorDeviceId === myDeviceId || call.initiatorDeviceId.startsWith(myDeviceId) || myDeviceId.startsWith(call.initiatorDeviceId))) {
      return;
    }

    // Direct 1-on-1 call (targeted by user profile or specific device ID)
    if (!call.isGroup && (call.targetUser || call.targetDeviceId)) {
      const isTarget = this.isTargetForMe(
        call.targetUser?.id,
        call.targetUser?.phone,
        call.targetUser?.name,
        call.targetDeviceId
      );
      if (isTarget) {
        console.log('[CallService] Ringing for 1-on-1 call:', call.callId, 'from:', call.initiator.name);
        callRinger.playIncomingRing();
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate([400, 200, 400, 200, 400]); } catch {}
        }
        showSystemCallNotification(call);
        this.notifyIncomingCall(call);
      }
    }
    // Group call in channel or broadcast
    else if (call.isGroup) {
      console.log('[CallService] Ringing for group call:', call.callId, 'in #', call.channelName);
      callRinger.playIncomingRing();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([400, 200, 400, 200, 400]); } catch {}
      }
      showSystemCallNotification(call);
      this.notifyIncomingCall(call);
    }
  }

  private handleCallUpdated(call: ActiveCallSession) {
    if (!call || !call.callId) return;

    // Outgoing call: stop ringing when remote participant joins or connects
    if (this.activeCall && this.activeCall.callId === call.callId) {
      const hasRemoteParticipant = call.participants && call.participants.some(p => p.id !== this.currentUserId);
      if (call.status === 'connected' || hasRemoteParticipant) {
        callRinger.stop();
      }
    }

    // Incoming call: stop ringing if ended or rejected; for 1-on-1 if answered elsewhere
    if (this.incomingCall && this.incomingCall.callId === call.callId) {
      if (call.status === 'ended' || call.status === 'rejected') {
        callRinger.stop();
        this.notifyIncomingCall(null);
      } else if (!call.isGroup && call.status === 'connected') {
        callRinger.stop();
        this.notifyIncomingCall(null);
      }
    }

    if (this.activeCall && this.activeCall.callId === call.callId) {
      this.activeCall = {
        ...call,
        participants: call.participants.map(p => ({
          ...p,
          isLocal: p.id === this.currentUserId,
        })),
      };
      this.notifyCallState();
    }
  }

  private handleParticipantLeft(callId: string, participantId: string) {
    if (this.activeCall && this.activeCall.callId === callId) {
      this.activeCall.participants = this.activeCall.participants.filter(p => p.id !== participantId);
      this.peerConnections.get(participantId)?.close();
      this.peerConnections.delete(participantId);
      this.remoteStreams.delete(participantId);
      this.notifyCallState();
      this.notifyRemoteStreams();
    }
  }

  private handleCallEnded(callId: string, reason?: string, duration?: string) {
    let callTitle = 'Call';
    let durStr = duration;

    if (this.incomingCall && this.incomingCall.callId === callId) {
      callTitle = this.incomingCall.isGroup
        ? `#${this.incomingCall.channelName || this.incomingCall.channelId || 'channel'} Group Call`
        : `Call from ${this.incomingCall.initiator.name}`;
      callRinger.stop();
      this.notifyIncomingCall(null);
    }

    if (this.activeCall && this.activeCall.callId === callId) {
      callTitle = this.activeCall.isGroup
        ? `#${this.activeCall.channelName || this.activeCall.channelId || 'channel'} Group Call`
        : (this.activeCall.targetUser?.name ? `Call with ${this.activeCall.targetUser.name}` : `Call with ${this.activeCall.initiator.name}`);
      callRinger.stop();
      callRinger.playHangupChime();

      if (!durStr && this.activeCall.connectedAt) {
        const diff = Math.floor((Date.now() - new Date(this.activeCall.connectedAt).getTime()) / 1000);
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }

      this.activeCall.status = 'ended';
      this.activeCall.endedAt = new Date().toISOString();
      this.activeCall.endedReason = reason || 'Call completed';
      this.activeCall.endedDuration = durStr || '00:00';
      this.notifyCallState();

      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
      }
      this.isScreenSharing = false;
      this.savedCameraTrack = null;

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }

      this.peerConnections.forEach(pc => pc.close());
      this.peerConnections.clear();
      this.remoteStreams.clear();
      this.notifyRemoteStreams();

      setTimeout(() => {
        if (this.activeCall && this.activeCall.callId === callId) {
          this.cleanupCallState();
        }
      }, 3500);
    }

    // Always inform subscribers that the call has ended
    this.onCallEndedListeners.forEach(cb => {
      try {
        cb({
          callId,
          reason: reason || 'Call ended',
          duration: durStr || '00:00',
          title: callTitle,
        });
      } catch (err) {
        console.warn('onCallEnded listener error:', err);
      }
    });
  }

  private async handleIncomingSignal(signal: CallSignalMessage) {
    if (!signal) return;
    if (this.currentUserId && signal.caller?.id === this.currentUserId) return;

    switch (signal.type) {
      case 'CALL_INVITE': {
        const isTarget = this.isTargetForMe(signal.targetUserId, (signal as any).targetPhone, (signal as any).targetName);
        if (isTarget || signal.isGroup) {
          if ((signal as any).call) {
            this.handleCallInvite((signal as any).call);
          } else {
            callRinger.playIncomingRing();
          }
        }
        break;
      }

      case 'CALL_ACCEPT':
        callRinger.stop();
        if (this.incomingCall && this.incomingCall.callId === signal.callId) {
          this.notifyIncomingCall(null);
        }
        if (this.activeCall && this.activeCall.callId === signal.callId) {
          this.activeCall.status = 'connected';
          if (!this.activeCall.connectedAt) {
            this.activeCall.connectedAt = new Date().toISOString();
          }
          if (signal.participant && !this.activeCall.participants.some(p => p.id === signal.participant!.id)) {
            this.activeCall.participants.push(signal.participant);
          }
          this.notifyCallState();

          // Callee has answered and acquired media: now initiator creates offer
          const peerId = signal.participant?.id || signal.caller?.id || this.activeCall.targetUser?.id;
          if (peerId) {
            const pc = this.getOrCreatePeerConnection(peerId);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              this.sendSignal({
                type: 'CALL_OFFER',
                callId: signal.callId,
                callType: this.activeCall.callType,
                isGroup: Boolean(this.activeCall.isGroup),
                caller: { id: this.currentUserId, name: this.currentUserName || 'User' },
                targetUserId: peerId,
                sdp: offer,
                timestamp: new Date().toISOString(),
              });
            } catch (e) {
              console.warn('[CallService] WebRTC offer creation on accept error:', e);
            }
          }
        }
        break;

      case 'CALL_JOIN': {
        callRinger.stop();
        if (this.incomingCall && this.incomingCall.callId === signal.callId) {
          this.notifyIncomingCall(null);
        }
        if (this.activeCall && this.activeCall.callId === signal.callId) {
          this.activeCall.status = 'connected';
          if (!this.activeCall.connectedAt) {
            this.activeCall.connectedAt = new Date().toISOString();
          }
          if (signal.participant && !this.activeCall.participants.some(p => p.id === signal.participant!.id)) {
            this.activeCall.participants.push(signal.participant);
          }
          this.notifyCallState();

          const joinerId = signal.participant?.id || signal.caller?.id;
          if (joinerId && joinerId !== this.currentUserId) {
            const pc = this.getOrCreatePeerConnection(joinerId);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              this.sendSignal({
                type: 'CALL_OFFER',
                callId: signal.callId,
                callType: this.activeCall.callType,
                isGroup: true,
                caller: { id: this.currentUserId, name: this.currentUserName || 'User' },
                targetUserId: joinerId,
                sdp: offer,
                timestamp: new Date().toISOString(),
              });
            } catch (e) {
              console.warn('[CallService] WebRTC offer on CALL_JOIN error:', e);
            }
          }
        }
        break;
      }

      case 'CALL_REJECT':
      case 'CALL_END':
        if (this.incomingCall && this.incomingCall.callId === signal.callId) {
          callRinger.stop();
          this.notifyIncomingCall(null);
        }
        if (this.activeCall && this.activeCall.callId === signal.callId) {
          this.handleCallEnded(
            signal.callId, 
            signal.type === 'CALL_REJECT' ? 'Call declined' : 'Call ended by remote participant'
          );
        }
        break;

      case 'CALL_OFFER': {
        callRinger.stop();
        const isOfferTarget = this.isTargetForMe(signal.targetUserId, (signal as any).targetPhone, (signal as any).targetName);
        const shouldProcessOffer = signal.targetUserId ? isOfferTarget : (signal.isGroup || isOfferTarget);
        if (shouldProcessOffer) {
          if (!this.localStream) {
            await this.acquireMediaStream(signal.callType || 'video');
          }
          const pc = this.getOrCreatePeerConnection(signal.caller.id);

          const isOfferCollision = pc.signalingState !== 'stable';
          if (isOfferCollision) {
            const isPolite = this.currentUserId.localeCompare(signal.caller.id) < 0;
            if (!isPolite) {
              console.log('[CallService] Impolite peer ignoring colliding offer from', signal.caller.id);
              return;
            }
            try {
              await pc.setLocalDescription({ type: 'rollback' } as any);
            } catch {}
          }

          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            // Drain buffered ICE candidates
            const queued = this.pendingIceCandidates.get(signal.caller.id);
            if (queued && queued.length > 0) {
              for (const cand of queued) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
              }
              this.pendingIceCandidates.delete(signal.caller.id);
            }

            this.attachLocalTracksToPeer(pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.sendSignal({
              type: 'CALL_ANSWER',
              callId: signal.callId,
              callType: signal.callType,
              isGroup: signal.isGroup,
              caller: { id: this.currentUserId, name: this.currentUserName || 'User' },
              targetUserId: signal.caller.id,
              sdp: answer,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {
            console.warn('[CallService] Handle offer error:', e);
          }
        }
        break;
      }

      case 'CALL_ANSWER': {
        callRinger.stop();
        if (this.incomingCall && this.incomingCall.callId === signal.callId) {
          this.notifyIncomingCall(null);
        }
        if (this.activeCall && this.activeCall.callId === signal.callId) {
          this.activeCall.status = 'connected';
          if (!this.activeCall.connectedAt) {
            this.activeCall.connectedAt = new Date().toISOString();
          }
          this.notifyCallState();
        }
        const isAnswerTarget = this.isTargetForMe(signal.targetUserId, (signal as any).targetPhone, (signal as any).targetName);
        const shouldProcessAnswer = signal.targetUserId ? isAnswerTarget : (signal.isGroup || isAnswerTarget);
        if (shouldProcessAnswer) {
          const pc = this.peerConnections.get(signal.caller.id);
          if (pc) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              // Drain buffered ICE candidates
              const queued = this.pendingIceCandidates.get(signal.caller.id);
              if (queued && queued.length > 0) {
                for (const cand of queued) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch {}
                }
                this.pendingIceCandidates.delete(signal.caller.id);
              }
            } catch (e) {
              console.warn('[CallService] Handle answer error:', e);
            }
          }
        }
        break;
      }

      case 'CALL_CANDIDATE': {
        const isCandidateTarget = this.isTargetForMe(signal.targetUserId, (signal as any).targetPhone, (signal as any).targetName);
        const shouldProcessCandidate = signal.targetUserId ? isCandidateTarget : (signal.isGroup || isCandidateTarget);
        if (shouldProcessCandidate) {
          const pc = this.peerConnections.get(signal.caller.id);
          if (signal.candidate) {
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              } catch (e) {
                console.warn('[CallService] Add ICE candidate error:', e);
              }
            } else {
              // Buffer until setRemoteDescription is complete
              const q = this.pendingIceCandidates.get(signal.caller.id) || [];
              q.push(signal.candidate);
              this.pendingIceCandidates.set(signal.caller.id, q);
            }
          }
        }
        break;
      }

      case 'CALL_PARTICIPANT_UPDATE':
        if (this.activeCall && this.activeCall.callId === signal.callId && signal.participant) {
          const pId = signal.participant.id;
          const pPhone = signal.participant.phone;
          const idx = this.activeCall.participants.findIndex(p => p.id === pId || (pPhone && p.phone === pPhone));
          if (idx >= 0) {
            this.activeCall.participants[idx] = {
              ...this.activeCall.participants[idx],
              ...signal.participant,
              isLocal: signal.participant.id === this.currentUserId,
            };
          } else {
            this.activeCall.participants.push({
              ...signal.participant,
              isLocal: signal.participant.id === this.currentUserId,
            });
          }
          if (signal.participant.isScreenSharing) {
            this.activeCall.callType = 'video';
          }
          this.notifyCallState();
        }
        break;
    }
  }

  // Fetch list of active calls from server
  async fetchActiveCalls(channelId?: string): Promise<ActiveCallSession[]> {
    try {
      const url = channelId ? `/api/calls/active?channelId=${encodeURIComponent(channelId)}` : '/api/calls/active';
      const res = await fetch(url);
      const data = await res.json();
      return data.calls || [];
    } catch {
      return [];
    }
  }

  // Fetch online users from presence endpoint
  async fetchOnlineUsers(): Promise<Array<{ id: string; name: string; role?: string; phone?: string; lastSeen: number }>> {
    try {
      const res = await fetch('/api/presence/online');
      const data = await res.json();
      return data.users || [];
    } catch {
      return [];
    }
  }

  // Simulate receiving an incoming call within the chat or app for testing
  simulateIncomingCall(options?: {
    callType?: CallType;
    isGroup?: boolean;
    channelId?: string;
    channelName?: string;
    callerName?: string;
    callerRole?: UserRole;
    callerPhone?: string;
    callerSubCounty?: string;
  }): ActiveCallSession {
    const callId = `sim-call-${Date.now()}`;
    const isGroup = Boolean(options?.isGroup);
    const callType: CallType = options?.callType || 'audio';
    const caller = {
      id: 'officer-kiprotich-caritas',
      name: options?.callerName || 'Officer Peter Kiprotich',
      role: options?.callerRole || ('chief_officer' as UserRole),
      phone: options?.callerPhone || '0722123456',
      subCounty: options?.callerSubCounty || 'Kitui Central Command HQ',
    };

    const call: ActiveCallSession = {
      callId,
      channelId: options?.channelId || 'general',
      channelName: options?.channelName || 'General Welfare',
      callType,
      isGroup,
      initiator: caller,
      targetUser: !isGroup ? {
        id: this.currentUserId || 'my-id',
        name: this.currentUserName || 'You',
        phone: this.currentUserPhone,
        role: (this.currentUserRole as UserRole) || 'primary_user',
      } : undefined,
      participants: [{
        id: caller.id,
        name: caller.name,
        role: caller.role,
        phone: caller.phone,
        subCounty: caller.subCounty,
        joinedAt: new Date().toISOString(),
        isLocal: false,
      }],
      status: 'ringing',
      startedAt: new Date().toISOString(),
    };

    // Inform server so it registers in active calls
    if (typeof window !== 'undefined') {
      fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(call),
      }).catch(() => {});
    }

    callRinger.playIncomingRing();
    showSystemCallNotification(call);
    this.notifyIncomingCall(call);

    return call;
  }
}

export const callService = new CallService();
