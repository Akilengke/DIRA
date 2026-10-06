import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Send,
  RefreshCw,
  X,
  ShieldCheck,
} from 'lucide-react';
import { sendEmailVerificationCode, resetPasswordWithEmailCode } from '../services/emailAuthService';
import { UserProfile } from '../types';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledEmail?: string;
  onPasswordResetSuccess: (user: UserProfile) => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  prefilledEmail = '',
  onPasswordResetSuccess,
}) => {
  const [step, setStep] = useState<'request' | 'verify_and_set' | 'success'>('request');
  const [email, setEmail] = useState(prefilledEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);

  // Countdown timer for resend
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  if (!isOpen) return null;

  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await sendEmailVerificationCode(cleanEmail, 'password_reset');
      if (result.success) {
        setSuccessMsg(result.message);
        if (result.previewCode) {
          setPreviewCode(result.previewCode);
        }
        setStep('verify_and_set');
        setResendCooldown(60);
      } else {
        setError(result.message || 'Failed to send verification code. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    const cleanPass = newPassword.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanCode) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }
    if (!cleanPass) {
      setError('Please enter your new password.');
      return;
    }
    if (cleanPass.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }
    if (cleanPass !== cleanConfirm) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await resetPasswordWithEmailCode(cleanEmail, cleanCode, cleanPass);
      if (result.success && result.user) {
        setStep('success');
        setTimeout(() => {
          onPasswordResetSuccess(result.user!);
          onClose();
        }, 1800);
      } else {
        setError(result.error || 'Failed to reset password. Please check your verification code.');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="modal-reset-password-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
    >
      <div
        id="modal-reset-password-dialog"
        className="relative w-full max-w-md bg-white border border-zinc-200 rounded-3xl shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-red-50 text-[#991B1B] flex items-center justify-center border border-red-100">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-950">Reset Password</h2>
              <p className="text-xs text-zinc-500 font-medium">Rejesha Nenosiri la Akaunti Yako</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs text-red-800 font-medium">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="flex-1">{successMsg}</span>
          </div>
        )}

        {/* STEP 1: REQUEST VERIFICATION CODE */}
        {step === 'request' && (
          <form onSubmit={handleSendCode} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                Your Registered Real Email Address *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. morrismariko@gmail.com"
                  className="w-full pl-10 pr-3.5 py-3 text-xs bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed">
                We will send an instant 6-digit security code to this email to confirm your identity.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#991B1B] hover:bg-[#7F1D1D] active:scale-[0.99] text-white font-black rounded-2xl text-xs shadow-md border border-red-800 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending Security Code...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Verification Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: ENTER CODE & SET NEW PASSWORD */}
        {step === 'verify_and_set' && (
          <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
            {/* Target Email Banner */}
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-between text-xs text-zinc-700">
              <div className="flex items-center gap-2 truncate">
                <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                <span className="font-bold truncate">{email}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('request');
                  setError(null);
                }}
                className="text-[11px] text-[#991B1B] font-bold hover:underline shrink-0 cursor-pointer"
              >
                Change
              </button>
            </div>

            {/* Preview code helper banner in case user is in preview environment */}
            {previewCode && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-[11px] text-amber-900">
                <span className="font-medium">Verification Code:</span>
                <span className="font-mono font-black text-xs px-2 py-0.5 bg-amber-200 rounded text-amber-950">
                  {previewCode}
                </span>
                <button
                  type="button"
                  onClick={() => setCode(previewCode)}
                  className="text-[10px] text-amber-800 underline font-bold cursor-pointer"
                >
                  Auto-fill
                </button>
              </div>
            )}

            {/* 6-digit Code Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-zinc-700">
                  6-Digit Verification Code *
                </label>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || loading}
                  onClick={() => handleSendCode()}
                  className="text-[11px] text-[#991B1B] hover:underline font-bold disabled:opacity-50 cursor-pointer"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ''));
                    setError(null);
                  }}
                  placeholder="Enter 6-digit code (e.g. 123456)"
                  className="w-full text-center tracking-[6px] font-mono text-base font-black py-2.5 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-[#991B1B] outline-none text-zinc-900"
                />
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                Set New Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter new password (min. 4 characters)"
                  className="w-full pl-10 pr-10 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                Confirm New Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Re-enter your new password"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#991B1B] hover:bg-[#7F1D1D] active:scale-[0.99] text-white font-black rounded-2xl text-xs shadow-md border border-red-800 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving to Database...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Save New Password & Log In</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 'success' && (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-zinc-950">Password Saved Successfully!</h3>
            <p className="text-xs text-zinc-600 max-w-xs mx-auto">
              Your new password has been saved in the database. Logging you in automatically...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
