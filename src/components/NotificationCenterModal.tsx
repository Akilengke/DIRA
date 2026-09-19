import React from 'react';
import { 
  X, 
  Bell, 
  CheckCheck, 
  Trash2, 
  AlertTriangle, 
  MapPin, 
  Clock, 
  ChevronRight,
  ShieldAlert,
  Radio,
  Volume2,
  VolumeX,
  ExternalLink
} from 'lucide-react';
import { InAppNotification, DonkeyCase } from '../types';
import { CATEGORY_INFO } from '../data/mockData';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: InAppNotification[];
  cases: DonkeyCase[];
  onMarkAllAsRead: () => void;
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
  onSelectCase: (caseItem: DonkeyCase) => void;
  isSoundEnabled?: boolean;
  onToggleSound?: () => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  notifications,
  cases,
  onMarkAllAsRead,
  onMarkAsRead,
  onClearAll,
  onSelectCase,
  isSoundEnabled = true,
  onToggleSound,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (notif: InAppNotification) => {
    onMarkAsRead(notif.id);
    const matchedCase = cases.find(
      (c) => c.id === notif.caseId || c.trackingCode === notif.trackingCode
    );
    if (matchedCase) {
      onSelectCase(matchedCase);
      onClose();
    }
  };

  const formatRelativeTime = (isoString: string): string => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return 'Recently';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[88vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-zinc-950 text-white p-4 sm:p-5 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-red-600/30 border border-red-500/40 flex items-center justify-center text-red-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white leading-tight">
                  Incident Alerts
                </h3>
                {unreadCount > 0 && (
                  <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                Real-time notifications for reported donkey incidents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onToggleSound && (
              <button
                onClick={onToggleSound}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title={isSoundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
              >
                {isSoundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-zinc-500" />
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="bg-zinc-50 px-4 py-2.5 border-b border-zinc-200 flex items-center justify-between text-xs text-zinc-600 shrink-0">
          <span className="font-semibold text-zinc-500">
            {notifications.length} {notifications.length === 1 ? 'alert received' : 'alerts received'}
          </span>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="flex items-center gap-1 font-bold text-zinc-700 hover:text-zinc-950 px-2 py-1 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mark all read</span>
              </button>
            )}

            {notifications.length > 0 && (
              <button
                onClick={onClearAll}
                className="flex items-center gap-1 font-bold text-zinc-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear history</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 p-2 sm:p-3 space-y-1.5">
          {notifications.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                <Bell className="w-6 h-6 opacity-60" />
              </div>
              <div className="space-y-1 max-w-xs mx-auto">
                <h4 className="text-sm font-bold text-zinc-800">
                  No Incident Alerts Yet
                </h4>
                <p className="text-xs text-zinc-500">
                  Whenever any donkey theft, cruelty, or welfare incident is reported in Kitui, an instant in-app alert will appear here for all logged-in users.
                </p>
              </div>
            </div>
          ) : (
            notifications.map((notif) => {
              const catInfo = CATEGORY_INFO[notif.category] || {
                label: notif.category,
                color: 'bg-zinc-100 text-zinc-800 border-zinc-200',
              };

              const isCritical = notif.urgency === 'critical' || notif.urgency === 'high';

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 text-left relative ${
                    !notif.isRead
                      ? 'bg-red-50/40 border-red-200 hover:bg-red-50 shadow-xs'
                      : 'bg-white border-zinc-200/80 hover:bg-zinc-50'
                  }`}
                >
                  {/* Unread indicator beacon */}
                  {!notif.isRead && (
                    <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-red-600 ring-4 ring-red-100" />
                  )}

                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    isCritical
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                  }`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0 pr-4 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-red-100 text-red-800 border border-red-200">
                        {catInfo.label}
                      </span>
                      <span className="text-[9px] font-mono text-zinc-500 font-bold">
                        #{notif.trackingCode}
                      </span>
                      <span className="text-[10px] text-zinc-400 flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(notif.reportedAt)}
                      </span>
                    </div>

                    <h4 className={`text-xs font-bold leading-snug line-clamp-2 ${
                      !notif.isRead ? 'text-zinc-950 font-extrabold' : 'text-zinc-800'
                    }`}>
                      {notif.title}
                    </h4>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 pt-0.5">
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                        {notif.village || 'Kitui'}{notif.subCounty ? `, ${notif.subCounty}` : ''}
                      </span>
                      <span>•</span>
                      <span>{notif.donkeysCount} {notif.donkeysCount === 1 ? 'donkey' : 'donkeys'}</span>
                    </div>
                  </div>

                  {/* Arrow action */}
                  <div className="shrink-0 self-center text-zinc-400">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="bg-zinc-50 p-3 border-t border-zinc-200 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]">
            <Radio className="w-3.5 h-3.5 text-red-600 animate-pulse" />
            <span>DIRA Cross-Device Alert System Active</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-xl text-xs transition-all shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
