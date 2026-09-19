import React, { useState, useEffect } from 'react';
import { 
  X, User, Shield, Phone, MapPin, CheckCircle2, 
  Building2, UserCheck, ShieldAlert, Sparkles, LogIn, 
  UserPlus, ArrowRight, Check, LogOut, ArrowLeft,
  KeyRound, ShieldCheck, RefreshCw, AlertCircle, Smartphone,
  Search, Award, Users, Copy, CheckCheck, Send, Radio,
  Mail, Eye, EyeOff
} from 'lucide-react';
import { UserProfile, UserRole, Coordinates } from '../types';
import { KITUI_SUB_COUNTIES, generateOtpForPhone, SUPER_ADMIN_ACCOUNT } from '../data/mockData';
import { DiraLogo } from './DiraLogo';
import { GoogleSignInButton } from './GoogleSignInButton';
import { googleSignIn } from '../services/firebaseAuth';
import { registerCurrentDeviceLogin } from '../services/deviceTrackingService';
import { NAIROBI_COORDINATES, getStoredLastKnownLocation } from '../services/locationService';
import { saveUserToDb, getAllUsersFromDb, authenticateWithEmailOrPhone } from '../services/db';

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
  const [authMode, setAuthMode] = useState<'signup' | 'login' | 'profile'>(
    currentUser ? 'profile' : 'login'
  );

  // Role Selection for Signup
  const [selectedRole, setSelectedRole] = useState<UserRole>('primary_user');

  // Streamlined Signup Fields: Name, Email, Phone Number, Password, Designation
  const [fullName, setFullName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [designation, setDesignation] = useState('');

  // Login State: Email or Phone Number + Password
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');

  // OTP Fallback
  const [otpInput, setOtpInput] = useState('');
  const [activeOtpCode, setActiveOtpCode] = useState<string | null>(null);
  const [otpTargetUser, setOtpTargetUser] = useState<UserProfile | null>(null);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [activeSms, setActiveSms] = useState<SmsNotification | null>(null);

  // Status & Feedback
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geoLocating, setGeoLocating] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Saved Registered Profiles (persisted in localStorage, purge legacy mock profiles)
  const [savedProfiles, setSavedProfiles] = useState<UserProfile[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_PROFILES_KEY);
      if (raw) {
        const parsed: UserProfile[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Filter out legacy dummy profiles
          const filtered = parsed.filter(
            (p) =>
              !p.id.startsWith('super-user-') &&
              !p.id.startsWith('pri-user-') &&
              !p.id.startsWith('usr-officer-') &&
              !p.id.startsWith('usr-elder-')
          );
          return filtered;
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

  useEffect(() => {
    if (isOpen) {
      setAuthMode(currentUser ? 'profile' : 'signup');
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

    // Automatically persist to Firestore and IndexedDB
    saveUserToDb(newProfile).catch((err) => {
      console.warn('Could not save user to database:', err);
    });
  };

  /**
   * Acquire high-accuracy phone coordinates on login / registration
   */
  const capturePhoneLocationAndFinish = (profile: UserProfile) => {
    if (!profile) {
      setGeoLocating(false);
      onClose();
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
          onSelectUser(updatedProfile);
          setGeoLocating(false);
          onClose();
        },
        (err) => {
          console.warn('Geolocation capture fallback:', err.message);
          // Register device with default or previously known coordinates
          const defaultCoords = profile?.coordinates || getStoredLastKnownLocation() || NAIROBI_COORDINATES;
          registerCurrentDeviceLogin(profile, defaultCoords, 25);
          onSelectUser(profile);
          setGeoLocating(false);
          onClose();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    } else {
      const defaultCoords = profile?.coordinates || getStoredLastKnownLocation() || NAIROBI_COORDINATES;
      registerCurrentDeviceLogin(profile, defaultCoords, 25);
      onSelectUser(profile);
      setGeoLocating(false);
      onClose();
    }
  };

  /**
   * Handle user self-registration (Super User or Primary User)
   * Stores email, phone number, and password in Firebase database and IndexedDB
   */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const cleanName = fullName.trim();
    const cleanEmail = emailAddress.trim();
    const cleanPhone = phoneNumber.trim();
    const cleanPass = password.trim();
    const cleanDesignation = designation.trim();

    if (!cleanName) {
      setLoginError('Please provide your Full Name.');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 9) {
      setLoginError('Please provide a valid active phone number for SMS and alerts.');
      return;
    }
    if (!cleanPass) {
      setLoginError('Please create a password for your account (minimum 4 characters).');
      return;
    }
    if (cleanPass.length < 4) {
      setLoginError('Password must be at least 4 characters long.');
      return;
    }
    if (!cleanDesignation) {
      setLoginError('Please provide your designation (e.g. Village Elder, Area Chief, OCS, Donkey Owner).');
      return;
    }

    setIsSubmitting(true);

    const isSuper = selectedRole === 'super_user';

    const newProfile: UserProfile = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: selectedRole,
      name: cleanName,
      email: cleanEmail || undefined,
      phone: cleanPhone,
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

    // Capture phone GPS and display on map
    capturePhoneLocationAndFinish(newProfile);
  };

  /**
   * Request OTP code for phone login
   */
  const handleRequestOtp = (phoneOrUser: string | UserProfile) => {
    setLoginError(null);
    let targetPhone = '';
    let targetProfile: UserProfile | null = null;

    if (typeof phoneOrUser === 'string') {
      targetPhone = phoneOrUser.trim();
      if (!targetPhone) {
        setLoginError('Please enter your phone number or "admin" to receive login SMS.');
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
          setLoginError('No account found with this phone number. Please click "Sign Up" above to register as Super User or Primary User.');
          return;
        }
      }
    } else {
      targetProfile = phoneOrUser;
      targetPhone = phoneOrUser.phone;
    }

    const code = generateOtpForPhone(targetPhone);
    setActiveOtpCode(code);
    setOtpTargetUser(targetProfile);
    setIsOtpSent(true);
    setLoginIdentifier(targetPhone);
    setOtpInput('');

    setActiveSms({
      phone: targetPhone,
      recipientName: targetProfile.name,
      code,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      messageText: `Jambo ${targetProfile.name.split(' ')[0]}! Nambari yako ya siri ya DIRA - Kaa Rada! ni [${code}]. Tumia nambari hii kama PIN ya kuingia. Caritas Kitui Donkey Welfare.`,
    });
  };

  /**
   * Verify entered Email or Phone Number and Password, then log in
   */
  const handleVerifyLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);

    // If in OTP mode
    if (loginMethod === 'otp' && isOtpSent && otpTargetUser) {
      const entered = otpInput.trim();
      const expected = activeOtpCode || generateOtpForPhone(otpTargetUser.phone);
      const defaultPin = otpTargetUser.password || '1234';

      if (entered === expected || entered === defaultPin.trim() || (otpTargetUser.role === 'super_admin' && entered.toLowerCase() === 'admin')) {
        capturePhoneLocationAndFinish(otpTargetUser);
      } else {
        setLoginError(`Invalid code. Enter SMS code [${expected}], default PIN 1234, or 'admin'.`);
      }
      return;
    }

    const query = loginIdentifier.trim();
    const pass = loginPassword.trim();

    if (!query) {
      setLoginError('Please enter your email or phone number.');
      return;
    }

    if (!pass) {
      setLoginError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const authResult = await authenticateWithEmailOrPhone(query, pass);
      if (authResult.success && authResult.user) {
        saveProfileToList(authResult.user);
        capturePhoneLocationAndFinish(authResult.user);
      } else {
        setLoginError(authResult.error || 'Authentication failed. Please check your credentials.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setLoginError(err?.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectSelect = (profile: UserProfile) => {
    capturePhoneLocationAndFinish(profile);
  };

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
        capturePhoneLocationAndFinish(matched);
      } else {
        const newGoogleProfile: UserProfile = {
          id: `usr_g_${user.uid.slice(0, 8)}`,
          name: userName,
          phone: user.phoneNumber || '0700000000',
          email: userEmail,
          subCounty: 'Kitui Central',
          village: 'Kitui Central Desk',
          role: selectedRole,
          designation: selectedRole === 'super_user' ? 'SUPER USER OFFICER' : 'COMMUNITY MEMBER',
          roleTitle: selectedRole === 'super_user' ? 'Caritas Lead Officer' : 'Community Member',
          organization: 'Caritas Kitui Network',
        };
        saveProfileToList(newGoogleProfile);
        capturePhoneLocationAndFinish(newGoogleProfile);
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      setLoginError(err?.message || 'Google Sign-In failed.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogoutAction = () => {
    onLogout();
    setAuthMode('signup');
  };

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
                PIN / Code: {activeSms.code}
              </span>
              <button
                type="button"
                onClick={() => {
                  setOtpInput(activeSms.code);
                  if (otpTargetUser) capturePhoneLocationAndFinish(otpTargetUser);
                }}
                className="px-2.5 py-1 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-[10px] font-extrabold rounded-lg flex items-center gap-1 shadow-xs border border-red-700"
              >
                <KeyRound className="w-3 h-3" />
                <span>1-Tap Auto-fill & Login</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-950 text-white p-4 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <DiraLogo size="sm" showText={false} />
            <div className="border-l border-white/20 pl-2.5 ml-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block">
                DIRA • KAA RADA! PORTAL
              </span>
              <h3 className="text-sm font-bold font-display text-white">
                {authMode === 'signup' && 'Sign Up (Sajili Akaunti Mpya)'}
                {authMode === 'login' && 'Sign In / Log In (Ingia)'}
                {authMode === 'profile' && 'Active User Profile'}
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

        {/* Location Status Indicator */}
        {geoLocating && (
          <div className="bg-blue-600 text-white px-3 py-1.5 text-xs font-bold flex items-center justify-center gap-2 animate-pulse shrink-0">
            <Radio className="w-3.5 h-3.5 animate-spin" />
            <span>Detecting phone GPS coordinates & linking to DIRA Map...</span>
          </div>
        )}

        {/* Top Navigation Tabs */}
        <div className="p-3 pb-1 shrink-0 bg-zinc-50 border-b border-zinc-200">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-1 bg-zinc-200/70 rounded-2xl text-xs font-bold">
            <button
              onClick={() => {
                setAuthMode('signup');
                setLoginError(null);
              }}
              className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                authMode === 'signup'
                  ? 'bg-white text-zinc-950 shadow-xs border border-zinc-300 font-black'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-[#991B1B]" />
              <span>Sign Up (Sajili)</span>
            </button>

            <button
              onClick={() => {
                setAuthMode('login');
                setLoginError(null);
              }}
              className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                authMode === 'login'
                  ? 'bg-white text-zinc-950 shadow-xs border border-zinc-300 font-black'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-700" />
              <span>Log In (Ingia)</span>
            </button>

            {currentUser && (
              <button
                onClick={() => setAuthMode('profile')}
                className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1 ${
                  authMode === 'profile'
                    ? 'bg-white text-zinc-950 shadow-xs border border-zinc-300 font-black'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-blue-700" />
                <span>My Profile</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex-1 text-zinc-900 space-y-4">
          
          {/* Error Message */}
          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#991B1B]" />
              <span>{loginError}</span>
            </div>
          )}

          {/* VIEW 1: SIGN UP (STREAMLINED: ROLE DROPDOWN + NAME, PHONE, DESIGNATION + LOG IN ICON AT BOTTOM) */}
          {authMode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              {/* Dropdown for Super User or Primary User */}
              <div>
                <label className="block text-xs font-black text-zinc-800 uppercase tracking-wider mb-1.5">
                  Account Type (Aina ya Mtumiaji) *
                </label>
                <div className="relative">
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs bg-zinc-50 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-[#991B1B] focus:border-[#991B1B] outline-none font-bold text-zinc-900 appearance-none cursor-pointer"
                  >
                    <option value="primary_user">👤 Primary User (Chief, Elder, Donkey Owner, Reporter)</option>
                    <option value="super_user">🛡️ Super User (Police OCS, ACC, DCC, Equine Vet Officer)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
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
                    placeholder={selectedRole === 'super_user' ? 'e.g. Inspector John Musyoka' : 'e.g. Chief Marita Muthui'}
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Email Address (Barua Pepe)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="e.g. user@gmail.com"
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Phone Number (Nambari ya Simu) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="e.g. 0712 345 678"
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-mono font-medium text-zinc-900"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Password (Nenosiri) *
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
                    placeholder="Create a secure password (min 4 chars)"
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

              {/* Designation */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Designation (Wadhifa / Cheo) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder={
                      selectedRole === 'super_user'
                        ? 'e.g. OCS, Police Inspector, ACC, DCC, Equine Vet Officer'
                        : 'e.g. Village Elder, Area Chief, Assistant Chief, Donkey Owner'
                    }
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] outline-none font-medium text-zinc-900"
                  />
                </div>
                {/* Helpful Quick-Pick Pills */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(selectedRole === 'super_user'
                    ? ['OCS', 'Police Inspector', 'ACC', 'DCC', 'Vet Officer', 'Investigator']
                    : ['Village Elder', 'Area Chief', 'Assistant Chief', 'Donkey Owner', 'Community Reporter']
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDesignation(preset)}
                      className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold transition-all cursor-pointer ${
                        designation === preset
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || geoLocating}
                className="w-full py-3 bg-[#991B1B] hover:bg-[#7F1D1D] active:scale-[0.99] text-white font-black rounded-2xl text-xs shadow-md border border-red-800 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {geoLocating ? 'Acquiring Phone GPS...' : `Sign Up as ${selectedRole === 'super_user' ? 'Super User' : 'Primary User'}`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Log In Icon at the bottom of the sign up part */}
              <div className="pt-3 border-t border-zinc-200 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setLoginError(null);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 border border-zinc-200 text-zinc-800 hover:text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <LogIn className="w-4 h-4 text-emerald-600" />
                  <span>Already have an account? Log In</span>
                </button>
              </div>
            </form>
          )}

          {/* VIEW 2: LOG IN (PHONE NUMBER + PIN / SMS CODE) */}
          {authMode === 'login' && (
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
                              {' • '}{profile.designation || profile.roleTitle}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDirectSelect(profile)}
                          className="px-3 py-1.5 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-[10px] font-black rounded-xl border border-red-800 shrink-0 shadow-xs"
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
                      Manage Firebase users, add/delete accounts
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-super-admin-modal-login"
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
                        setLoginError(null);
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
                          setLoginError(null);
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

              <div className="text-center text-[11px] text-zinc-500">
                Don't have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className="font-bold text-[#991B1B] hover:underline"
                >
                  Sign Up as Super User or Primary User
                </button>
              </div>
            </div>
          )}

          {/* VIEW 3: ACTIVE USER PROFILE */}
          {authMode === 'profile' && currentUser && (
            <div className="space-y-4">
              <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Account Overview
                  </span>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                    currentUser.role === 'super_user'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-red-50 text-[#991B1B] border border-red-200'
                  }`}>
                    {currentUser.role === 'super_user' ? '🛡️ Super User Officer' : '👤 Primary User'}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-zinc-200/60">
                    <span className="text-zinc-500">Full Name:</span>
                    <span className="font-bold text-zinc-950">{currentUser.name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-200/60">
                    <span className="text-zinc-500">Phone Number:</span>
                    <span className="font-mono font-bold text-zinc-950">{currentUser.phone}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-200/60">
                    <span className="text-zinc-500">Location:</span>
                    <span className="font-bold text-zinc-950">{currentUser.village || ''}{currentUser.village && currentUser.subCounty ? ', ' : ''}{currentUser.subCounty || ''}</span>
                  </div>
                  {currentUser.roleTitle && (
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Title / Rank:</span>
                      <span className="font-bold text-[#991B1B]">{currentUser.roleTitle}</span>
                    </div>
                  )}
                  {currentUser.department && (
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Department:</span>
                      <span className="font-bold text-zinc-900">{currentUser.department}</span>
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
                    className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 border border-zinc-700 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>Change PIN / Password</span>
                  </button>
                )}

                <button
                  onClick={handleLogoutAction}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out (Ondoka)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
