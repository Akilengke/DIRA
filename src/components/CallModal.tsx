import React, { useEffect, useRef, useState } from 'react';
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  SwitchCamera, 
  Minimize2, 
  Maximize2, 
  Users, 
  Shield, 
  Volume2, 
  Wifi,
  LayoutGrid,
  Pin,
  PinOff,
  ScreenShare
} from 'lucide-react';
import { ActiveCallSession, CallParticipant, UserProfile } from '../types';
import { callService } from '../services/callService';

interface CallModalProps {
  call: ActiveCallSession;
  currentUser: UserProfile | null;
  onEndCall: () => void;
  onOpenInvite?: () => void;
}

// Persistent background audio player for remote streams to guarantee uninterrupted audio in voice and video calls
const RemoteAudioPlayer: React.FC<{ peerId: string; stream: MediaStream }> = ({ peerId, stream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !stream) return;

    if (audioEl.srcObject !== stream) {
      audioEl.srcObject = stream;
    }
    audioEl.muted = false;
    audioEl.volume = 1.0;

    const playAudio = () => {
      audioEl.play().catch((err) => {
        console.warn(`[RemoteAudioPlayer] HTML5 audio play blocked for ${peerId}:`, err);
      });
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };

    playAudio();

    // Dual Web Audio API audio pipeline to amplify sound and bypass background autoplay throttling
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && stream.getAudioTracks().length > 0) {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.25, ctx.currentTime);
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
      }
    } catch (e) {
      console.warn('[RemoteAudioPlayer] Web Audio bridge note:', e);
    }

    const unlock = () => {
      playAudio();
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stream, peerId]);

  return <audio ref={audioRef} autoPlay playsInline className="fixed -top-96 -left-96 w-1 h-1 opacity-0 pointer-events-none" />;
};

// Individual participant video tile with dedicated video element and stream lifecycle
interface ParticipantTileProps {
  participant: CallParticipant;
  isLocal: boolean;
  stream: MediaStream | null;
  isCallVideo: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isSpotlight?: boolean;
  onToggleSpotlight?: () => void;
}

const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  isLocal,
  stream,
  isCallVideo,
  isMuted = false,
  isVideoOff = false,
  isSpotlight = false,
  onToggleSpotlight,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  useEffect(() => {
    if (stream) {
      if (videoRef.current && videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current?.play().catch(() => {});

      if (!isLocal && audioRef.current) {
        if (audioRef.current.srcObject !== stream) {
          audioRef.current.srcObject = stream;
        }
        audioRef.current.muted = false;
        audioRef.current.play().catch(() => {});
      }
    }

    const checkTracks = () => {
      if (!stream) {
        setHasVideoTrack(false);
        return;
      }
      const vTracks = stream.getVideoTracks();
      const live = vTracks.length > 0 && vTracks.some(t => t.enabled && t.readyState === 'live');
      setHasVideoTrack(live);
    };

    checkTracks();
    const interval = setInterval(checkTracks, 500);
    return () => clearInterval(interval);
  }, [stream, isVideoOff, isLocal]);

  // Video is rendered whenever camera is enabled or screen is being shared, and active tracks exist
  const hasLiveTrack = isLocal 
    ? (stream?.getVideoTracks().some(t => t.enabled && t.readyState === 'live') ?? false) 
    : hasVideoTrack;
  const isSharing = Boolean(participant.isScreenSharing);
  const showVideo = isSharing || (isLocal ? (!isVideoOff && hasLiveTrack) : (hasLiveTrack || !isVideoOff));
  const initials = (participant.name || 'U').charAt(0).toUpperCase();

  return (
    <div 
      className={`relative rounded-2xl overflow-hidden bg-zinc-900/90 border transition-all duration-200 flex flex-col items-center justify-center min-h-[180px] w-full h-full shadow-lg group select-none ${
        isSharing
          ? 'border-sky-500 shadow-sky-500/30 ring-2 ring-sky-500/50'
          : isSpotlight 
            ? 'border-emerald-500 shadow-emerald-500/20 ring-2 ring-emerald-500/40' 
            : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      {/* Remote Audio Tag (Bypasses Video Mute State) */}
      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          className="hidden"
        />
      )}

      {/* Video Element: unmuted for remote participants, muted for local */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full transition-opacity duration-300 ${
          isSharing ? 'object-contain bg-black' : 'object-cover'
        } ${
          isLocal && !isSharing ? '-scale-x-100' : ''
        } ${showVideo ? 'opacity-100 relative' : 'opacity-0 absolute inset-0 pointer-events-none'}`}
      />

      {/* Video Off / Audio Avatar Fallback */}
      {!showVideo && (
        <div className="flex flex-col items-center justify-center p-6 text-center z-1">
          <div className="relative mb-3">
            <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-2xl sm:text-3xl font-bold text-white shadow-xl ${
              isLocal 
                ? 'bg-gradient-to-tr from-emerald-800 to-teal-600 border-2 border-emerald-400/40' 
                : 'bg-gradient-to-tr from-zinc-800 to-emerald-900 border-2 border-zinc-700'
            }`}>
              {initials}
            </div>

            {/* Speaking audio wave animation when unmuted */}
            {!isMuted && (
              <>
                <span className="absolute -inset-1.5 rounded-full border border-emerald-400/40 animate-ping opacity-60" />
                <span className="absolute -inset-3 rounded-full border border-emerald-500/20 animate-pulse" />
              </>
            )}
          </div>

          <h4 className="text-sm sm:text-base font-bold text-zinc-100 truncate max-w-[180px]">
            {participant.name} {isLocal && <span className="text-emerald-400 text-xs font-normal">(You)</span>}
          </h4>
          <span className="text-xs text-zinc-400 font-medium">
            {isSharing ? 'Sharing Screen' : (isVideoOff ? 'Camera Off' : (isCallVideo ? 'Starting Camera...' : 'Voice Call'))}
          </span>
          {participant.subCounty && (
            <span className="text-[11px] text-zinc-500 mt-0.5">
              {participant.subCounty}
            </span>
          )}
        </div>
      )}

      {/* Top Overlays: Screen Share Badge, Spotlight Toggle & Live Badge */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10 pointer-events-none">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {isSharing && (
            <span className="text-[10px] bg-sky-950/90 border border-sky-500/50 text-sky-300 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 backdrop-blur-md shadow-md">
              <ScreenShare className="w-3 h-3 text-sky-400 animate-pulse" />
              <span>{isLocal ? 'Your Screen' : `${participant.name.split(' ')[0]}'s Screen`}</span>
            </span>
          )}

          {onToggleSpotlight && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSpotlight();
              }}
              className={`p-1.5 rounded-lg text-xs font-semibold backdrop-blur-md transition-all flex items-center gap-1 cursor-pointer opacity-0 group-hover:opacity-100 ${
                isSpotlight 
                  ? 'bg-emerald-600 text-white shadow-md opacity-100' 
                  : 'bg-black/60 hover:bg-black/80 text-zinc-200'
              }`}
              title={isSpotlight ? 'Remove from spotlight' : 'Pin to spotlight'}
            >
              {isSpotlight ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              <span className="text-[10px] hidden sm:inline">{isSpotlight ? 'Unpin' : 'Pin'}</span>
            </button>
          )}
        </div>

        {showVideo && (
          <span className="ml-auto text-[10px] bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 backdrop-blur-sm pointer-events-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            HD
          </span>
        )}
      </div>

      {/* Bottom Information Pill */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white text-xs bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 z-10">
        <div className="flex items-center gap-1.5 min-w-0 pr-2">
          <span className="font-semibold truncate">
            {participant.name} {isLocal && <span className="text-emerald-400 font-bold">(You)</span>}
          </span>
          {participant.role && (
            <span className="hidden md:inline-block text-[10px] text-zinc-400 capitalize truncate">
              • {participant.role}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Screen Share Indicator */}
          {isSharing && (
            <span className="text-sky-300 bg-sky-950/90 border border-sky-500/40 p-1 rounded-md" title="Screen sharing active">
              <ScreenShare className="w-3.5 h-3.5" />
            </span>
          )}

          {/* Audio Indicator */}
          {isMuted ? (
            <span className="text-red-400 bg-red-950/80 p-1 rounded-md" title="Microphone muted">
              <MicOff className="w-3.5 h-3.5" />
            </span>
          ) : (
            <span className="flex items-center gap-0.5 h-3.5 px-1 bg-emerald-950/80 rounded-md text-emerald-400" title="Speaking / Unmuted">
              <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="w-0.5 h-3 bg-emerald-400 rounded-full animate-pulse delay-75" />
              <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full animate-pulse delay-150" />
            </span>
          )}

          {/* Video Indicator */}
          {isVideoOff && !isSharing && (
            <span className="text-zinc-400 bg-zinc-800/80 p-1 rounded-md" title="Camera disabled">
              <VideoOff className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const CallModal: React.FC<CallModalProps> = ({
  call,
  currentUser,
  onEndCall,
  onOpenInvite,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.callType === 'audio');
  const [isScreenSharing, setIsScreenSharing] = useState(callService.getIsScreenSharing());
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [spotlightUserId, setSpotlightUserId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'spotlight'>('grid');

  // Stop ringing when call connects or any remote participant joins
  useEffect(() => {
    const isCallConnected = call.status === 'connected' || 
      (call.participants && call.participants.length > 1) || 
      remoteStreams.size > 0;
      
    if (isCallConnected) {
      callService.stopRinging();
    }
  }, [call.status, call.participants, remoteStreams.size]);

  // Subscribe to remote streams
  useEffect(() => {
    const unsub = callService.onRemoteStreamsUpdated((streams) => {
      setRemoteStreams(new Map(streams));
    });
    return unsub;
  }, []);

  // Listen for participant updates and screen sharing changes
  useEffect(() => {
    const unsub = callService.onCallStateChanged((updatedCall) => {
      const sharing = callService.getIsScreenSharing();
      setIsScreenSharing(sharing);
      const freshStream = callService.getLocalStream();
      if (freshStream) {
        setLocalStream(new MediaStream(freshStream.getTracks()));
      }
      // If any participant (local or remote) begins screen sharing, automatically spotlight them for everyone
      if (updatedCall) {
        const sharer = updatedCall.participants.find(p => p.isScreenSharing);
        if (sharer) {
          setSpotlightUserId(sharer.id);
          setViewMode('spotlight');
        }
      }
    });
    return unsub;
  }, []);

  // Fetch and subscribe to local media stream
  useEffect(() => {
    const unsub = callService.onLocalStreamUpdated((stream) => {
      setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
    });
    const interval = setInterval(() => {
      const fresh = callService.getLocalStream();
      if (fresh) {
        setLocalStream(new MediaStream(fresh.getTracks()));
      }
    }, 1000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [isVideoOff, isScreenSharing]);

  // Call duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      const startTime = call.connectedAt || call.startedAt;
      if (startTime) {
        const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
        setDurationSeconds(Math.max(0, diff));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [call.connectedAt, call.startedAt]);

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleMic = () => {
    const enabled = callService.toggleAudio();
    setIsMuted(!enabled);
  };

  const handleToggleVideo = async () => {
    const enabled = await callService.toggleVideo();
    setIsVideoOff(!enabled);
    if (enabled) {
      call.callType = 'video';
    }
    const freshStream = callService.getLocalStream();
    if (freshStream) {
      setLocalStream(new MediaStream(freshStream.getTracks()));
    }
  };

  const handleToggleScreenShare = async () => {
    const isNowSharing = await callService.toggleScreenShare();
    setIsScreenSharing(isNowSharing);
    if (isNowSharing) {
      call.callType = 'video';
      setIsVideoOff(false);
      setSpotlightUserId(currentUser?.id || 'local-me');
      setViewMode('spotlight');
    }
    const freshStream = callService.getLocalStream();
    if (freshStream) {
      setLocalStream(new MediaStream(freshStream.getTracks()));
    }
  };

  const handleFlipCamera = async () => {
    await callService.flipCamera();
    const freshStream = callService.getLocalStream();
    if (freshStream) {
      setLocalStream(new MediaStream(freshStream.getTracks()));
    }
  };

  const handleEndCall = () => {
    if (isScreenSharing) {
      callService.stopScreenShare();
    }
    callService.stopRinging();
    onEndCall();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Compile full participant list and resolve local identity
  const participants = call.participants || [];
  const myId = currentUser?.id || callService.getCurrentUserId();
  const myPhone = currentUser?.phone || callService.getCurrentUserPhone();

  const isParticipantMe = (p: CallParticipant) => {
    if (p.isLocal) return true;
    if (myId && p.id === myId) return true;
    if (myPhone && p.phone && (myPhone === p.phone || p.phone.replace(/[^0-9]/g, '') === myPhone.replace(/[^0-9]/g, ''))) return true;
    return false;
  };
  
  // Prepare local participant object
  const localParticipant: CallParticipant = {
    id: myId || 'local-me',
    name: currentUser?.name || 'You',
    role: currentUser?.role || 'Member',
    phone: myPhone,
    subCounty: currentUser?.subCounty,
    isLocal: true,
    isMuted,
    isVideoOff: isScreenSharing ? false : isVideoOff,
    isScreenSharing,
  };

  // Other remote participants
  const otherParticipants = participants.filter(p => !isParticipantMe(p));

  // All participants including local user (deduplicated)
  const allParticipants: CallParticipant[] = [
    localParticipant,
    ...otherParticipants
  ];

  // Robust stream lookup helper
  const getStreamForParticipant = (p: CallParticipant): MediaStream | null => {
    if (isParticipantMe(p)) return localStream;
    if (remoteStreams.has(p.id)) return remoteStreams.get(p.id)!;
    // Try matching by phone or other key
    for (const [peerId, stream] of remoteStreams.entries()) {
      if (peerId === p.id || (p.phone && peerId.includes(p.phone))) {
        return stream;
      }
    }
    // If only one remote stream exists and one remote participant exists, match them
    if (remoteStreams.size === 1 && otherParticipants.length === 1) {
      const first = Array.from(remoteStreams.values())[0] as MediaStream | undefined;
      return first || null;
    }
    return null;
  };

  // Participant currently sharing screen (if any)
  const screenSharingSharer = allParticipants.find(p => p.isScreenSharing);

  // Determine active spotlight participant if in spotlight mode
  const activeSpotlightUser = spotlightUserId 
    ? allParticipants.find(p => p.id === spotlightUserId) || (screenSharingSharer || otherParticipants[0] || localParticipant)
    : (screenSharingSharer || otherParticipants[0] || localParticipant);

  // Auto-switch to spotlight when someone starts sharing screen
  useEffect(() => {
    if (screenSharingSharer) {
      setSpotlightUserId(screenSharingSharer.id);
      setViewMode('spotlight');
    }
  }, [screenSharingSharer?.id]);

  // Compute dynamic grid layout class based on participant count
  const getGridClasses = (count: number) => {
    if (count <= 1) {
      return 'grid-cols-1 max-w-lg mx-auto h-full max-h-[500px]';
    }
    if (count === 2) {
      return 'grid-cols-1 md:grid-cols-2 h-full';
    }
    if (count === 3) {
      return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 h-full';
    }
    if (count === 4) {
      return 'grid-cols-2 grid-rows-2 h-full';
    }
    if (count <= 6) {
      return 'grid-cols-2 md:grid-cols-3 h-full';
    }
    return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 h-full';
  };

  // If call has ended: display clear Call Ended Screen
  if (call.status === 'ended' || call.status === 'rejected') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 text-center text-white shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
            <PhoneOff className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl sm:text-2xl font-black text-white">
              {call.status === 'rejected' ? 'Call Declined' : 'Call Ended'}
            </h3>
            <p className="text-xs text-zinc-400">
              {call.isGroup 
                ? `Group call in #${call.channelName || 'general'}` 
                : (call.targetUser?.name ? `Direct call with ${call.targetUser.name}` : `Call with ${call.initiator.name}`)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 text-left text-xs">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-bold">Total Duration</span>
              <span className="text-base font-extrabold text-white font-mono">
                {call.endedDuration || formatDuration(durationSeconds)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-bold">Status</span>
              <span className="text-base font-extrabold text-white">
                {call.status === 'rejected' ? 'Declined' : 'Completed'}
              </span>
            </div>
            {call.endedReason && (
              <div className="col-span-2 pt-1 border-t border-zinc-800/60 text-[11px] text-zinc-400">
                Notice: {call.endedReason}
              </div>
            )}
          </div>

          <button
            onClick={() => onEndCall()}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-2xl transition-all shadow-md active:scale-98 cursor-pointer text-sm"
          >
            Done • Return to DIRA
          </button>
        </div>
      </div>
    );
  }

  // If minimized: render floating PIP pill
  if (isMinimized) {
    return (
      <div className="fixed bottom-20 right-4 z-50 bg-zinc-900/95 backdrop-blur-md text-white border border-emerald-500/40 rounded-2xl p-3 shadow-2xl flex items-center gap-3 animate-fadeIn">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/30 flex items-center justify-center border border-emerald-500/50">
            {call.callType === 'video' ? (
              <Video className="w-5 h-5 text-emerald-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-emerald-400" />
            )}
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
        </div>

        <div className="text-left">
          <div className="text-xs font-bold flex items-center gap-1.5">
            <span>{call.isGroup ? `#${call.channelName || 'Group Call'}` : (call.targetUser?.name || call.initiator.name)}</span>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
              {formatDuration(durationSeconds)}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400">
            {call.status === 'connected' ? `${allParticipants.length} in call` : 'Connecting...'}
          </div>
        </div>

        <div className="flex items-center gap-1 pl-1">
          <button
            onClick={handleToggleMic}
            className={`p-2 rounded-xl transition-all ${isMuted ? 'bg-red-500/80 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            onClick={handleToggleScreenShare}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isScreenSharing 
                ? 'bg-sky-600 text-white ring-1 ring-sky-400' 
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            <ScreenShare className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-all cursor-pointer"
            title="Expand Call"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleEndCall}
            className="p-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all shadow-md cursor-pointer"
            title="End Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-5 overflow-hidden animate-fadeIn select-none">
      {/* Dedicated background audio players for all remote streams to guarantee uninterrupted audio transmission */}
      {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
        <RemoteAudioPlayer key={peerId} peerId={peerId} stream={stream} />
      ))}

      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between gap-3 text-white max-w-7xl mx-auto w-full z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shrink-0">
            {call.isGroup ? <Users className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold truncate max-w-[200px] sm:max-w-md">
                {call.isGroup 
                  ? `Group ${call.callType === 'video' ? 'Video' : 'Voice'} Call • #${call.channelName || 'general'}`
                  : `1-on-1 Call with ${call.targetUser?.name || call.initiator.name}`
                }
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full font-medium">
                <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>P2P Mesh</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="font-mono text-emerald-400 font-bold">{formatDuration(durationSeconds)}</span>
              <span>•</span>
              <span className="capitalize">
                {call.status === 'connected' 
                  ? `${allParticipants.length} participant${allParticipants.length === 1 ? '' : 's'}` 
                  : 'Ringing / Connecting...'}
              </span>
            </div>
          </div>
        </div>

        {/* Top Controls: Layout switcher, Invite & Fullscreen */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle: Grid vs Spotlight */}
          {allParticipants.length > 1 && (
            <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Grid View (All screens arranged evenly)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Grid</span>
              </button>
              <button
                onClick={() => {
                  setViewMode('spotlight');
                  if (!spotlightUserId && otherParticipants.length > 0) {
                    setSpotlightUserId(otherParticipants[0].id);
                  }
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'spotlight' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Spotlight View (Active speaker featured)"
              >
                <Pin className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Spotlight</span>
              </button>
            </div>
          )}

          {/* Add Member button (group calls) */}
          {onOpenInvite && call.isGroup && (
            <button
              onClick={onOpenInvite}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Add Member</span>
            </button>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-all cursor-pointer hidden sm:block"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Minimize button */}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-all cursor-pointer"
            title="Minimize to Picture-in-Picture"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Screen Sharing Notification Banner */}
      {screenSharingSharer && (
        <div className="max-w-7xl mx-auto w-full mt-2 mb-1 px-4 py-2 bg-sky-950/90 border border-sky-500/50 rounded-xl flex items-center justify-between shadow-lg text-sky-200 animate-fadeIn z-20">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
            <ScreenShare className="w-4 h-4 text-sky-400 animate-pulse shrink-0" />
            <span>
              {isParticipantMe(screenSharingSharer) 
                ? 'You are presenting your screen to everyone' 
                : `${screenSharingSharer.name} is sharing their screen`}
            </span>
          </div>
          {isParticipantMe(screenSharingSharer) ? (
            <button
              onClick={handleToggleScreenShare}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer shadow"
            >
              Stop Sharing
            </button>
          ) : (
            <button
              onClick={() => {
                setSpotlightUserId(screenSharingSharer.id);
                setViewMode('spotlight');
              }}
              className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer shadow"
            >
              View Full Screen
            </button>
          )}
        </div>
      )}

      {/* Main Video Arena */}
      <div className="flex-1 flex items-center justify-center my-2 max-w-7xl mx-auto w-full min-h-0 overflow-hidden">
        {/* Waiting State: only 1 participant and calling/ringing status */}
        {otherParticipants.length === 0 && call.status !== 'connected' ? (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-6 max-w-md w-full">
            <div className="relative">
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-tr from-emerald-900/60 to-zinc-900 flex items-center justify-center border-4 border-emerald-500/30 shadow-2xl relative">
                <span className="text-4xl sm:text-5xl font-black text-emerald-400">
                  {(call.targetUser?.name || call.initiator.name || 'D')[0].toUpperCase()}
                </span>
              </div>
              <span className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping" />
              <span className="absolute -inset-3 rounded-full border border-emerald-400/20 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">
                {call.targetUser?.name || (call.isGroup ? `#${call.channelName || 'general'}` : call.initiator.name)}
              </h3>
              <p className="text-xs text-zinc-400">
                Calling devices across Kitui County...
              </p>
            </div>

            {/* Local Video Camera Preview during outgoing ring */}
            {call.callType === 'video' && !isVideoOff && (
              <div className="w-56 h-36 rounded-2xl overflow-hidden border-2 border-emerald-500/50 shadow-2xl bg-zinc-900 relative">
                <ParticipantTile
                  participant={localParticipant}
                  isLocal={true}
                  stream={localStream}
                  isCallVideo={call.callType === 'video'}
                  isMuted={isMuted}
                  isVideoOff={isVideoOff}
                />
              </div>
            )}
          </div>
        ) : viewMode === 'spotlight' && allParticipants.length > 1 ? (
          /* Spotlight / Speaker Stage Mode */
          <div className="flex flex-col w-full h-full gap-3">
            {/* Primary Featured Video Tile */}
            <div className="flex-1 w-full min-h-0 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800">
              <ParticipantTile
                participant={activeSpotlightUser}
                isLocal={isParticipantMe(activeSpotlightUser)}
                stream={getStreamForParticipant(activeSpotlightUser)}
                isCallVideo={call.callType === 'video'}
                isMuted={isParticipantMe(activeSpotlightUser) ? isMuted : activeSpotlightUser.isMuted}
                isVideoOff={isParticipantMe(activeSpotlightUser) ? isVideoOff : activeSpotlightUser.isVideoOff}
                isSpotlight={true}
                onToggleSpotlight={() => setViewMode('grid')}
              />
            </div>

            {/* Thumbnail Strip of All Other Participants */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 pt-1 scrollbar-thin px-1">
              {allParticipants.map((p) => {
                const isSelected = p.id === activeSpotlightUser.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSpotlightUserId(p.id)}
                    className={`w-40 sm:w-52 h-24 sm:h-32 shrink-0 cursor-pointer transition-all rounded-xl overflow-hidden ${
                      isSelected ? 'ring-2 ring-emerald-500 scale-95 opacity-80' : 'hover:ring-2 hover:ring-zinc-600'
                    }`}
                  >
                    <ParticipantTile
                      participant={p}
                      isLocal={isParticipantMe(p)}
                      stream={getStreamForParticipant(p)}
                      isCallVideo={call.callType === 'video'}
                      isMuted={isParticipantMe(p) ? isMuted : p.isMuted}
                      isVideoOff={isParticipantMe(p) ? isVideoOff : p.isVideoOff}
                      isSpotlight={isSelected}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Responsive Multi-User Grid Mode */
          <div className={`grid gap-3 w-full h-full max-h-[75vh] ${getGridClasses(allParticipants.length)}`}>
            {allParticipants.map((p) => {
              const isSpotlighted = spotlightUserId === p.id;
              return (
                <div key={p.id} className="w-full h-full min-h-[160px]">
                  <ParticipantTile
                    participant={p}
                    isLocal={isParticipantMe(p)}
                    stream={getStreamForParticipant(p)}
                    isCallVideo={call.callType === 'video'}
                    isMuted={isParticipantMe(p) ? isMuted : p.isMuted}
                    isVideoOff={isParticipantMe(p) ? isVideoOff : p.isVideoOff}
                    isSpotlight={isSpotlighted}
                    onToggleSpotlight={() => {
                      if (spotlightUserId === p.id) {
                        setSpotlightUserId(null);
                        setViewMode('grid');
                      } else {
                        setSpotlightUserId(p.id);
                        setViewMode('spotlight');
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-center gap-3 sm:gap-5 max-w-xl mx-auto w-full py-2 z-20">
        {/* Toggle Microphone */}
        <button
          onClick={handleToggleMic}
          className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center transition-all shadow-lg cursor-pointer ${
            isMuted 
              ? 'bg-red-600 text-white hover:bg-red-500 ring-2 ring-red-400' 
              : 'bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-800'
          }`}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* Toggle Video Camera */}
        <button
          onClick={handleToggleVideo}
          className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center transition-all shadow-lg cursor-pointer ${
            isVideoOff 
              ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800' 
              : 'bg-emerald-600 text-white hover:bg-emerald-500 ring-2 ring-emerald-400'
          }`}
          title={isVideoOff ? 'Start Camera' : 'Stop Camera'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* Flip Camera (Mobile Front/Rear) */}
        {!isVideoOff && !isScreenSharing && (
          <button
            onClick={handleFlipCamera}
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-zinc-900 text-zinc-200 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center transition-all shadow-lg cursor-pointer"
            title="Flip Front/Rear Camera"
          >
            <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* Toggle Screen Share */}
        <button
          onClick={handleToggleScreenShare}
          className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center transition-all shadow-lg cursor-pointer ${
            isScreenSharing 
              ? 'bg-sky-600 text-white hover:bg-sky-500 ring-2 ring-sky-400 shadow-sky-600/30' 
              : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 hover:text-white'
          }`}
          title={isScreenSharing ? 'Stop Sharing Screen' : 'Share Your Screen'}
        >
          <ScreenShare className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* End Call Button */}
        <button
          onClick={handleEndCall}
          className="h-12 px-6 sm:h-14 sm:px-8 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center gap-2 transition-all shadow-xl hover:scale-105 active:scale-95 cursor-pointer"
          title="End Call"
        >
          <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="text-sm sm:text-base font-bold">End Call</span>
        </button>
      </div>
    </div>
  );
};
