import React, { useState } from 'react';
import { 
  KeyRound, Lock, Eye, EyeOff, CheckCircle2, 
  AlertCircle, X, Shield, ArrowRight 
} from 'lucide-react';
import { UserProfile } from '../types';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onUpdatePassword: (newPassword: string) => boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdatePassword,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen || !currentUser) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // If currentUser has an existing password, verify it
    const expectedPassword = currentUser.password || '1234';
    if (currentPassword.trim() !== expectedPassword.trim()) {
      setError('Current password is incorrect. (Default is 1234 for officer accounts)');
      return;
    }

    if (newPassword.length < 4) {
      setError('New password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match. Please verify.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from current password.');
      return;
    }

    const success = onUpdatePassword(newPassword);
    if (success) {
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
      }, 1400);
    } else {
      setError('Failed to update password. Please try again.');
    }
  };

  const handleModalClose = () => {
    setError(null);
    setIsSuccess(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl text-white space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-950/80 border border-red-800 flex items-center justify-center text-red-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black font-display text-white">
                Change Password / PIN
              </h3>
              <p className="text-[11px] text-zinc-400">
                {currentUser.name} {currentUser.roleTitle ? `(${currentUser.roleTitle})` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert */}
        {isSuccess ? (
          <div className="bg-emerald-950/80 border border-emerald-700/80 rounded-2xl p-4 text-center space-y-2 py-6 animate-in zoom-in-95">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-black text-emerald-100">
              Password Changed Successfully!
            </h4>
            <p className="text-xs text-emerald-300">
              Your new password is now active for all future logins.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {error && (
              <div className="bg-red-950/70 border border-red-800/80 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{error}</div>
              </div>
            )}

            {/* Current Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-zinc-300">
                  Current Password / PIN *
                </label>
                <span className="text-[10px] text-zinc-500">
                  Default: 1234
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                New Password / PIN *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={4}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 4 characters / digits"
                  className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Confirm New Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full pl-10 pr-3 py-2.5 text-xs sm:text-sm bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] outline-none"
                />
              </div>
            </div>

            {/* Password security note */}
            <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl flex items-center gap-2 text-[11px] text-zinc-400">
              <Shield className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                Your password secures confidential incident dispatches, triage records, and caller identities.
              </span>
            </div>

            {/* Submit & Cancel */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-change-password"
                type="submit"
                className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md border border-red-700 active:scale-95 transition-all"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Save New Password</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
