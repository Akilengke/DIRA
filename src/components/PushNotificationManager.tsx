import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  BellRing, 
  CheckCircle2, 
  AlertTriangle, 
  Smartphone, 
  PhoneCall, 
  MessageSquare, 
  RefreshCw,
  Info,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { UserProfile } from '../types';
import { 
  checkPushStatus, 
  subscribeToPushNotifications, 
  unsubscribeFromPushNotifications, 
  sendTestPushNotification, 
  onPushStatusChange, 
  PushStatus 
} from '../services/pushNotificationService';

interface PushNotificationManagerProps {
  currentUser: UserProfile | null;
  className?: string;
  compact?: boolean;
}

export const PushNotificationManager: React.FC<PushNotificationManagerProps> = ({
  currentUser,
  className = '',
  compact = false,
}) => {
  const [status, setStatus] = useState<PushStatus>({
    isSupported: true,
    permission: 'default',
    isSubscribed: false,
  });
  const [loading, setLoading] = useState(false);
  const [testingType, setTestingType] = useState<'call' | 'chat' | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    checkPushStatus().then(setStatus);
    const unsub = onPushStatusChange(setStatus);
    return unsub;
  }, []);

  const handleEnablePush = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await subscribeToPushNotifications(currentUser);
      if (res.success) {
        setFeedback({
          message: 'Phone Push Notifications successfully activated! You will receive calls and chat messages even when DIRA is closed.',
          type: 'success',
        });
        checkPushStatus().then(setStatus);
      } else {
        setFeedback({
          message: res.error || 'Failed to activate phone notifications.',
          type: 'error',
        });
      }
    } catch (e: any) {
      setFeedback({
        message: e?.message || 'Error configuring notifications.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisablePush = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      await unsubscribeFromPushNotifications();
      setFeedback({
        message: 'Push notifications disabled on this device.',
        type: 'info',
      });
      checkPushStatus().then(setStatus);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async (type: 'call' | 'chat') => {
    setTestingType(type);
    setFeedback(null);
    try {
      const res = await sendTestPushNotification(type);
      if (res.success) {
        setFeedback({
          message: type === 'call'
            ? '📞 Test Call dispatched! Lock or close your phone now to test the ring.'
            : '💬 Test Chat dispatched! Check your phone notification shade.',
          type: 'success',
        });
      } else {
        setFeedback({
          message: res.error || 'Failed to send test notification.',
          type: 'error',
        });
      }
    } finally {
      setTestingType(null);
    }
  };

  if (compact) {
    return (
      <div className={`p-3 rounded-2xl border ${status.isSubscribed ? 'bg-emerald-50/80 border-emerald-200' : 'bg-amber-50/80 border-amber-200'} ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${status.isSubscribed ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <span>Phone Push Notifications</span>
                {status.isSubscribed ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Active</span>
                ) : (
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">Inactive</span>
                )}
              </div>
              <p className="text-[11px] text-zinc-600">
                {status.isSubscribed 
                  ? 'Calls & messages ring when phone app is closed.' 
                  : 'Enable to receive incoming calls when closed.'}
              </p>
            </div>
          </div>
          {status.isSubscribed ? (
            <button
              onClick={() => handleSendTest('call')}
              disabled={Boolean(testingType)}
              className="px-2.5 py-1 text-xs font-bold bg-white text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-300 shadow-2xs transition-colors cursor-pointer shrink-0"
            >
              {testingType === 'call' ? 'Sending...' : 'Test Ring'}
            </button>
          ) : (
            <button
              onClick={handleEnablePush}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
            >
              {loading ? 'Enabling...' : 'Enable'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200 shadow-sm space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-xs ${
            status.isSubscribed 
              ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white' 
              : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white'
          }`}>
            <BellRing className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-zinc-900 text-sm sm:text-base">
                Phone Push Notifications
              </h3>
              {status.isSubscribed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Active on this Phone
                </span>
              ) : status.permission === 'denied' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                  <AlertTriangle className="w-3 h-3 text-red-600" />
                  Permission Denied
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  <Zap className="w-3 h-3 text-amber-600" />
                  Setup Needed
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 mt-0.5">
              Receive voice & video calls and community chat alerts <strong>even when DIRA is completely closed on your phone</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`p-3 rounded-2xl text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' 
            : feedback.type === 'error'
            ? 'bg-red-50 text-red-900 border border-red-200'
            : 'bg-zinc-100 text-zinc-800 border border-zinc-200'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
          <button 
            type="button" 
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-zinc-600 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Primary Action Button */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {!status.isSubscribed ? (
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={loading}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
            {loading ? 'Activating Device Alerts...' : 'Turn On Phone Push Notifications'}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSendTest('call')}
              disabled={Boolean(testingType)}
              className="px-3.5 py-2 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white rounded-xl text-xs font-extrabold shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
            >
              {testingType === 'call' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PhoneCall className="w-3.5 h-3.5" />
              )}
              {testingType === 'call' ? 'Sending Call...' : 'Test Incoming Call (Lock Phone to Test)'}
            </button>

            <button
              type="button"
              onClick={() => handleSendTest('chat')}
              disabled={Boolean(testingType)}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-900 active:scale-[0.98] text-white rounded-xl text-xs font-extrabold shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
            >
              {testingType === 'chat' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <MessageSquare className="w-3.5 h-3.5" />
              )}
              {testingType === 'chat' ? 'Sending Chat...' : 'Test Chat Message'}
            </button>

            <button
              type="button"
              onClick={handleDisablePush}
              disabled={loading}
              className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Disable on this device
            </button>
          </div>
        )}
      </div>

      {/* Feature Bullet Points */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-600 pt-1 border-t border-zinc-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Rings phone lock screen for urgent 1-on-1 & Group calls</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Shows chat previews with one-tap quick response</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Wakes up phone background worker even when app is closed</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Persistent VAPID Web Push protocol compliant with Android & iOS</span>
        </div>
      </div>
    </div>
  );
};
