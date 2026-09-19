import { ActiveCallSession, CallParticipant, CallSignalMessage, CallType, UserRole } from '../types';
import { getFirestoreClient } from './db';
import { getOrCreateDeviceId } from './deviceTrackingService';
import { collection, doc, setDoc, onSnapshot, updateDoc, deleteDoc, Unsubscribe } from 'firebase/firestore';

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
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
  private ringInterval: any = null;
  private vibrateInterval: any = null;
  private isPlaying = false;

  constructor() {
    // Proactively unlock Web Audio API on first user interaction with the window
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
      window.addEventListener('click', unlockAudio, { once: true });
      window.addEventListener('touchstart', unlockAudio, { once: true });
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

  // Play outgoing ringing tone (US/UK dual frequency tone 440Hz + 480Hz)
  playOutgoingRing() {
    this.stop();
    const ctx = this.getContext();
    if (!ctx) return;
    this.isPlaying = true;

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
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 1.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.8);
        osc2.stop(now + 1.8);
      } catch (e) {
        console.warn('Outgoing ringtone error:', e);
      }
    };

    playBurst();
    this.ringInterval = setInterval(playBurst, 3500);
  }

  // Play melodic incoming call chime with phone vibration
  playIncomingRing() {
    this.stop();
    this.isPlaying = true;

    // Trigger physical phone vibration on mobile devices (repeats while ringing)
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
          gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + d);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

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
  private eventSource: EventSource | null = null;
  private sseRetryTimeout: any = null;
  private callPingInterval: any = null;
  private firestoreCallsUnsub: Unsubscribe | null = null;
  private fallbackPollingInterval: any = null;

  // Listeners
  private onCallStateListeners: Set<(call: ActiveCallSession | null) => void> = new Set();
  private onIncomingCallListeners: Set<(call: ActiveCallSession | null) => void> = new Set();
  private onRemoteStreamsUpdatedListeners: Set<(streams: Map<string, MediaStream>) => void> = new Set();
  private onActiveCallsListListeners: Set<(calls: ActiveCallSession[]) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
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
          }
        });

        // If we are currently ringing for a call that has now ended on the server, stop ringing
        if (this.incomingCall) {
          const stillActive = calls.some(
            (c) => c.callId === this.incomingCall?.callId && (c.status === 'calling' || c.status === 'ringing')
          );
          if (!stillActive && calls.length > 0) {
            this.notifyIncomingCall(null);
            callRinger.stop();
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
            this.handleCallEnded(data.callId, data.reason);
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

  // Subscribe to active channel calls
  onActiveCallsList(cb: (calls: ActiveCallSession[]) => void): () => void {
    this.onActiveCallsListListeners.add(cb);
    this.fetchActiveCalls().then(cb).catch(() => {});
    return () => this.onActiveCallsListListeners.delete(cb);
  }

  private notifyActiveCallsList(calls: ActiveCallSession[]) {
    this.onActiveCallsListListeners.forEach(cb => cb(calls));
  }

  private notifyCallState() {
    this.onCallStateListeners.forEach(cb => cb(this.activeCall));
  }

  private notifyRemoteStreams() {
    const copy = new Map(this.remoteStreams);
    this.onRemoteStreamsUpdatedListeners.forEach(cb => cb(copy));
  }

  // ---------------------------------------------------------------------------
  // MEDIA DEVICE CAPTURE
  // ---------------------------------------------------------------------------
  async acquireMediaStream(callType: CallType): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
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
              width: { ideal: 640 },
              height: { ideal: 480 },
            }
          : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;
      return stream;
    } catch (err: any) {
      console.warn('Camera/mic access error, trying audio fallback:', err);
      // If video failed, attempt audio-only fallback
      if (callType === 'video') {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.localStream = audioOnly;
          return audioOnly;
        } catch (audioErr) {
          console.warn('Audio access error:', audioErr);
        }
      }
      // Create a dummy silent media stream as absolute resilience fallback
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
    if (!this.localStream) return false;
    let videoTrack = this.localStream.getVideoTracks()[0];

    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const isVideoOff = !videoTrack.enabled;
      if (this.activeCall) {
        const me = this.activeCall.participants.find(p => p.id === this.currentUserId);
        if (me) me.isVideoOff = isVideoOff;
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
      return videoTrack.enabled;
    } else {
      // Add video track if not present
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        });
        const newTrack = videoStream.getVideoTracks()[0];
        if (newTrack) {
          this.localStream.addTrack(newTrack);
          // Add to all peer connections
          this.peerConnections.forEach((pc) => {
            pc.addTrack(newTrack, this.localStream!);
          });
          if (this.activeCall) {
            const me = this.activeCall.participants.find(p => p.id === this.currentUserId);
            if (me) me.isVideoOff = false;
            this.notifyCallState();
          }
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
        video: { facingMode: this.facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
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
  // WEBRTC PEER CONNECTION HELPERS
  // ---------------------------------------------------------------------------
  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    let pc = this.peerConnections.get(peerId);
    if (pc) return pc;

    pc = new RTCPeerConnection(STUN_CONFIG);

    // Add local tracks to connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc!.addTrack(track, this.localStream!);
      });
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStreams.set(peerId, remoteStream);
      this.notifyRemoteStreams();
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
          caller: this.activeCall.initiator,
          targetUserId: peerId,
          candidate: event.candidate,
          timestamp: new Date().toISOString(),
        });
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
      status: params.isGroup ? 'connected' : 'calling',
      startedAt: now,
      connectedAt: params.isGroup ? now : undefined,
    };

    this.activeCall = session;
    this.notifyCallState();

    // Play outgoing ring for direct call
    if (!params.isGroup) {
      callRinger.playOutgoingRing();
    }

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
      await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
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
      caller: call.initiator,
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

    this.cleanupCallState();
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
      caller: call.initiator,
      participant: meParticipant,
      timestamp: new Date().toISOString(),
    });

    // Create offers for existing participants
    call.participants.forEach(async (participant) => {
      if (participant.id !== this.currentUserId) {
        const pc = this.getOrCreatePeerConnection(participant.id);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
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
          console.warn('Mesh offer error:', e);
        }
      }
    });
  }

  private cleanupCallState() {
    if (this.callPingInterval) {
      clearInterval(this.callPingInterval);
      this.callPingInterval = null;
    }

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

  private handleCallEnded(callId: string, reason?: string) {
    if (this.incomingCall && this.incomingCall.callId === callId) {
      callRinger.stop();
      this.notifyIncomingCall(null);
    }
    if (this.activeCall && this.activeCall.callId === callId) {
      callRinger.stop();
      callRinger.playHangupChime();
      this.cleanupCallState();
    }
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
        if (this.activeCall && this.activeCall.callId === signal.callId) {
          callRinger.stop();
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
                caller: this.activeCall.initiator,
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

      case 'CALL_REJECT':
      case 'CALL_END':
        if (this.incomingCall && this.incomingCall.callId === signal.callId) {
          callRinger.stop();
          this.notifyIncomingCall(null);
        }
        if (this.activeCall && this.activeCall.callId === signal.callId) {
          callRinger.stop();
          callRinger.playHangupChime();
          this.cleanupCallState();
        }
        break;

      case 'CALL_OFFER': {
        const isOfferTarget = this.isTargetForMe(signal.targetUserId, (signal as any).targetPhone, (signal as any).targetName);
        if (isOfferTarget || signal.isGroup) {
          if (!this.localStream) {
            await this.acquireMediaStream(signal.callType || 'video');
          }
          const pc = this.getOrCreatePeerConnection(signal.caller.id);
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
        const isAnswerTarget = this.isTargetForMe(signal.targetUserId, (signal as any).targetPhone, (signal as any).targetName);
        if (isAnswerTarget || signal.isGroup) {
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
        if (isCandidateTarget || signal.isGroup) {
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
          const idx = this.activeCall.participants.findIndex(p => p.id === signal.participant!.id);
          if (idx >= 0) {
            this.activeCall.participants[idx] = {
              ...this.activeCall.participants[idx],
              ...signal.participant,
              isLocal: signal.participant.id === this.currentUserId,
            };
            this.notifyCallState();
          }
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
