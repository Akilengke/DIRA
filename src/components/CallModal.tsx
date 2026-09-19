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
  Sparkles,
  Wifi
} from 'lucide-react';
import { ActiveCallSession, CallParticipant, UserProfile } from '../types';
import { callService } from '../services/callService';

interface CallModalProps {
  call: ActiveCallSession;
  currentUser: UserProfile | null;
  onEndCall: () => void;
  onOpenInvite?: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  call,
  currentUser,
  onEndCall,
  onOpenInvite,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.callType === 'audio');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Attach local media stream to local video element
  useEffect(() => {
    const stream = callService.getLocalStream();
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [isVideoOff]);

  // Subscribe to remote streams
  useEffect(() => {
    const unsub = callService.onRemoteStreamsUpdated((streams) => {
      setRemoteStreams(new Map(streams));
    });
    return unsub;
  }, []);

  // Bind remote streams to respective video tags
  useEffect(() => {
    remoteStreams.forEach((stream, peerId) => {
      const el = remoteVideoRefs.current.get(peerId);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
      }
    });
  }, [remoteStreams, call.participants]);

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
  };

  const handleFlipCamera = async () => {
    await callService.flipCamera();
  };

  const participants = call.participants || [];
  const otherParticipants = participants.filter(p => !p.isLocal && p.id !== currentUser?.id);

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
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.2 rounded font-mono font-bold">
              {formatDuration(durationSeconds)}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400">
            {call.status === 'connected' ? `${participants.length} in call` : 'Connecting...'}
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
            onClick={() => setIsMinimized(false)}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-all"
            title="Expand Call"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onEndCall}
            className="p-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all shadow-md"
            title="End Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-6 overflow-hidden animate-fadeIn">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 text-white max-w-5xl mx-auto w-full z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
            {call.isGroup ? <Users className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold">
                {call.isGroup 
                  ? `Group ${call.callType === 'video' ? 'Video' : 'Voice'} Call • #${call.channelName || 'general'}`
                  : `1-on-1 Call with ${call.targetUser?.name || call.initiator.name}`
                }
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-medium">
                <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Encrypted P2P</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="font-mono text-emerald-400 font-bold">{formatDuration(durationSeconds)}</span>
              <span>•</span>
              <span className="capitalize">
                {call.status === 'connected' 
                  ? `${participants.length} participant${participants.length === 1 ? '' : 's'}` 
                  : 'Ringing / Connecting...'}
              </span>
            </div>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          {onOpenInvite && call.isGroup && (
            <button
              onClick={onOpenInvite}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 transition-all flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Add Member</span>
            </button>
          )}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all"
            title="Minimize to Picture-in-Picture"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Participant Grid */}
      <div className="flex-1 flex items-center justify-center my-4 max-w-5xl mx-auto w-full min-h-0 overflow-y-auto">
        {/* Single participant / waiting for answer state */}
        {otherParticipants.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-6 max-w-md w-full">
            <div className="relative">
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-tr from-emerald-900/60 to-zinc-800 flex items-center justify-center border-4 border-emerald-500/30 shadow-2xl relative">
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
                {call.status === 'connected' 
                  ? 'Ready for community audio/video broadcast' 
                  : 'Ringing devices across Kitui County...'}
              </p>
            </div>

            {/* Local Video Picture-in-Picture Preview if Video Call */}
            {call.callType === 'video' && !isVideoOff && (
              <div className="w-48 h-32 rounded-2xl overflow-hidden border-2 border-emerald-500/50 shadow-xl bg-zinc-900 relative">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
                <span className="absolute bottom-1.5 left-2 text-[10px] bg-black/60 text-zinc-300 px-1.5 py-0.5 rounded font-medium">
                  You (Preview)
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Multi-Participant Grid */
          <div className={`grid gap-3 w-full h-full max-h-[65vh] ${
            otherParticipants.length === 1 
              ? 'grid-cols-1 sm:grid-cols-2' 
              : otherParticipants.length <= 3 
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' 
                : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
          }`}>
            {/* Local Participant Tile */}
            <div className="relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center min-h-[160px] shadow-lg group">
              {call.callType === 'video' && !isVideoOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-900/60 border border-emerald-500/40 flex items-center justify-center text-xl font-bold text-emerald-300">
                    {(currentUser?.name || 'Y')[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold text-zinc-300 mt-2">Camera Off</span>
                </div>
              )}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white text-xs bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-xl">
                <span className="font-bold truncate">You ({currentUser?.role || 'Member'})</span>
                <span className="flex items-center gap-1">
                  {isMuted && <MicOff className="w-3.5 h-3.5 text-red-400" />}
                  {isVideoOff && <VideoOff className="w-3.5 h-3.5 text-zinc-400" />}
                </span>
              </div>
            </div>

            {/* Remote Participants Tiles */}
            {otherParticipants.map((p) => {
              const hasRemoteStream = remoteStreams.has(p.id);
              return (
                <div 
                  key={p.id} 
                  className="relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center min-h-[160px] shadow-lg"
                >
                  {call.callType === 'video' && !p.isVideoOff && hasRemoteStream ? (
                    <video
                      ref={(el) => {
                        if (el) remoteVideoRefs.current.set(p.id, el);
                        else remoteVideoRefs.current.delete(p.id);
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-800/80 to-zinc-800 border-2 border-emerald-500/40 flex items-center justify-center text-xl font-bold text-white shadow-md">
                          {(p.name || 'P')[0].toUpperCase()}
                        </div>
                        {/* Simulated audio speaking pulse ring */}
                        <div className="absolute inset-0 rounded-full border border-emerald-400/50 animate-pulse" />
                      </div>
                      <span className="text-xs text-zinc-300 mt-2 font-medium">{p.name}</span>
                      {p.subCounty && (
                        <span className="text-[10px] text-zinc-400">{p.subCounty}</span>
                      )}
                    </div>
                  )}

                  {/* Tile Overlay Info */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white text-xs bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-xl">
                    <span className="font-bold truncate">{p.name}</span>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      {p.isMuted ? (
                        <MicOff className="w-3.5 h-3.5 text-red-400" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-center gap-3 sm:gap-4 max-w-xl mx-auto w-full py-2 z-10">
        {/* Toggle Microphone */}
        <button
          onClick={handleToggleMic}
          className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center transition-all shadow-lg cursor-pointer ${
            isMuted 
              ? 'bg-red-600 text-white hover:bg-red-500 ring-2 ring-red-400' 
              : 'bg-zinc-800/90 text-white hover:bg-zinc-700 border border-zinc-700'
          }`}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* Toggle Video (if video call or can turn on video) */}
        <button
          onClick={handleToggleVideo}
          className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center transition-all shadow-lg cursor-pointer ${
            isVideoOff 
              ? 'bg-zinc-800/90 text-zinc-400 hover:bg-zinc-700 border border-zinc-700' 
              : 'bg-emerald-600 text-white hover:bg-emerald-500 ring-2 ring-emerald-400'
          }`}
          title={isVideoOff ? 'Start Camera' : 'Stop Camera'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* Flip Camera (Mobile/Tablets) */}
        {!isVideoOff && (
          <button
            onClick={handleFlipCamera}
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-zinc-800/90 text-zinc-200 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center transition-all shadow-lg cursor-pointer"
            title="Flip Front/Rear Camera"
          >
            <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* End Call Button */}
        <button
          onClick={onEndCall}
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
