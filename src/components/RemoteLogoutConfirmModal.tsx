import React from 'react';
import { 
  LogOut, ShieldCheck, CheckCircle2, AlertTriangle, X
} from 'lucide-react';
import { LoggedInDevice } from '../types';

interface RemoteLogoutConfirmModalProps {
  device: LoggedInDevice | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmLogout: (device: LoggedInDevice, reason?: string) => Promise<void> | void;
  isCurrentUserDevice?: boolean;
}

export const RemoteLogoutConfirmModal: React.FC<RemoteLogoutConfirmModalProps> = ({
  device,
  isOpen,
  onClose,
  onConfirmLogout,
  isCurrentUserDevice = false,
}) => {
  if (!isOpen || !device) return null;

  const handleConfirm = () => {
    // Perform instant logout immediately without waiting or freezing
    onConfirmLogout(device, 'Administrative logout from live radar map');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-zinc-950 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <LogOut className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white leading-tight">
                Log Out User from Map
              </h2>
              <span className="text-[10px] text-zinc-400 font-medium">
                Admin session control
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3 text-zinc-700 text-xs">
          {/* Targeted Device Summary */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="font-extrabold text-zinc-950 text-sm">
                {device.userName}
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-200 text-zinc-700">
                {device.deviceType === 'tablet' ? 'Tablet' : device.deviceType === 'desktop' ? 'Desktop' : 'Phone'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-600">
              {device.userDesignation || device.userRole}
              {device.userPhone ? ` • ${device.userPhone}` : ''}
            </div>
            {(device.village || device.subCounty) && (
              <div className="text-[10px] text-zinc-500">
                📍 {device.village ? `${device.village}, ` : ''}{device.subCounty || 'Kitui County'}
              </div>
            )}
          </div>

          {/* User Data Protected Reassurance */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-start gap-2 text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <strong className="block font-bold text-emerald-950 mb-0.5">User data is safe in database</strong>
              This only closes the user's active session and removes their icon from the map. Their account, profile, and login credentials are not deleted, so they can log back in again anytime.
            </div>
          </div>

          {/* Self-logout warning if applicable */}
          {isCurrentUserDevice && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-2.5 flex items-start gap-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[10px] leading-tight">
                <strong>Current Session:</strong> This is your current login. Logging out will return you to the login screen.
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-100 font-bold text-xs transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            id="confirm-admin-logout-device-btn"
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs transition-all shadow-xs flex items-center gap-1.5 border border-red-700 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out User</span>
          </button>
        </div>
      </div>
    </div>
  );
};
