import React, { useState, useEffect } from 'react';
import { 
  Shield, User, Phone, MapPin, CheckCircle2, 
  Building2, LogIn, UserPlus, ArrowRight, Check,
  Lock, AlertCircle, Sparkles, KeyRound, Smartphone,
  Radio, Send, ShieldCheck, Mail, Eye, EyeOff, RefreshCw
} from 'lucide-react';
import { UserProfile, UserRole, Coordinates } from '../types';
import { KITUI_SUB_COUNTIES, generateOtpForPhone, SUPER_ADMIN_ACCOUNT } from '../data/mockData';
import { DiraLogo } from './DiraLogo';
import { GoogleSignInButton } from './GoogleSignInButton';
import { googleSignIn } from '../services/firebaseAuth';
import { registerCurrentDeviceLogin } from '../services/deviceTrackingService';
import { NAIROBI_COORDINATES, getStoredLastKnownLocation } from '../services/locationService';
import { saveUserToDb, getAllUsersFromDb, authenticateWithEmailOrPhone } from '../services/db';
import { ResetPasswordModal } from './ResetPasswordModal';
import { sendEmailVerificationCode, verifyEmailCode } from '../services/emailAuthService';

const SAVED_PROFILES_KEY = 'kaa_rada_saved_profiles_v2';

interface AuthScreenProps {
  onLogin: (user: UserProfile) => void;
  noticeMessage?: string | null;
  onClearNotice?: () => void;
}

interface SmsNotification {
  phone: string;
  recipientName: string;
  code: string;
  timestamp: string;
  messageText: string;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ 
  onLogin,
  noticeMessage,
  onClearNotice,
}) => {
  // Two clean primary modes: Sign Up (Sajili) or Log In (Ingia)
  const [activeTab, setActiveTab] = useState<'signup' | 'login'>('login');

  // Sign Up Role Selector: Super User vs Primary User
  const [selectedRole, setSelectedRole] = useState<UserRole>('primary_user');

  // Streamlined Sign Up Fields
  const [fullName, setFullName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [designation, setDesignation] = useState('');

  // Email Verification Code State
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [isVerifyingEmailCode, setIsVerifyingEmailCode] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCodePreview, setEmailCodePreview] = useState<string | null>(null);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);

  // Forgot Password Modal State
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);

  // Login State: Email or Phone Number + Password
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');

  // OTP State (Alternative Phone Login)
  const [otpInput, setOtpInput] = useState('');
  const [activeOtpCode, setActiveOtpCode] = useState<string | null>(null);
  const [otpTargetUser, setOtpTargetUser] = useState<UserProfile | null>(null);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [activeSms, setActiveSms] = useState<SmsNotification | null>(null);

  // States
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geoLocating, setGeoLocating] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Saved Registered Profiles
  const [savedProfiles, setSavedProfiles] = useState<UserProfile[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_PROFILES_KEY);
      if (raw) {
        const parsed: UserProfile[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (p) =>
              !p.id.startsWith('super-user-') &&
              !p.id.startsWith('pri-user-') &&
              !p.id.startsWith('usr-officer-') &&
              !p.id.startsWith('usr-elder-')
          );
        }
      }
    } catch (e) {
      console.error('Error loading saved profiles:', e);
    }
    return [];
  });

  // Sync users from database (Firestore & IndexedDB) on mount
  useEffect(() => {
    let isMounted = true;
    getAllUsersFromDb()
      .then((users) => {
        if (isMounted && users && users.length > 0) {
          setSavedProfiles(users);
        }
      })
      .catch((err) => console.warn('Could not load users from database:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  // Countdown timer for email code resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (emailResendCooldown > 0) {
      timer = setTimeout(() => setEmailResendCooldown(emailResendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [emailResendCooldown]);

  const saveProfileToList = (newProfile: UserProfile) => {
    setSavedProfiles((prev) => {
      const exists = prev.some((p) => p.id === newProfile.id || (p.phone && p.phone === newProfile.phone) || (p.email && p.email === newProfile.email));
      const updated = exists 
        ? prev.map((p) => (p.id === newProfile.id || (p.email && p.email === newProfile.email)) ? newProfile : p)
        : [newProfile, ...prev];
      try {
        localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save profile:', e);
      }
      return updated;
    });

    // Automatically persist to Firestore and IndexedDB
    saveUserToDb(newProfile).catch((err) => {
      console.warn('Could not save user to database:', err);
    });
  };

  /**
   * Acquire phone coordinates via GPS and link to DIRA map
   */
  const capturePhoneLocationAndFinish = (profile: UserProfile) => {
    if (!profile) {
      setGeoLocating(false);
      return;
    }
    setGeoLocating(true);
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: Coordinates = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          const updatedProfile: UserProfile = {
            ...profile,
            coordinates: coords,
            lastKnownLocation: {
              coordinates: coords,
              timestamp: new Date().toISOString(),
              village: profile.village,
              subCounty: profile.subCounty,
            },
          };
          saveProfileToList(updatedProfile);
          registerCurrentDeviceLogin(updatedProfile, coords, pos.coords.accuracy);
          setGeoLocating(false);
          onLogin(updatedProfile);
        },
        (err) => {
          console.warn('Geolocation capture fallback:', err.message);
          const defaultCoords = profile?.coordinates || getStoredLastKnownLocation() || NAIROBI_COORDINATES;
          registerCurrentDeviceLogin(profile, defaultCoords, 25);
          setGeoLocating(false);
          onLogin(profile);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    } else {
      const defaultCoords = profile?.coordinates || getStoredLastKnownLocation() || NAIROBI_COORDINATES;
      registerCurrentDeviceLogin(profile, defaultCoords, 25);
      setGeoLocating(false);
      onLogin(profile);
    }
  };

  /**
   * Send 6-digit verification code to user's real email
   */
  const handleSendEmailVerification = async () => {
    setAuthError(null);
    setAuthSuccessMessage(null);
    const cleanEmail = emailAddress.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Please enter a valid real email address (e.g. name@gmail.com) to receive the code.');
      return;
    }

    setIsSendingEmailCode(true);
    try {
      const result = await sendEmailVerificationCode(cleanEmail, 'signup_verification', fullName.trim());
      if (result.success) {
        setEmailCodeSent(true);
        if (result.previewCode) {
          setEmailCodePreview(result.previewCode);
        }
        setEmailResendCooldown(60);
        setAuthSuccessMessage(result.message || `Verification code sent to ${cleanEmail}. Check your inbox and spam folder.`);
      } else {
        setAuthError(result.message || 'Failed to send verification code. Please try again.');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Error dispatching verification code.');
    } finally {
      setIsSendingEmailCode(false);
    }
  };

  /**
   * Confirm the 6-digit email code
   */
  const handleConfirmEmailCode = async () => {
    setAuthError(null);
    const cleanEmail = emailAddress.trim().toLowerCase();
    const cleanCode = emailVerificationCode.trim();

    if (!cleanCode) {
      setAuthError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    setIsVerifyingEmailCode(true);
    try {
      const result = await verifyEmailCode(cleanEmail, cleanCode, 'signup_verification');
      if (result.verified) {
        setIsEmailVerified(true);
        setAuthSuccessMessage('✓ Email address verified successfully! You can now complete your sign up.');
      } else {
        setAuthError(result.message || 'Invalid verification code. Please check your email.');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifyingEmailCode(false);
    }
  };

  /**
   * Handle simple, streamlined user sign up:
   * Sets up user's own password, validates fields, saves to database, and logs in.
   */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMessage(null);

    const cleanName = fullName.trim();
    const cleanEmail = emailAddress.trim().toLowerCase();
    const cleanPhone = phoneNumber.trim();
    const cleanPass = password.trim();
    const cleanConfirm = confirmPassword.trim();
    const cleanDesignation = designation.trim() || (selectedRole === 'super_user' ? 'Field Security Officer' : 'Community Member');

    if (!cleanName) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Please enter a valid real email address to complete your registration.');
      return;
    }
    if (!cleanPass) {
      setAuthError('Please create your password (minimum 4 characters).');
      return;
    }
    if (cleanPass.length < 4) {
      setAuthError('Password must be at least 4 characters long.');
      return;
    }
    if (cleanConfirm && cleanPass !== cleanConfirm) {
      setAuthError('Passwords do not match. Please verify your password confirmation.');
      return;
    }

    setIsSubmitting(true);

    const isSuper = selectedRole === 'super_user';

    const newProfile: UserProfile = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: selectedRole,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone || `07${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: cleanPass,
      subCounty: 'Kitui Central',
      village: isSuper ? 'Command Base' : 'Kitui Central',
      roleTitle: cleanDesignation,
      designation: cleanDesignation,
      department: isSuper ? cleanDesignation : undefined,
      organization: isSuper ? 'Kitui County Security & Welfare' : 'Caritas Kitui Community Network',
      badgeNumber: isSuper
        ? `DIRA-OFF-${Math.floor(100 + Math.random() * 900)}`
        : undefined,
      isOnline: true,
    };

    saveProfileToList(newProfile);
    setIsSubmitting(false);

    // Pick phone location and log in
    capturePhoneLocationAndFinish(newProfile);
  };

  /**
   * Request OTP code for phone login (alternative fallback)
   */
  const handleRequestOtp = (phoneOrUser: string | UserProfile) => {
    setAuthError(null);
    let targetPhone = '';
    let targetProfile: UserProfile | null = null;

    if (typeof phoneOrUser === 'string') {
      targetPhone = phoneOrUser.trim();
      if (!targetPhone) {
        setAuthError('Please enter your phone number or "admin" to receive login SMS.');
        return;
      }
      if (targetPhone.toLowerCase() === 'admin') {
        targetProfile = SUPER_ADMIN_ACCOUNT;
      } else {
        const digits = targetPhone.replace(/\D/g, '');
        const found = savedProfiles.find((p) => {
          const pDigits = p.phone.replace(/\D/g, '');
          return (digits.length >= 7 && pDigits.includes(digits)) || p.phone.includes(targetPhone) || (p.role === 'super_admin' && targetPhone.toLowerCase() === 'admin');
        });

        if (found) {
          targetProfile = found;
        } else {
          targetProfile = {
            id: `usr-direct-${Date.now()}`,
            name: `User (${targetPhone})`,
            phone: targetPhone,
            role: 'primary_user',
            roleTitle: 'Community Member',
            subCounty: 'Kitui Central',
            village: 'Kitui Central',
            isOnline: true,
          };
          saveProfileToList(targetProfile);
        }
      }
    } else {
      targetProfile = phoneOrUser;
      targetPhone = targetProfile.phone;
    }

    setOtpTargetUser(targetProfile);
    const code = generateOtpForPhone(targetPhone);
    setActiveOtpCode(code);
    setIsOtpSent(true);

    const sms: SmsNotification = {
      phone: targetPhone,
      recipientName: targetProfile.name,
      code,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      messageText: `DIRA KAA RADA: Nambari yako ya siri ya kuingia ni [${code}]. Usishiriki na mtu yeyote. Halali kwa dakika 10.`,
    };

    setActiveSms(sms);
  };

  const handleVerifyLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    // If user is using SMS OTP fallback
    if (loginMethod === 'otp' && isOtpSent && otpTargetUser) {
      const entered = otpInput.trim();
      const expected = activeOtpCode || generateOtpForPhone(otpTargetUser.phone);
      const defaultPin = otpTargetUser.password || '1234';

      if (entered === expected || entered === defaultPin.trim() || (otpTargetUser.role === 'super_admin' && entered.toLowerCase() === 'admin')) {
        capturePhoneLocationAndFinish(otpTargetUser);
      } else {
        setAuthError(`Invalid code. Enter SMS code [${expected}], default PIN 1234, or 'admin'.`);
      }
      return;
    }

    const query = loginIdentifier.trim();
    const pass = loginPassword.trim();

    if (!query) {
      setAuthError('Please enter your email or phone number.');
      return;
    }

    if (!pass) {
      setAuthError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const authResult = await authenticateWithEmailOrPhone(query, pass);
      if (authResult.success && authResult.user) {
        saveProfileToList(authResult.user);
        capturePhoneLocationAndFinish(authResult.user);
      } else {
        setAuthError(authResult.error || 'Authentication failed. Please check your credentials.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(err?.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectSelect = (profile: UserProfile) => {
    capturePhoneLocationAndFinish(profile);
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setAuthError(null);
    try {
      const { user } = await googleSignIn();
      const userEmail = user.email || '';
      const userName = user.displayName || 'Google User';

      const matched = savedProfiles.find((p) => 
        (p.email && p.email.toLowerCase() === userEmail.toLowerCase()) || 
        (p.name.toLowerCase() === userName.toLowerCase())
      );

      if (matched) {
        capturePhoneLocationAndFinish(matched);
      } else {
        const newGoogleProfile: UserProfile = {
          id: `usr-google-${user.uid.slice(0, 8)}`,
          name: userName,
          email: userEmail,
          phone: user.phoneNumber || '0700 000 000',
          role: 'primary_user',
          roleTitle: 'Community Reporter',
          subCounty: 'Kitui Central',
          village: 'Kitui Central',
          isOnline: true,
        };
        saveProfileToList(newGoogleProfile);
        capturePhoneLocationAndFinish(newGoogleProfile);
      }
    } catch (err: any) {
      console.error('Google Sign In failed:', err);
      setAuthError('Google sign in was cancelled or failed. Please use email or password.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-3 sm:p-4 text-zinc-900 relative overflow-hidden font-sans">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

      {/* Simulated Live SMS Alert for Phone Verification */}
      {activeSms && (
        <div className="fixed top-4 right-4 z-50 max-w-sm w-full bg-zinc-900 border-2 border-emerald-500 rounded-2xl p-3 shadow-2xl text-white animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-zinc-800">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Simulated SMS Alert • {activeSms.phone}</span>
            </div>
            <button 
              onClick={() => setActiveSms(null)}
              className="text-zinc-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-zinc-300 leading-snug">
            {activeSms.messageText}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">{activeSms.timestamp}</span>
            <button
              onClick={() => {
                setOtpInput(activeSms.code);
                setActiveSms(null);
              }}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold cursor-pointer"
            >
              Auto-fill Code
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md bg-white border border-zinc-200/80 rounded-3xl shadow-2xl overflow-hidden my-auto backdrop-blur-md">
        
        {/* Header Branding */}
        <div className="bg-zinc-100/90 border-b border-zinc-200 p-4 sm:p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <DiraLogo className="h-10 w-auto" />
            <div className="text-left leading-tight">
              <span className="text-xl font-black tracking-tight text-zinc-950 block">DIRA</span>
              <span className="text-[10px] font-black uppercase text-[#991B1B] tracking-wider block">Kaa Rada</span>
            </div>
          </div>
          <p className="text-xs text-zinc-600 font-medium">
            Caritas Kitui • Donkey Welfare & Incident Reporting Network
          </p>

          {/* Clean Segmented Tab Buttons: Sign Up vs Log In */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-200/80 rounded-2xl text-xs font-bold mt-4">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signup');
                setAuthError(null);
                setAuthSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'signup'
                  ? 'bg-white text-zinc-950 shadow-xs border border-zinc-300 font-black'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-[#991B1B]" />
              <span>Sign Up (Sajili)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setAuthError(null);
                setAuthSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-white text-zinc-950 shadow-xs border border-zinc-300 font-black'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-700" />
              <span>Log In (Ingia)</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto max-h-[75vh] space-y-4">
          
          {/* Remote Administrative Revocation / Session Notice */}
          {noticeMessage && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs flex items-start justify-between gap-2 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-950">Notice</div>
                  <p className="text-amber-800 text-[11px] mt-0.5">{noticeMessage}</p>
                </div>
              </div>
              {onClearNotice && (
                <button
                  type="button"
                  onClick={onClearNotice}
                  className="text-amber-700 hover:text-amber-950 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Error Message */}
          {authError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#991B1B]" />
              <span>{authError}</span>
            </div>
          )}

          {/* Success Message */}
          {authSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{authSuccessMessage}</span>
            </div>
          )}

          {/* TAB 1: SIMPLE, STREAMLINED SIGN UP */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              
              {/* Account Type Selector (Clean Segmented Buttons) */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-600 tracking-wider mb-1.5">
                  Account Type (Aina ya Mtumiaji)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('primary_user')}
                    className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedRole === 'primary_user'
                        ? 'bg-red-50/70 border-[#991B1B] text-zinc-950 shadow-xs'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <User className={`w-4 h-4 ${selectedRole === 'primary_user' ? 'text-[#991B1B]' : 'text-zinc-500'}`} />
                      <span className="text-xs font-black">Community</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Reporter, Elder, Donkey Owner</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedRole('super_user')}
                    className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedRole === 'super_user'
                        ? 'bg-amber-50/80 border-amber-600 text-zinc-950 shadow-xs'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Shield className={`w-4 h-4 ${selectedRole === 'super_user' ? 'text-amber-700' : 'text-zinc-500'}`} />
                      <span className="text-xs font-black">Officer / Admin</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Police OCS, Vet, ACC, DCC</p>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Full Name (Jina Kamili) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Morris Mariko, Chief Muthui"
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                  />
                </div>
              </div>

              {/* Real Email Address + Verification Trigger */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    Real Email Address (Barua Pepe) *
                  </label>
                  {isEmailVerified && (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Verified</span>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={emailAddress}
                    onChange={(e) => {
                      setEmailAddress(e.target.value);
                      setIsEmailVerified(false);
                      setAuthError(null);
                    }}
                    placeholder="e.g. morrismariko@gmail.com"
                    className="w-full pl-9 pr-24 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                  />
                  {!isEmailVerified && (
                    <button
                      type="button"
                      disabled={isSendingEmailCode || emailResendCooldown > 0}
                      onClick={handleSendEmailVerification}
                      className="absolute inset-y-1.5 right-1.5 px-2.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white text-[10px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      {isSendingEmailCode ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      <span>
                        {emailResendCooldown > 0 ? `${emailResendCooldown}s` : 'Get Code'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Email Verification Code Row (when sent or entered) */}
                {emailCodeSent && !isEmailVerified && (
                  <div className="mt-2 p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-600">
                      <span>Enter the 6-digit code sent to your inbox:</span>
                      {emailCodePreview && (
                        <button
                          type="button"
                          onClick={() => setEmailVerificationCode(emailCodePreview)}
                          className="text-[#991B1B] font-bold underline text-[10px] cursor-pointer"
                        >
                          Auto-fill: {emailCodePreview}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={emailVerificationCode}
                        onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="6-digit code"
                        className="flex-1 px-3 py-1.5 text-center font-mono font-bold tracking-widest text-xs bg-white border border-zinc-300 rounded-lg outline-none focus:ring-2 focus:ring-[#991B1B]"
                      />
                      <button
                        type="button"
                        disabled={isVerifyingEmailCode || !emailVerificationCode}
                        onClick={handleConfirmEmailCode}
                        className="px-3 py-1.5 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                      >
                        {isVerifyingEmailCode ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        <span>Verify</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Set Up Your Own Password */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Create Your Password (Nenosiri Lako) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose your password (min 4 characters)"
                    className="w-full pl-9 pr-10 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Confirm Password (Thibitisha Nenosiri) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-9 pr-10 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Optional Phone Number */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    Phone Number (Nambari ya Simu)
                  </label>
                  <span className="text-[10px] text-zinc-400">Optional for SMS radar alerts</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="e.g. 0712 345 678"
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-mono font-medium text-zinc-900"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || geoLocating}
                className="w-full py-3 bg-[#991B1B] hover:bg-[#7F1D1D] active:scale-[0.99] text-white font-black rounded-2xl text-xs shadow-md border border-red-800 flex items-center justify-center gap-2 transition-all cursor-pointer mt-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {geoLocating ? 'Acquiring Phone GPS...' : 'Sign Up & Save Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Log In Icon at the bottom of the sign up part */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setAuthError(null);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 border border-zinc-200 text-zinc-800 hover:text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <LogIn className="w-4 h-4 text-emerald-600" />
                  <span>Already have an account? Log In</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: LOG IN (EMAIL OR PHONE + PASSWORD + FORGOT PASSWORD RESET) */}
          {activeTab === 'login' && (
            <div className="space-y-4">
              
              {/* Previously Registered Accounts on this Device */}
              {savedProfiles.length > 0 && (
                <div className="space-y-2 pb-3 border-b border-zinc-200">
                  <div className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                    Registered Accounts on This Device ({savedProfiles.length})
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {savedProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200 hover:border-zinc-400 flex items-center justify-between gap-2 transition-all"
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                            profile.role === 'super_user'
                              ? 'bg-amber-950 text-amber-400'
                              : 'bg-red-950 text-red-200'
                          }`}>
                            {profile.role === 'super_user' ? <Shield className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-bold text-zinc-950 truncate">
                              {profile.name}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate">
                              <strong className={profile.role === 'super_user' ? 'text-amber-700' : 'text-red-700'}>
                                {profile.role === 'super_user' ? 'Super User' : 'Primary User'}
                              </strong>
                              {' • '}{profile.email || profile.phone}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setLoginIdentifier(profile.email || profile.phone || '');
                            if (profile.password) setLoginPassword(profile.password);
                            handleDirectSelect(profile);
                          }}
                          className="px-3 py-1.5 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-[10px] font-black rounded-xl border border-red-800 shrink-0 shadow-xs cursor-pointer"
                        >
                          Log In →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Super Admin Direct Access Banner / Button */}
              <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-purple-900 text-purple-200 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-black text-purple-950 flex items-center gap-1.5">
                      <span>Super Admin Account</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-purple-200 text-purple-900 font-mono font-bold rounded">admin / admin</span>
                    </div>
                    <div className="text-[10px] text-purple-700 truncate">
                      Manage Firebase users, add/delete accounts & permissions
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-super-admin-direct-login"
                  onClick={() => {
                    setLoginIdentifier('admin');
                    setLoginPassword('admin');
                    capturePhoneLocationAndFinish(SUPER_ADMIN_ACCOUNT);
                  }}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 active:scale-95 text-white text-[10px] font-black rounded-xl border border-purple-900 shadow-xs cursor-pointer shrink-0 flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Admin Login</span>
                </button>
              </div>

              {/* Email or Phone Number + Password Form */}
              <form onSubmit={handleVerifyLogin} className="space-y-3">
                {/* Email or Phone Input */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Email or Phone Number (Barua Pepe au Simu) *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                      {loginIdentifier.includes('@') ? (
                        <Mail className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Phone className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={loginIdentifier}
                      onChange={(e) => {
                        setLoginIdentifier(e.target.value);
                        setAuthError(null);
                      }}
                      placeholder="e.g. user@gmail.com, 0712 345 678, or admin"
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                    />
                  </div>
                </div>

                {/* Password or SMS OTP toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-zinc-700">
                      {loginMethod === 'password' ? 'Password (Nenosiri) *' : 'SMS OTP Code *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (loginMethod === 'password') {
                          setLoginMethod('otp');
                          handleRequestOtp(loginIdentifier);
                        } else {
                          setLoginMethod('password');
                          setIsOtpSent(false);
                        }
                      }}
                      className="text-[11px] text-[#991B1B] hover:underline font-bold cursor-pointer"
                    >
                      {loginMethod === 'password' ? '📱 Login with SMS Code' : '🔑 Login with Password'}
                    </button>
                  </div>

                  {loginMethod === 'password' ? (
                    <div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          type={showLoginPassword ? 'text' : 'password'}
                          required
                          value={loginPassword}
                          onChange={(e) => {
                            setLoginPassword(e.target.value);
                            setAuthError(null);
                          }}
                          placeholder="Enter your password (default 1234 or admin)"
                          className="w-full pl-9 pr-10 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        >
                          {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Forgot Password Link */}
                      <div className="flex items-center justify-end mt-1.5">
                        <button
                          type="button"
                          onClick={() => setIsResetPasswordOpen(true)}
                          className="text-[11px] font-bold text-[#991B1B] hover:text-[#7F1D1D] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Forgot Password? (Umesahau nenosiri?)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={otpInput}
                          onChange={(e) => setOtpInput(e.target.value)}
                          placeholder={`Enter SMS Code (e.g. ${activeOtpCode || '1234'})`}
                          className="flex-1 px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleRequestOtp(loginIdentifier)}
                          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Resend</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || geoLocating}
                  className="w-full py-2.5 bg-[#991B1B] hover:bg-[#7F1D1D] active:scale-[0.99] text-white text-xs font-black rounded-2xl border border-red-800 shadow-xs mt-3 cursor-pointer flex items-center justify-center gap-2 transition-all"
                >
                  <LogIn className="w-4 h-4" />
                  <span>
                    {geoLocating ? 'Detecting Location & Logging In...' : 'Log In (Ingia)'}
                  </span>
                </button>
              </form>

              {/* Google Sign In */}
              <div className="pt-3 border-t border-zinc-200 space-y-2">
                <GoogleSignInButton
                  onClick={handleGoogleLogin}
                  loading={isGoogleLoading}
                  label="Sign in with Google"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reset Password Modal */}
      <ResetPasswordModal
        isOpen={isResetPasswordOpen}
        onClose={() => setIsResetPasswordOpen(false)}
        prefilledEmail={loginIdentifier.includes('@') ? loginIdentifier : ''}
        onPasswordResetSuccess={(updatedUser) => {
          setLoginIdentifier(updatedUser.email || updatedUser.phone || '');
          setLoginPassword(updatedUser.password || '');
          saveProfileToList(updatedUser);
          capturePhoneLocationAndFinish(updatedUser);
        }}
      />
    </div>
  );
};
