import React, { useState, useEffect } from 'react';
import { 
  X, User, Shield, Phone, MapPin, CheckCircle2, 
  Building2, UserCheck, ShieldAlert, Sparkles, LogIn, 
  UserPlus, ArrowRight, Check, LogOut, ArrowLeft,
  KeyRound, ShieldCheck, RefreshCw, AlertCircle, Smartphone,
  Search, Award, Users, Copy, CheckCheck, Send
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

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onSelectUser: (user: UserProfile | null) => void;
  onLogout: () => void;
  onOpenChangePasswordModal?: () => void;
}

interface SmsNotification {
  phone: string;
  recipientName: string;
  code: string;
  timestamp: string;
  messageText: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectUser,
  onLogout,
  onOpenChangePasswordModal,
}) => {
  const [authMode, setAuthMode] = useState<'profile' | 'phone_login' | 'super_users' | 'primary_users' | 'signup'>(
    currentUser ? 'profile' : 'phone_login'
  );
  const [selectedRole, setSelectedRole] = useState<UserRole>('primary_user');

  // Phone/Name based quick login
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [activeOtpCode, setActiveOtpCode] = useState<string | null>(null);
  const [otpTargetUser, setOtpTargetUser] = useState<UserProfile | null>(null);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeSms, setActiveSms] = useState<SmsNotification | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Search & Filters
  const [primarySearch, setPrimarySearch] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState<'ALL' | 'CHIEF' | 'A/CHIEF' | 'VILLAGE ELDER'>('ALL');
  const [superSearch, setSuperSearch] = useState('');

  // Sign up fields
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [subCounty, setSubCounty] = useState('Mwingi West');
  const [village, setVillage] = useState('');
  const [signupDesignation, setSignupDesignation] = useState('VILLAGE ELDER');
  
  // Super user specific fields
  const [roleTitle, setRoleTitle] = useState('Response Officer');
  const [department, setDepartment] = useState('National Administration / Welfare Desk');
  const [badgeNumber, setBadgeNumber] = useState('');

  // Registered profiles storage
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

  useEffect(() => {
    if (isOpen) {
      setAuthMode(currentUser ? 'profile' : 'phone_login');
      setLoginError(null);
      setActiveSms(null);
      setIsOtpSent(false);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

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

  const handleRequestOtp = (userOrPhone: UserProfile | string) => {
    setLoginError(null);
    let targetProfile: UserProfile | null = null;
    let targetPhone = '';

    if (typeof userOrPhone === 'string') {
      const query = userOrPhone.trim();
      if (!query) {
        setLoginError('Please enter a phone number (e.g. 0712753886 or 0721846368).');
        return;
      }
      const queryDigits = query.replace(/\D/g, '');
      targetPhone = query;

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
          setLoginError('No matching registered user found. Check number or pick from the lists.');
          return;
        }
      }
    } else {
      targetProfile = userOrPhone;
      targetPhone = userOrPhone.phone;
    }

    const code = generateOtpForPhone(targetPhone);
    setActiveOtpCode(code);
    setOtpTargetUser(targetProfile);
    setIsOtpSent(true);
    setPhoneInput(targetPhone);
    setOtpInput('');

    setActiveSms({
      phone: targetPhone,
      recipientName: targetProfile.name,
      code,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      messageText: `Jambo ${targetProfile.name.split(' ')[0]}! Nambari yako ya siri ya DIRA - Kaa Rada! (Login Code) ni [${code}]. Tumia nambari hii kama password kuingia. Caritas Kitui Donkey Welfare.`,
    });
  };

  const handleVerifyOtp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);

    if (!otpTargetUser) {
      setLoginError('Please request an SMS code first.');
      return;
    }

    const entered = otpInput.trim();
    const expected = activeOtpCode || generateOtpForPhone(otpTargetUser.phone);
    const defaultPin = otpTargetUser.password || '1234';

    if (entered === expected || entered === defaultPin.trim()) {
      onSelectUser(otpTargetUser);
      onClose();
    } else {
      setLoginError(`Invalid code. Enter the code [${expected}] sent to your mobile phone or default PIN 1234.`);
    }
  };

  const handleAutoFillAndLogin = (code: string) => {
    if (otpTargetUser) {
      onSelectUser(otpTargetUser);
      onClose();
    }
  };

  const handleDirectSelect = (profile: UserProfile) => {
    onSelectUser(profile);
    onClose();
  };

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    const isSuper = selectedRole === 'super_user';
    
    const newProfile: UserProfile = {
      id: `user-${Date.now()}`,
      role: selectedRole,
      name: fullName.trim() || (isSuper ? 'Caritas Officer' : 'Community Member'),
      phone: phoneNumber.trim() || '0700000000',
      subCounty,
      village: village.trim() || (isSuper ? 'Mwingi West HQ' : 'Village Centre'),
      roleTitle: isSuper ? (roleTitle.trim() || 'Welfare Officer') : `${signupDesignation} - ${village.trim() || subCounty}`,
      designation: isSuper ? 'OFFICER' : signupDesignation,
      department: isSuper ? (department.trim() || 'Caritas Kitui Donkey Desk') : undefined,
      organization: isSuper ? 'Caritas Kitui' : 'Community Leadership Desk',
      badgeNumber: isSuper ? (badgeNumber.trim() || `CK-WEL-${Math.floor(100 + Math.random() * 900)}`) : undefined,
    };

    saveProfileToList(newProfile);
    onSelectUser(newProfile);
    onClose();
  };

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setLoginError(null);
    try {
      const { user } = await googleSignIn();
      const userEmail = user.email || '';
      const userName = user.displayName || 'Google User';

      const matched = savedProfiles.find((p) => 
        (userEmail && p.email === userEmail) || 
        (p.name && p.name.toLowerCase() === userName.toLowerCase())
      );

      if (matched) {
        onSelectUser(matched);
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
        onSelectUser(newGoogleProfile);
      }
      onClose();
    } catch (err: any) {
      console.error('Google login error:', err);
      setLoginError(err?.message || 'Google Sign-In failed.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogoutAction = () => {
    onLogout();
    setAuthMode('phone_login');
  };

  // Filtered lists
  const superUsersList = savedProfiles.filter((p) => {
    if (p.role !== 'super_user') return false;
    if (superSearch.trim()) {
      const q = superSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.phone.includes(q) || (p.roleTitle && p.roleTitle.toLowerCase().includes(q));
    }
    return true;
  });

  const primaryUsersList = savedProfiles.filter((p) => {
    if (p.role !== 'primary_user') return false;
    if (primaryFilter !== 'ALL') {
      const des = (p.designation || '').toUpperCase();
      const roleT = (p.roleTitle || '').toUpperCase();
      if (primaryFilter === 'CHIEF' && !des.includes('CHIEF') && !roleT.includes('CHIEF')) return false;
      if (primaryFilter === 'A/CHIEF' && !des.includes('A/CHIEF') && !des.includes('ASSISTANT') && !roleT.includes('A/CHIEF') && !roleT.includes('ASSISTANT CHIEF')) return false;
      if (primaryFilter === 'VILLAGE ELDER' && !des.includes('ELDER') && !roleT.includes('ELDER')) return false;
    }
    if (primarySearch.trim()) {
      const q = primarySearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        (p.village && p.village.toLowerCase().includes(q)) ||
        (p.designation && p.designation.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-zinc-200 flex flex-col max-h-[92vh] relative">
        {/* SMS TOAST INSIDE MODAL */}
        {activeSms && (
          <div className="bg-zinc-950 text-white p-3 border-b-2 border-red-600 animate-in slide-in-from-top duration-200 shrink-0">
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                <span className="text-[10px] font-black uppercase text-amber-400 bg-amber-950 px-1.5 py-0.5 rounded border border-amber-800">
                  SMS Code Sent
                </span>
                <span className="text-[10px] font-mono text-zinc-400">{activeSms.phone}</span>
              </div>
              <button
                onClick={() => setActiveSms(null)}
                className="text-zinc-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-zinc-300 mt-1 font-mono leading-tight">
              {activeSms.messageText}
            </p>
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-800">
              <span className="text-xs font-mono font-bold text-amber-400">
                Code: {activeSms.code}
              </span>
              <button
                type="button"
                onClick={() => handleAutoFillAndLogin(activeSms.code)}
                className="px-2.5 py-1 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-[10px] font-extrabold rounded-lg flex items-center gap-1 shadow-xs border border-red-700"
              >
                <KeyRound className="w-3 h-3" />
                <span>1-Tap Auto-fill & Login</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Top Banner */}
        <div className="bg-gradient-to-r from-[#991B1B] via-[#7F1D1D] to-[#991B1B] text-white p-4 flex items-center justify-between border-b border-red-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <CaritasLogo size="sm" inverted />
            <div className="border-l border-white/20 pl-2 ml-1">
              <span className="text-[10px] font-bold text-red-200 uppercase tracking-widest block">
                DIRA • KAA RADA! Portal
              </span>
              <h3 className="text-sm font-bold font-display text-white">
                {authMode === 'profile' && 'Active User Profile'}
                {authMode === 'phone_login' && 'Mobile Code Login (Ingia)'}
                {authMode === 'super_users' && 'Super Users Directory (6)'}
                {authMode === 'primary_users' && '25 Primary Users (Chiefs & Elders)'}
                {authMode === 'signup' && 'Register New Account'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current User Status Bar */}
        {currentUser && (
          <div className="bg-zinc-950 text-white px-4 py-2 flex items-center justify-between text-xs border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                currentUser.role === 'super_user' ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-zinc-800 text-zinc-300'
              }`}>
                {currentUser.role === 'super_user' ? <Shield className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
              </div>
              <div className="truncate">
                <span className="font-bold text-white block leading-tight truncate">{currentUser.name}</span>
                <span className="text-[10px] text-zinc-400">
                  {currentUser.role === 'super_user' ? `Super User • ${currentUser.roleTitle || 'Officer'}` : (currentUser.designation || 'Primary User') + ' • ' + (currentUser.village || currentUser.subCounty || 'Kitui')}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogoutAction}
              className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-xs transition-all active:scale-95 border border-red-500 shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-3 h-3" />
              <span>Log Out</span>
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="p-3 pb-1 shrink-0">
          <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 rounded-2xl border border-zinc-200 text-[11px] font-bold">
            {currentUser && (
              <button
                onClick={() => setAuthMode('profile')}
                className={`py-1.5 px-1 rounded-xl transition-all flex items-center justify-center gap-1 ${
                  authMode === 'profile'
                    ? 'bg-white text-zinc-950 shadow-xs border border-zinc-200'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <UserCheck className="w-3 h-3 text-[#991B1B]" />
                <span className="truncate">Profile</span>
              </button>
            )}

            <button
              onClick={() => {
                setAuthMode('phone_login');
                setLoginError(null);
              }}
              className={`py-1.5 px-1 rounded-xl transition-all flex items-center justify-center gap-1 ${
                !currentUser ? 'col-span-1' : ''
              } ${
                authMode === 'phone_login'
                  ? 'bg-white text-zinc-950 shadow-xs border border-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Smartphone className="w-3 h-3 text-[#991B1B]" />
              <span className="truncate">Phone OTP</span>
            </button>

            <button
              onClick={() => {
                setAuthMode('super_users');
                setLoginError(null);
              }}
              className={`py-1.5 px-1 rounded-xl transition-all flex items-center justify-center gap-1 ${
                authMode === 'super_users'
                  ? 'bg-white text-zinc-950 shadow-xs border border-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Shield className="w-3 h-3 text-amber-600" />
              <span className="truncate">Super (6)</span>
            </button>

            <button
              onClick={() => {
                setAuthMode('primary_users');
                setLoginError(null);
              }}
              className={`py-1.5 px-1 rounded-xl transition-all flex items-center justify-center gap-1 ${
                authMode === 'primary_users'
                  ? 'bg-white text-zinc-950 shadow-xs border border-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Users className="w-3 h-3 text-red-700" />
              <span className="truncate">Primary (25)</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 pt-1 overflow-y-auto flex-1 text-zinc-900">
          {/* Error display */}
          {loginError && (
            <div className="p-2.5 mb-2 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#991B1B]" />
              <span>{loginError}</span>
            </div>
          )}

          {/* VIEW 1: ACTIVE PROFILE */}
          {authMode === 'profile' && currentUser && (
            <div className="space-y-3">
              <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Account Overview
                  </span>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                    currentUser.role === 'super_user' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-red-50 text-[#991B1B] border border-red-200'
                  }`}>
                    {currentUser.role === 'super_user' ? 'Super User Officer' : (currentUser.designation || 'Primary User')}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between py-1 border-b border-zinc-200/60">
                    <span className="text-zinc-500">Full Name:</span>
                    <span className="font-bold text-zinc-950">{currentUser.name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-200/60">
                    <span className="text-zinc-500">Phone Number:</span>
                    <span className="font-mono font-bold text-zinc-950">{currentUser.phone}</span>
                  </div>
                  {currentUser.village && (
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Village / Location:</span>
                      <span className="font-bold text-zinc-950">{currentUser.village}, {currentUser.subCounty}</span>
                    </div>
                  )}
                  {currentUser.roleTitle && (
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Title / Designation:</span>
                      <span className="font-bold text-[#991B1B]">{currentUser.roleTitle}</span>
                    </div>
                  )}
                  {currentUser.badgeNumber && (
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Badge / Staff ID:</span>
                      <span className="font-mono font-bold text-zinc-950">{currentUser.badgeNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {onOpenChangePasswordModal && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenChangePasswordModal();
                    }}
                    className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 border border-zinc-700"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>Change PIN / Password</span>
                  </button>
                )}

                <button
                  onClick={handleLogoutAction}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out (Ondoka)</span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW 2: PHONE OTP LOGIN */}
          {authMode === 'phone_login' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
                  Enter Phone Number:
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      setLoginError(null);
                    }}
                    placeholder="e.g. 0712753886 or 0721846368"
                    className="flex-1 px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => handleRequestOtp(phoneInput)}
                    className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xs transition-all border border-red-800 flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3 h-3" />
                    <span>Get SMS Code</span>
                  </button>
                </div>
              </div>

              {/* OTP Form if Code sent */}
              {isOtpSent && otpTargetUser && (
                <form onSubmit={handleVerifyOtp} className="p-3 bg-red-50/50 rounded-2xl border border-red-200 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-900">
                      Code for: {otpTargetUser.name}
                    </span>
                    <span className="text-[10px] font-mono text-[#991B1B] font-bold">
                      Code: {activeOtpCode}
                    </span>
                  </div>

                  <input
                    type="password"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    placeholder={`Enter code (e.g. ${activeOtpCode || '1234'})`}
                    className="w-full px-3 py-2 text-xs bg-white border border-zinc-300 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-mono"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => activeOtpCode && handleAutoFillAndLogin(activeOtpCode)}
                      className="py-2 px-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-bold rounded-xl border border-zinc-200"
                    >
                      Auto-fill [{activeOtpCode}]
                    </button>
                    <button
                      type="submit"
                      className="py-2 px-2 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-extrabold rounded-xl shadow-xs border border-red-800"
                    >
                      Verify & Log In
                    </button>
                  </div>
                </form>
              )}

              {/* Google Sign In & Drive Connection */}
              <div className="pt-2 border-t border-zinc-200 space-y-2">
                <div className="relative flex items-center justify-center my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-200" />
                  </div>
                  <span className="relative px-2 text-[10px] uppercase font-bold text-zinc-400 bg-white">
                    Or continue with Google
                  </span>
                </div>

                <GoogleSignInButton
                  onClick={handleGoogleLogin}
                  loading={isGoogleLoading}
                  label="Sign in with Google"
                />
              </div>
            </div>
          )}

          {/* VIEW 3: SUPER USERS DIRECTORY (6) */}
          {authMode === 'super_users' && (
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={superSearch}
                  onChange={(e) => setSuperSearch(e.target.value)}
                  placeholder="Search 6 Super Users..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>

              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
                {superUsersList.map((user) => (
                  <div
                    key={user.id}
                    className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200 hover:border-amber-400 flex items-center justify-between gap-2 transition-all"
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-amber-950 text-amber-400 flex items-center justify-center shrink-0">
                        <Shield className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-zinc-950 truncate">
                          {user.name} <span className="font-mono text-[10px] text-zinc-500 font-normal">({user.phone})</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          <strong className="text-amber-700">{user.roleTitle}</strong> • {user.department || user.subCounty}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRequestOtp(user)}
                        className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-amber-800 text-[10px] font-bold rounded-lg border border-zinc-200 flex items-center gap-1"
                      >
                        <Smartphone className="w-3 h-3" />
                        <span>SMS Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDirectSelect(user)}
                        className="px-2 py-1 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-[10px] font-bold rounded-lg border border-red-800"
                      >
                        Enter →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 4: PRIMARY USERS DIRECTORY (25) */}
          {authMode === 'primary_users' && (
            <div className="space-y-2.5">
              {/* Filter pills */}
              <div className="flex flex-wrap gap-1">
                {(['ALL', 'CHIEF', 'A/CHIEF', 'VILLAGE ELDER'] as const).map((filterVal) => (
                  <button
                    key={filterVal}
                    type="button"
                    onClick={() => setPrimaryFilter(filterVal)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                      primaryFilter === filterVal
                        ? 'bg-[#991B1B] text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {filterVal === 'ALL' && 'All (25)'}
                    {filterVal === 'CHIEF' && 'Chiefs (6)'}
                    {filterVal === 'A/CHIEF' && 'A/Chiefs (8)'}
                    {filterVal === 'VILLAGE ELDER' && 'Elders (11)'}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={primarySearch}
                  onChange={(e) => setPrimarySearch(e.target.value)}
                  placeholder="Filter 25 primary users by name, village, phone..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-red-500 outline-none"
                />
              </div>

              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
                {primaryUsersList.map((user) => (
                  <div
                    key={user.id}
                    className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200 hover:border-red-300 flex items-center justify-between gap-2 transition-all"
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-white border border-zinc-200 text-[#991B1B] flex items-center justify-center shrink-0">
                        {user.designation?.includes('CHIEF') ? (
                          <Award className="w-3.5 h-3.5 text-amber-600" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-zinc-700" />
                        )}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-zinc-950 truncate">
                          {user.name} <span className="font-mono text-[10px] text-zinc-500 font-normal">({user.phone})</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          <strong className="text-red-700">{user.designation}</strong> • {user.village}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRequestOtp(user)}
                        className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-red-800 text-[10px] font-bold rounded-lg border border-zinc-200 flex items-center gap-1"
                      >
                        <Smartphone className="w-3 h-3" />
                        <span>SMS Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDirectSelect(user)}
                        className="px-2 py-1 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-[10px] font-bold rounded-lg border border-red-800"
                      >
                        Enter →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 5: REGISTER NEW USER */}
          {authMode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Stephen M. Kakuma"
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                  Phone Number (For SMS verification) *
                </label>
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="0722 000 000"
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Designation
                  </label>
                  <select
                    value={signupDesignation}
                    onChange={(e) => setSignupDesignation(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none"
                  >
                    <option value="CHIEF">CHIEF</option>
                    <option value="A/CHIEF">ASSISTANT CHIEF</option>
                    <option value="VILLAGE ELDER">VILLAGE ELDER</option>
                    <option value="DONKEY OWNER">DONKEY OWNER</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Village
                  </label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    placeholder="e.g. Ngongoni"
                    className="w-full px-2.5 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold rounded-xl text-xs shadow-xs border border-red-800 mt-2"
              >
                Register & Log In
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
