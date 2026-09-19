import React from 'react';
import { Phone, Video, PhoneOff, Users, Shield } from 'lucide-react';
import { ActiveCallSession } from '../types';

interface IncomingCallBannerProps {
  call: ActiveCallSession | null;
  onAccept: (call: ActiveCallSession) => void;
  onDecline: (callId: string) => void;
}

export const IncomingCallBanner: React.FC<IncomingCallBannerProps> = ({
  call,
  onAccept,
  onDecline,
}) => {
  if (!call) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-md px-3 animate-slideDown pointer-events-auto">
      <div className="bg-zinc-900/98 backdrop-blur-md text-white rounded-3xl p-4 shadow-2xl border-2 border-emerald-500/80 flex items-center justify-between gap-3 ring-4 ring-emerald-500/20">
        {/* Caller Avatar & Ringing pulse */}
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-800 flex items-center justify-center font-bold text-lg text-white shadow-lg">
            {call.isGroup ? <Users className="w-6 h-6" /> : (call.initiator.name[0] || 'C').toUpperCase()}
          </div>
          <span className="absolute -inset-1 rounded-2xl border-2 border-emerald-400 animate-ping" />
        </div>

        {/* Call Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-emerald-400 tracking-wider uppercase">
              {call.isGroup 
                ? `Group ${call.callType === 'video' ? 'Video' : 'Voice'} Call`
                : `Incoming ${call.callType === 'video' ? 'Video' : 'Voice'} Call`
              }
            </span>
          </div>
          <div className="text-sm font-bold truncate text-zinc-100">
            {call.isGroup ? `#${call.channelName || 'general'}` : call.initiator.name}
          </div>
          <div className="text-[11px] text-zinc-400 truncate">
            {call.isGroup 
              ? `Started by ${call.initiator.name}`
              : (call.initiator.role ? `${call.initiator.role.replace('_', ' ')} • Kitui` : 'Community Member')}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Decline Button */}
          <button
            onClick={() => onDecline(call.callId)}
            className="h-10 w-10 rounded-2xl bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
            title="Decline Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>

          {/* Accept Button */}
          <button
            onClick={() => onAccept(call)}
            className="h-10 px-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer ring-2 ring-emerald-400"
            title="Accept Call"
          >
            {call.callType === 'video' ? (
              <Video className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
            <span>Join</span>
          </button>
        </div>
      </div>
    </div>
  );
};
