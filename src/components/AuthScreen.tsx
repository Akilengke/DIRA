import React, { useState, useEffect } from 'react';
import { 
  Shield, User, Phone, MapPin, CheckCircle2, 
  Building2, LogIn, UserPlus, ArrowRight, Check,
  Lock, AlertCircle, Sparkles, KeyRound, Eye, EyeOff,
  MessageSquare, Send, Smartphone, Search, Copy, CheckCheck,
  Award, ChevronRight, X, Volume2, Users
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { 
  INITIAL_OFFICERS, 
  INITIAL_PRIMARY_USERS, 
  ALL_PRELOADED_USERS, 
  KITUI_SUB_COUNTIES,
  generateOtpForPhone 
} from '../data/mockData';
import { CaritasLogo } from './CaritasLogo';
import { GoogleSignInButton } from './GoogleSignInButton';
import { googleSignIn } from '../services/firebaseAuth';

const SAVED_PROFILES_KEY = 'kaa_rada_saved_profiles_v2';

interface AuthScreenProps {
  onLogin: (user: UserProfile) => void;
}

interface SmsNotification {
  id: string;
  phone: string;
  recipientName: string;
  code: string;
  timestamp: string;
  messageText: string;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState<'phone_login' | 'super_users' | 'primary_users' | 'signup'>('phone_login');
  const [showPassword, setShowPassword] = useState(false);

  // Phone OTP Login form state
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [activeOtpCode, setActiveOtpCode] = useState<string | null>(null);
  const [otpTargetUser, setOtpTargetUser] = useState<UserProfile | null>(null);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Simulated SMS Toast State
  const [activeSms, setActiveSms] = useState<SmsNotification | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Search & Filter state for Primary Users directory
  const [primarySearch, setPrimarySearch] = useState('');
  const [primaryDesignationFilter, setPrimaryDesignationFilter] = useState<'ALL' | 'CHIEF' | 'A/CHIEF' | 'VILLAGE ELDER'>('ALL');

  // Search & Filter for Super Users
  const [superSearch, setSuperSearch] = useState('');

  // General error state
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Sign up form state
  const [signupRole, setSignupRole] = useState<UserRole>('primary_user');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [subCounty, setSubCounty] = useState('Mwingi West');
  const [village, setVillage] = useState('');
  const [password, setPassword] = useState('');
  const [signupDesignation, setSignupDesignation] = useState('VILLAGE ELDER');
  
  // Super user specific sign up fields
  const [roleTitle, setRoleTitle] = useState('Response Officer');
  const [department, setDepartment] = useState('National Administration / Welfare Desk');
  const [badgeNumber, setBadgeNumber] = useState('');

  // Registered profiles storage for rapid recall
  const [savedProfiles, setSavedProfiles] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem(SAVED_PROFILES_KEY);
      if (saved) {
        const parsed: UserProfile[] = JSON.parse(saved);
        const merged = [...parsed];
        ALL_PRELOADED_USERS.forEach((user) => {
          const idx = merged.findIndex((p) => 
            p.id === user.id || 
            (p.phone && user.phone && p.phone.replace(/\D/g, '') === user.phone.replace(/\D/g, ''))
          );
          if (idx === -1) {
            merged.push(user);
          } else {
            // Keep full metadata from preloaded list
            merged[idx] = { ...user, ...merged[idx] };
          }
        });
        return merged;
      }
    } catch (e) {
      console.error('Error loading saved profiles:', e);
    }
    return ALL_PRELOADED_USERS;
  });

  // Countdown timer effect for OTP
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  const saveProfileToList = (newProfile: UserProfile) => {
    setSavedProfiles((prev) => {
      const exists = prev.some((p) => p.id === newProfile.id || (p.phone && p.phone === newProfile.phone));
      const updated = exists 
        ? prev.map((p) => p.id === newProfile.id ? newProfile : p)
        : [newProfile, ...prev];
      try {
        localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save profile:', e);
      }
      return updated;
    });
  };

  const normalizePhone = (num: string) => {
    const digits = num.replace(/\D/g, '');
    if (digits.startsWith('254') && digits.length === 12) {
      return '0' + digits.slice(3);
    }
    return digits;
  };

  // Trigger simulated SMS code dispatch
  const handleRequestOtp = (userOrPhone: UserProfile | string) => {
    setAuthError(null);
    let targetProfile: UserProfile | null = null;
    let targetPhone = '';

    if (typeof userOrPhone === 'string') {
      const query = userOrPhone.trim();
      if (!query) {
        setAuthError('Please enter a valid phone number (e.g. 0712753886 or 0721846368).');
        return;
      }
      const queryDigits = query.replace(/\D/g, '');
      targetPhone = query;

      // Find user
      const matched = savedProfiles.find((p) => {
        const pPhoneDigits = p.phone.replace(/\D/g, '');
        const pNorm = normalizePhone(p.phone);
        const queryNorm = normalizePhone(query);
        return (
          (queryDigits.length >= 7 && (pPhoneDigits.includes(queryDigits) || pNorm.includes(queryNorm))) ||
          p.phone.toLowerCase().replace(/\s+/g, '').includes(query.replace(/\s+/g, '')) ||
          p.name.toLowerCase().includes(query.toLowerCase())
        );
      });

      if (matched) {
        targetProfile = matched;
        targetPhone = matched.phone;
      } else {
        // Create an ad-hoc profile for valid phone format
        if (queryDigits.length >= 8) {
          targetProfile = {
            id: `user-${Date.now()}`,
            role: 'primary_user',
            name: `Reporter (${query})`,
            phone: query,
            subCounty: 'Mwingi West',
            village: 'Community Desk',
            designation: 'COMMUNITY REPORTER',
          };
          saveProfileToList(targetProfile);
        } else {
          setAuthError('No registered profile found with that number. Please select from the directory tabs or sign up.');
          return;
        }
      }
    } else {
      targetProfile = userOrPhone;
      targetPhone = userOrPhone.phone;
    }

    const generatedCode = generateOtpForPhone(targetPhone);
    setActiveOtpCode(generatedCode);
    setOtpTargetUser(targetProfile);
    setIsOtpSent(true);
    setOtpCountdown(60);
    setPhoneInput(targetPhone);
    setOtpInput('');

    // Trigger visual SMS Toast notification
    const smsMessage: SmsNotification = {
      id: `sms-${Date.now()}`,
      phone: targetPhone,
      recipientName: targetProfile.name,
      code: generatedCode,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      messageText: `Jambo ${targetProfile.name.split(' ')[0]}! Nambari yako ya siri ya DIRA - Kaa Rada! (Login Code) ni [${generatedCode}]. Tumia nambari hii kama password kuingia. Valid for 10 mins. Caritas Kitui Donkey Welfare.`,
    };
    setActiveSms(smsMessage);
    setAuthSuccess(`Security Code sent via SMS to ${targetPhone}`);
  };

  // Direct login with code or PIN
  const handleVerifyOtpAndLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    if (!otpTargetUser) {
      setAuthError('Please request an SMS code first.');
      return;
    }

    const enteredCode = otpInput.trim();
    if (!enteredCode) {
      setAuthError('Please enter the 4-digit code sent to your mobile phone.');
      return;
    }

    const expectedCode = activeOtpCode || generateOtpForPhone(otpTargetUser.phone);
    const defaultPin = otpTargetUser.password || '1234';

    // Allow the generated SMS code OR default 1234 / user custom password
    if (enteredCode === expectedCode || enteredCode === defaultPin.trim()) {
      setActiveSms(null);
      onLogin(otpTargetUser);
    } else {
      setAuthError(`Invalid verification code. Please enter the code [${expectedCode}] received on your phone or default PIN 1234.`);
    }
  };

  // Instant 1-tap Auto-fill and Login
  const handleAutoFillAndLogin = (code: string) => {
    setOtpInput(code);
    if (otpTargetUser) {
      setActiveSms(null);
      onLogin(otpTargetUser);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Sign up submission
  const handleSignUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isSuper = signupRole === 'super_user';
    
    if (!fullName.trim()) {
      setAuthError('Please provide your full name.');
      return;
    }

    const newProfile: UserProfile = {
      id: `user-${Date.now()}`,
      role: signupRole,
      name: fullName.trim(),
      phone: phoneNumber.trim() || '0700000000',
      password: password.trim() || '1234',
      subCounty,
      village: village.trim() || (isSuper ? 'Mwingi West HQ' : 'Village Centre'),
      roleTitle: isSuper ? (roleTitle.trim() || 'Welfare Officer') : `${signupDesignation} - ${village.trim() || subCounty}`,
      designation: isSuper ? 'OFFICER' : signupDesignation,
      department: isSuper ? (department.trim() || 'National Administration & Welfare Desk') : undefined,
      organization: isSuper ? 'Caritas Kitui / Gov Administration' : 'Community Leadership Desk',
      badgeNumber: isSuper ? (badgeNumber.trim() || `OFF-${Math.floor(100 + Math.random() * 900)}`) : undefined,
    };

    saveProfileToList(newProfile);
    onLogin(newProfile);
  };

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Sign in using Google (unlocks Google Drive & signs in user)
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setAuthError(null);
    try {
      const { user } = await googleSignIn();
      const userEmail = user.email || '';
      const userName = user.displayName || 'Google User';

      // Match existing profile or create verified profile
      const matched = savedProfiles.find((p) => 
        (userEmail && p.email === userEmail) || 
        (p.name && p.name.toLowerCase() === userName.toLowerCase())
      );

      if (matched) {
        onLogin(matched);
      } else {
        const newGoogleProfile: UserProfile = {
          id: `usr_g_${user.uid.slice(0, 8)}`,
          name: userName,
          phone: user.phoneNumber || '0700 000 000',
          email: userEmail,
          subCounty: 'Kitui Central',
          village: 'Kitui Central Desk',
          role: 'primary_user',
          designation: 'COMMUNITY MEMBER',
          organization: 'Caritas Kitui Partner Network',
        };
        saveProfileToList(newGoogleProfile);
        onLogin(newGoogleProfile);
      }
    } catch (err: any) {
      console.error('Google Sign In failed:', err);
      setAuthError(err?.message || 'Google Sign-In failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Filtered Super Users
  const superUsersList = savedProfiles.filter((p) => {
    if (p.role !== 'super_user') return false;
    if (superSearch.trim()) {
      const q = superSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        (p.roleTitle && p.roleTitle.toLowerCase().includes(q)) ||
        (p.department && p.department.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filtered Primary Users
  const primaryUsersList = savedProfiles.filter((p) => {
    if (p.role !== 'primary_user') return false;
    
    // Filter by designation pill
    if (primaryDesignationFilter !== 'ALL') {
      const des = (p.designation || '').toUpperCase();
      const roleT = (p.roleTitle || '').toUpperCase();
      if (primaryDesignationFilter === 'CHIEF' && !des.includes('CHIEF') && !roleT.includes('CHIEF')) return false;
      if (primaryDesignationFilter === 'A/CHIEF' && !des.includes('A/CHIEF') && !des.includes('ASSISTANT') && !roleT.includes('A/CHIEF') && !roleT.includes('ASSISTANT CHIEF')) return false;
      if (primaryDesignationFilter === 'VILLAGE ELDER' && !des.includes('ELDER') && !roleT.includes('ELDER')) return false;
    }

    if (primarySearch.trim()) {
      const q = primarySearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        (p.village && p.village.toLowerCase().includes(q)) ||
        (p.designation && p.designation.toLowerCase().includes(q)) ||
        (p.roleTitle && p.roleTitle.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col justify-between text-zinc-100 p-3 sm:p-6 selection:bg-red-800 selection:text-white relative">
      {/* SIMULATED INCOMING MOBILE SMS NOTIFICATION (Floating Top Banner) */}
      {activeSms && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md animate-in slide-in-from-top duration-300">
          <div className="bg-zinc-900 border-2 border-red-600 rounded-2xl shadow-2xl p-3.5 sm:p-4 text-white backdrop-blur-md ring-4 ring-red-950/70">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-950 border border-red-700 flex items-center justify-center text-red-400 shrink-0 animate-pulse">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-400 bg-red-950 px-2 py-0.5 rounded border border-red-800">
                      SMS Alert
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {activeSms.timestamp}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white mt-0.5">
                    DIRA (Kaa Rada!) Caritas Kitui Verification
                  </h4>
                </div>
              </div>

              <button
                onClick={() => setActiveSms(null)}
                className="w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-2.5 p-2.5 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-300 font-mono leading-relaxed">
              {activeSms.messageText}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-400">Password Code:</span>
                <span className="text-sm font-black font-mono text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                  {activeSms.code}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopyCode(activeSms.code)}
                  className="px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold flex items-center gap-1 transition-all border border-zinc-700"
                >
                  {copiedCode ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAutoFillAndLogin(activeSms.code)}
                  className="px-3 py-1.5 rounded-lg bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-[11px] font-extrabold flex items-center gap-1 shadow-md transition-all border border-red-700 active:scale-95"
                >
                  <KeyRound className="w-3 h-3 text-amber-300" />
                  <span>1-Tap Auto-fill & Login</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Brand Header */}
      <div className="w-full max-w-lg mx-auto pt-2 text-center space-y-1.5">
        <div className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl backdrop-blur-xs">
          <CaritasLogo className="h-8 sm:h-10 w-auto" />
        </div>

        <div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-red-400 bg-red-950/80 px-2.5 py-0.5 rounded-full border border-red-800/80">
              CARITAS KITUI
            </span>
            <span className="text-[10px] font-bold text-zinc-400">
              DONKEY WELFARE NETWORK
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight mt-0.5">
            DIRA
          </h1>
          <div className="text-xs font-bold text-red-400 uppercase tracking-wide">
            Donkey Incident Reporting APP • Kaa Rada!
          </div>
          <p className="text-xs text-zinc-400 font-medium max-w-sm mx-auto mt-0.5">
            Donkey Anti-Theft, Illegal Slaughter Prevention & Emergency Response
          </p>
        </div>
      </div>

      {/* Main Auth Container */}
      <div className="w-full max-w-lg mx-auto my-auto py-2">
        <div className="bg-zinc-900/95 border border-zinc-800 rounded-3xl p-3.5 sm:p-5 shadow-2xl backdrop-blur-md space-y-3.5">
          {/* 4 Main Tabs: Phone OTP Login | Super Users (6) | Primary Users (25) | Register */}
          <div className="grid grid-cols-4 p-1 bg-zinc-950 border border-zinc-800 rounded-2xl gap-0.5 text-center">
            <button
              id="tab-phone-login"
              type="button"
              onClick={() => {
                setActiveTab('phone_login');
                setAuthError(null);
              }}
              className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-extrabold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
                activeTab === 'phone_login'
                  ? 'bg-[#991B1B] text-white shadow-md border border-red-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Phone Login</span>
            </button>

            <button
              id="tab-super-users"
              type="button"
              onClick={() => {
                setActiveTab('super_users');
                setAuthError(null);
              }}
              className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-extrabold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
                activeTab === 'super_users'
                  ? 'bg-[#991B1B] text-white shadow-md border border-red-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0 text-amber-300" />
              <span className="truncate">Super (6)</span>
            </button>

            <button
              id="tab-primary-users"
              type="button"
              onClick={() => {
                setActiveTab('primary_users');
                setAuthError(null);
              }}
              className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-extrabold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
                activeTab === 'primary_users'
                  ? 'bg-[#991B1B] text-white shadow-md border border-red-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0 text-red-300" />
              <span className="truncate">Primary (25)</span>
            </button>

            <button
              id="tab-signup"
              type="button"
              onClick={() => {
                setActiveTab('signup');
                setAuthError(null);
              }}
              className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-extrabold flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
                activeTab === 'signup'
                  ? 'bg-[#991B1B] text-white shadow-md border border-red-700'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Register</span>
            </button>
          </div>

          {/* Feedback alerts */}
          {authError && (
            <div className="bg-red-950/80 border border-red-800 rounded-2xl p-3 flex items-start gap-2 text-xs text-red-200 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{authError}</div>
            </div>
          )}

          {authSuccess && !authError && (
            <div className="bg-emerald-950/70 border border-emerald-800 rounded-2xl p-2.5 flex items-center justify-between gap-2 text-xs text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{authSuccess}</span>
              </div>
              <button
                onClick={() => setAuthSuccess(null)}
                className="text-emerald-400 hover:text-white text-[10px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* TAB 1: PHONE NUMBER & OTP CODE LOGIN */}
          {activeTab === 'phone_login' && (
            <div className="space-y-3.5">
              <div className="p-3 bg-zinc-950/80 rounded-2xl border border-zinc-800 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-red-400">
                  <Smartphone className="w-4 h-4" />
                  <span>Mobile Phone SMS Code Authentication</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Enter your registered mobile phone number. We will send a secure 4-digit verification code directly to your phone screen to use as your password.
                </p>
              </div>

              {/* Step 1: Phone input & request button */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-300">
                  Mobile Phone Number
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => {
                        setPhoneInput(e.target.value);
                        setAuthError(null);
                      }}
                      placeholder="e.g. 0712753886 or 0721846368"
                      className="w-full pl-10 pr-3 py-2.5 text-xs sm:text-sm bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] focus:border-red-700 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRequestOtp(phoneInput)}
                    className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white px-3.5 py-2.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all active:scale-95 border border-red-700 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isOtpSent ? 'Resend' : 'Get SMS Code'}</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Verification Code Input */}
              {isOtpSent && otpTargetUser && (
                <form onSubmit={handleVerifyOtpAndLogin} className="space-y-3 p-3.5 bg-zinc-950 rounded-2xl border border-red-900/60 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-400 block">
                        Target Account
                      </span>
                      <span className="text-xs font-bold text-white">
                        {otpTargetUser.name} ({otpTargetUser.role === 'super_user' ? otpTargetUser.roleTitle : otpTargetUser.designation || 'Primary User'})
                      </span>
                    </div>

                    {otpCountdown > 0 ? (
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Resend in {otpCountdown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRequestOtp(phoneInput)}
                        className="text-[10px] font-bold text-red-400 hover:text-red-300 underline"
                      >
                        Resend SMS Code
                      </button>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-zinc-300">
                        Enter 4-Digit SMS Code / Password
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono">
                        Generated Code: {activeOtpCode}
                      </span>
                    </div>

                    <div className="relative">
                      <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value)}
                        placeholder={`Enter code (e.g. ${activeOtpCode || '1234'})`}
                        className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => activeOtpCode && handleAutoFillAndLogin(activeOtpCode)}
                      className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 text-xs font-bold border border-zinc-700 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>Auto-fill [{activeOtpCode}]</span>
                    </button>

                    <button
                      type="submit"
                      className="py-2.5 px-3 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-extrabold border border-red-700 shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Verify & Enter</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Google Sign In Option for Drive and Direct Login */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                <div className="relative flex items-center justify-center my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800" />
                  </div>
                  <span className="relative px-2 text-[10px] uppercase font-bold text-zinc-400 bg-zinc-900">
                    Or continue with Google & Drive
                  </span>
                </div>

                <GoogleSignInButton
                  onClick={handleGoogleLogin}
                  loading={isGoogleLoading}
                  label="Sign in with Google"
                />
              </div>

              {/* Quick links to preloaded official lists */}
              <div className="pt-2 border-t border-zinc-800/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                  Or select directly from verified directories:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('super_users')}
                    className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-600/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200 group-hover:text-amber-300">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>6 Super Users</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                      DCC, SCAPC, OCS, ACC, Director, PM
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('primary_users')}
                    className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-red-600/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200 group-hover:text-red-300">
                      <Users className="w-3.5 h-3.5 text-red-400" />
                      <span>25 Primary Users</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                      Chiefs, Assistant Chiefs & Village Elders
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 6 OFFICIAL SUPER USERS */}
          {activeTab === 'super_users' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Authorized Super Users (6 Officials)
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    National Government Administration & Caritas Leadership Desk
                  </p>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                  SMS Code / PIN
                </span>
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={superSearch}
                  onChange={(e) => setSuperSearch(e.target.value)}
                  placeholder="Search officer by name, phone, or title..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Super User List Cards */}
              <div className="grid grid-cols-1 gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                {superUsersList.map((user) => (
                  <div
                    key={user.id}
                    className="p-2.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 hover:border-amber-700/60 flex items-center justify-between gap-2 transition-all group"
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-400 flex items-center justify-center shrink-0 font-black text-xs">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                          <span>{user.name}</span>
                          <span className="text-[10px] font-mono text-amber-400 font-normal">
                            ({user.phone})
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          <span className="text-amber-300 font-semibold">{user.roleTitle}</span> • {user.department || user.subCounty}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRequestOtp(user)}
                        className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 text-[10px] font-extrabold flex items-center gap-1 transition-all active:scale-95"
                        title="Receive SMS Code on mobile phone"
                      >
                        <Smartphone className="w-3 h-3 text-amber-400" />
                        <span>Get Code</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onLogin(user)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white border border-red-700 text-[10px] font-extrabold flex items-center gap-1 shadow-xs transition-all active:scale-95"
                        title="Direct 1-Tap Entry"
                      >
                        <span>Enter</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: 25 PRIMARY USERS (Chiefs, Assistant Chiefs & Village Elders) */}
          {activeTab === 'primary_users' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    25 Primary Users (Chiefs & Elders)
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Local Chiefs, Assistant Chiefs & Village Elders across Mwingi West
                  </p>
                </div>
                <span className="text-[10px] font-bold text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {primaryUsersList.length} Accounts
                </span>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap gap-1">
                {(['ALL', 'CHIEF', 'A/CHIEF', 'VILLAGE ELDER'] as const).map((filterVal) => (
                  <button
                    key={filterVal}
                    type="button"
                    onClick={() => setPrimaryDesignationFilter(filterVal)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      primaryDesignationFilter === filterVal
                        ? 'bg-red-900 text-white border border-red-600'
                        : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-white'
                    }`}
                  >
                    {filterVal === 'ALL' && 'All (25)'}
                    {filterVal === 'CHIEF' && 'Chiefs (6)'}
                    {filterVal === 'A/CHIEF' && 'A/Chiefs (8)'}
                    {filterVal === 'VILLAGE ELDER' && 'Village Elders (11)'}
                  </button>
                ))}
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={primarySearch}
                  onChange={(e) => setPrimarySearch(e.target.value)}
                  placeholder="Filter by name, village (e.g. Ngongoni, Nzawa, Kavaini), phone..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-1 focus:ring-red-500 outline-none"
                />
              </div>

              {/* Primary User List Cards */}
              <div className="grid grid-cols-1 gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                {primaryUsersList.map((user, idx) => (
                  <div
                    key={user.id}
                    className="p-2.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 hover:border-red-800/60 flex items-center justify-between gap-2 transition-all group"
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-700 text-red-400 flex items-center justify-center shrink-0 font-bold text-xs">
                        {user.designation === 'CHIEF' || user.designation === 'CHIEF (Ag)' ? (
                          <Award className="w-4 h-4 text-amber-400" />
                        ) : user.designation === 'A/CHIEF' ? (
                          <Shield className="w-4 h-4 text-red-400" />
                        ) : (
                          <User className="w-4 h-4 text-zinc-300" />
                        )}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                          <span>{user.name}</span>
                          <span className="text-[10px] font-mono text-zinc-400 font-normal">
                            ({user.phone})
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate flex items-center gap-1.5">
                          <span className="text-red-300 font-bold uppercase">{user.designation}</span>
                          <span>•</span>
                          <span className="text-zinc-300 font-medium">{user.village}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRequestOtp(user)}
                        className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-red-300 border border-zinc-700 text-[10px] font-extrabold flex items-center gap-1 transition-all active:scale-95"
                        title="Get SMS Code to phone"
                      >
                        <Smartphone className="w-3 h-3 text-red-400" />
                        <span>Get Code</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onLogin(user)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white border border-red-700 text-[10px] font-extrabold flex items-center gap-1 shadow-xs transition-all active:scale-95"
                        title="Direct 1-Tap Entry"
                      >
                        <span>Enter</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: SIGN UP / REGISTER NEW USER */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUpSubmit} className="space-y-3">
              {/* Role Selection */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Select Account Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSignupRole('primary_user')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      signupRole === 'primary_user'
                        ? 'bg-red-950/40 border-red-600 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <User className="w-3.5 h-3.5 text-red-400" />
                      <span>Primary User</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 leading-tight">
                      Chief / Elder / Donkey Owner
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSignupRole('super_user')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      signupRole === 'super_user'
                        ? 'bg-red-950/40 border-red-600 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>Super User</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 leading-tight">
                      DCC / OCS / ACC / Caritas Lead
                    </span>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={signupRole === 'super_user' ? 'e.g. Officer Joseph Musyoka' : 'e.g. Stephen M. Kakuma'}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] outline-none"
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Phone Number (For SMS Verification Codes) *
                </label>
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="0722 000 000"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] outline-none"
                />
              </div>

              {/* Designation selection if primary user */}
              {signupRole === 'primary_user' && (
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Designation / Title
                  </label>
                  <select
                    value={signupDesignation}
                    onChange={(e) => setSignupDesignation(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:ring-2 focus:ring-[#991B1B] outline-none"
                  >
                    <option value="CHIEF">CHIEF</option>
                    <option value="A/CHIEF">ASSISTANT CHIEF (A/CHIEF)</option>
                    <option value="VILLAGE ELDER">VILLAGE ELDER</option>
                    <option value="DONKEY OWNER">DONKEY OWNER / FARMER</option>
                    <option value="COMMUNITY REPORTER">COMMUNITY REPORTER</option>
                  </select>
                </div>
              )}

              {/* Location selection */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Sub-County *
                  </label>
                  <select
                    value={subCounty}
                    onChange={(e) => setSubCounty(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:ring-2 focus:ring-[#991B1B] outline-none"
                  >
                    {KITUI_SUB_COUNTIES.map((sc) => (
                      <option key={sc.name} value={sc.name} className="bg-zinc-900">
                        {sc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Village / Station
                  </label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    placeholder="e.g. Ngongoni / Ngutani"
                    className="w-full px-2.5 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] outline-none"
                  />
                </div>
              </div>

              {/* Super User Credentials */}
              {signupRole === 'super_user' && (
                <div className="p-3 bg-red-950/20 border border-red-900/60 rounded-2xl space-y-2 text-xs">
                  <span className="text-[10px] font-extrabold uppercase text-amber-300 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Officer Verification Details
                  </span>
                  
                  <input
                    type="text"
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder="Role Title (e.g. DCC / OCS / ACC / SCAPC)"
                    className="w-full px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Department"
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                    />
                    <input
                      type="text"
                      value={badgeNumber}
                      onChange={(e) => setBadgeNumber(e.target.value)}
                      placeholder="Badge / Service No."
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white"
                    />
                  </div>
                </div>
              )}

              {/* Security PIN / Password */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Create Security PIN / Password (Min 4 digits)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••• (default 1234)"
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#991B1B] outline-none"
                />
              </div>

              <button
                id="btn-signup-submit"
                type="submit"
                className="w-full bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-extrabold py-3 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all border border-red-700 mt-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Register & Enter DIRA (Kaa Rada!)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="w-full max-w-lg mx-auto pb-2 text-center space-y-0.5">
        <p className="text-[11px] text-zinc-500 font-medium">
          Catholic Diocese of Kitui • Caritas Donkey Welfare Initiative
        </p>
        <p className="text-[10px] text-zinc-600">
          Emergency Toll-Free: 0800 000 890 • Inua Punda, Boresha Maisha
        </p>
      </div>
    </div>
  );
};
