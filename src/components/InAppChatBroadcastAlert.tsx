import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  X, 
  ChevronRight, 
  Volume2, 
  Image as ImageIcon, 
  Mic, 
  Radio, 
  User,
  Shield
} from 'lucide-react';
import { DiraMessage } from '../types';

interface InAppChatBroadcastAlertProps {
  message: DiraMessage | null;
  onDismiss: () => void;
  onOpenChat: (channelId: string) => void;
}

const CHANNEL_LABELS: Record<string, string> = {
  general: 'Wanajamii Alerts',
  cases: 'Case Discussions',
  rescue: 'Search & Rescue',
  officers: 'Officers Desk',
};

export const InAppChatBroadcastAlert: React.FC<InAppChatBroadcastAlertProps> = ({
  message,
  onDismiss,
  onOpenChat,
}) => {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const DURATION_MS = 6500;
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!message) {
      setProgress(100);
      return;
    }

    setProgress(100);
    const startTime = Date.now();
    let elapsedBeforePause = 0;

    const interval = setInterval(() => {
      if (isPaused) return;

      const elapsed = Date.now() - startTime + elapsedBeforePause;
      const remaining = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 100);

    progressIntervalRef.current = interval;

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [message, isPaused, onDismiss]);

  if (!message) return null;

  const channelName = CHANNEL_LABELS[message.channelId] || `#${message.channelId}`;
  const isOfficer = ['super_admin', 'super_user', 'chief_officer', 'field_officer', 'veterinary_officer'].includes(message.senderRole);

  return (
    <aside 
      id="in-app-chat-broadcast-toast"
      className="fixed top-3 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-md z-50 pointer-events-auto transition-all animate-in slide-in-from-top-4 duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="status"
      aria-live="polite"
      aria-label={`New message from ${message.senderName}`}
    >
      <div className="rounded-2xl border border-emerald-500/40 bg-zinc-950/95 text-white shadow-xl shadow-emerald-950/30 backdrop-blur-md overflow-hidden transition-all">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-white/10 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-black tracking-wider uppercase text-[10.5px] text-emerald-400 flex items-center gap-1.5 truncate">
              <Radio className="w-3 h-3 animate-pulse shrink-0" />
              Chat Broadcast
            </span>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded font-bold truncate">
              {channelName}
            </span>
          </div>

          <button
            id="btn-dismiss-chat-broadcast"
            onClick={onDismiss}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all touch-manipulation ml-2 shrink-0"
            title="Dismiss notification"
            aria-label="Dismiss chat alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Content Area */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-xs ${
              isOfficer ? 'bg-gradient-to-tr from-purple-700 to-indigo-600' : 'bg-gradient-to-tr from-emerald-600 to-teal-500'
            }`}>
              {isOfficer ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-white truncate max-w-[170px]">
                  {message.senderName}
                </span>
                {isOfficer ? (
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-900/90 text-purple-200 border border-purple-700">
                    Officer
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    Member
                  </span>
                )}
                <span className="text-[10px] text-zinc-400 ml-auto">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Message text or media badge */}
              <p className="text-xs text-zinc-200 line-clamp-2 mt-1 leading-relaxed">
                {message.content || (
                  <span className="italic text-zinc-400">
                    {message.voiceNote ? '🎙️ Sent a voice note' : message.mediaAttachment ? '📎 Shared an attachment' : 'Sent an update'}
                  </span>
                )}
              </p>

              {/* Attachment badges if present */}
              {(message.mediaAttachment || message.voiceNote || message.caseTrackingCode) && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {message.voiceNote && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-red-950/80 text-red-300 border border-red-800 px-1.5 py-0.5 rounded font-medium">
                      <Mic className="w-2.5 h-2.5" />
                      Voice Note ({message.voiceNote.durationSeconds}s)
                    </span>
                  )}
                  {message.mediaAttachment && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-blue-950/80 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded font-medium">
                      <ImageIcon className="w-2.5 h-2.5" />
                      {message.mediaAttachment.fileName}
                    </span>
                  )}
                  {message.caseTrackingCode && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded font-mono font-bold">
                      Case #{message.caseTrackingCode}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Button: Open Chat */}
          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              id="btn-open-chat-from-toast"
              onClick={() => {
                onOpenChat(message.channelId);
                onDismiss();
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 touch-manipulation cursor-pointer border border-emerald-500"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Open Chat</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar timer */}
        <div className="w-full bg-white/10 h-1">
          <div 
            className="h-full bg-emerald-500 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </aside>
  );
};
