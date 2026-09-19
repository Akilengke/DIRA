import React, { useState, useEffect, useRef } from 'react';
import { 
  X, AlertTriangle, Zap, Camera, Phone, MapPin, Upload, 
  Trash2, Shield, CheckCircle2, PhoneCall, Radio, Lock, Clock, Sparkles
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  CaseCategory, 
  DonkeyCase, 
  Coordinates, 
  UserProfile, 
  CasePhoto 
} from '../types';
import { 
  EMERGENCY_HOTLINE, 
  HOTLINE_DISPLAY, 
  INITIAL_OFFICERS,
  SUB_COUNTY_COORDINATES
} from '../data/mockData';
import { 
  allocateCaseWithAI, 
  AIAllocationResult 
} from '../services/aiAllocationService';
import { 
  formatDistance, 
  estimateMotorcycleTimeMinutes,
  DEFAULT_KITUI_COORDINATES 
} from '../services/locationService';
import { VoiceDictationButton } from './VoiceDictationButton';

interface EmergencyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitEmergencyCase: (newCase: Omit<DonkeyCase, 'id' | 'trackingCode' | 'reportedAt' | 'status' | 'actionLogs'>) => void;
  currentUser: UserProfile | null;
  userCoordinates?: Coordinates;
  userAccuracy?: number;
}

export const EmergencyReportModal: React.FC<EmergencyReportModalProps> = ({
  isOpen,
  onClose,
  onSubmitEmergencyCase,
  currentUser,
  userCoordinates = DEFAULT_KITUI_COORDINATES,
  userAccuracy = 10,
}) => {
  // Form Inputs (Minimal, Rapid Fields)
  const [narrative, setNarrative] = useState('');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState<string>('');
  const [category, setCategory] = useState<CaseCategory>('donkey_theft');
  const [donkeysCount, setDonkeysCount] = useState<number>(1);

  // Errors & Submission States
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispatchedResult, setDispatchedResult] = useState<{
    trackingCode: string;
    aiResult: AIAllocationResult;
    phone: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-fill phone when user changes or modal opens
  useEffect(() => {
    if (isOpen) {
      if (currentUser?.phone && !phone) {
        setPhone(currentUser.phone);
      }
      setPhoneError(null);
      setNarrativeError(null);
      setDispatchedResult(null);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  // Handle Photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPhotoPreview(dataUrl);
      setPhotoCaption(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setPhotoCaption('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Quick preset pills to save time typing
  const handleInsertQuickPhrase = (phrase: string) => {
    setNarrative((prev) => {
      if (!prev.trim()) return phrase;
      return `${prev}. ${phrase}`;
    });
  };

  // Validation & Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validate Mandatory Phone Number
    const cleanedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (!cleanedPhone || cleanedPhone.length < 9) {
      setPhoneError('Valid phone number is mandatory for immediate officer callback.');
      return;
    }
    setPhoneError(null);

    // 2. Validate Brief Narrative
    if (!narrative.trim() || narrative.trim().length < 5) {
      setNarrativeError('Please provide a brief narrative of what is happening (at least a few words).');
      return;
    }
    setNarrativeError(null);

    setIsSubmitting(true);

    // Prepare photos array
    const photos: CasePhoto[] = [];
    if (photoPreview) {
      photos.push({
        id: `photo-emerg-${Date.now()}`,
        url: photoPreview,
        caption: photoCaption || 'Emergency Scene Capture',
        timestamp: new Date().toISOString(),
      });
    }

    // Automatically determine location from live GPS
    const locationData = {
      county: 'Kitui',
      subCounty: 'Mwingi West', // Proximity will evaluate GPS precisely
      ward: 'Central / Active Zone',
      subLocation: 'Live GPS Pinpoint',
      village: 'Live GPS Incident Scene',
      landmark: 'Captured via Live GPS Radar',
      coordinates: userCoordinates,
    };

    // Run AI Allocation Engine immediately
    const aiResult = allocateCaseWithAI(
      {
        category,
        urgency: 'critical',
        title: `🚨 EMERGENCY: ${category === 'donkey_theft' ? 'Donkey Theft' : category === 'bush_slaughter' ? 'Bush Slaughter' : category === 'trafficking' ? 'Trafficking' : 'Abuse'}`,
        description: narrative.trim(),
        location: locationData,
        isEmergency: true,
        donkeysCount,
      },
      INITIAL_OFFICERS
    );

    const generatedCode = `KR-EMERG-${Math.floor(1000 + Math.random() * 9000)}`;

    const newCasePayload: Omit<DonkeyCase, 'id' | 'trackingCode' | 'reportedAt' | 'status' | 'actionLogs'> = {
      category,
      title: `🚨 EMERGENCY: ${narrative.slice(0, 45)}${narrative.length > 45 ? '...' : ''}`,
      description: narrative.trim(),
      donkeysCount,
      incidentDateTime: new Date().toISOString(),
      urgency: 'critical',
      isEmergency: true,
      emergencyPhone: cleanedPhone,
      location: locationData,
      photos,
      reporter: {
        isAnonymous: false,
        name: currentUser?.name || 'Emergency Reporter',
        phone: cleanedPhone,
        relationship: 'witness',
      },
      assignedOfficer: {
        id: aiResult.allocatedOfficer.id,
        name: aiResult.allocatedOfficer.name,
        title: aiResult.allocatedOfficer.roleTitle || aiResult.allocatedOfficer.designation || 'Super User',
        department: aiResult.allocatedOfficer.department || 'Caritas Response Unit',
        phone: aiResult.allocatedOfficer.phone,
      },
      aiAllocation: aiResult.metadata,
      emergencyHotlineContacted: true,
    };

    // Deliver to App state
    onSubmitEmergencyCase(newCasePayload);

    // Show success view
    setDispatchedResult({
      trackingCode: generatedCode,
      aiResult,
      phone: cleanedPhone,
    });
    setIsSubmitting(false);

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#DC2626', '#EA580C', '#F59E0B'],
      });
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-red-600 overflow-hidden flex flex-col max-h-[94dvh] sm:max-h-[88dvh] my-0 sm:my-auto">
        
        {/* Emergency Header Bar */}
        <div className="bg-gradient-to-r from-red-700 via-red-800 to-zinc-950 text-white p-4 sm:p-5 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white text-red-700 flex items-center justify-center shadow-md animate-pulse">
              <Zap className="w-6 h-6 fill-red-600 text-red-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black font-display tracking-tight text-white">
                  Quick Emergency Report
                </h2>
                <span className="bg-amber-400 text-zinc-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-xs">
                  Fast AI Dispatch
                </span>
              </div>
              <p className="text-xs text-red-100 font-medium">
                Brief narrative, optional photo & phone for instant AI responder dispatch
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-90"
            title="Close Emergency Report"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-zinc-800 flex-1">
          
          {/* Dispatched Confirmation View */}
          {dispatchedResult ? (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-emerald-950">
                    Emergency Alert Broadcasted!
                  </h3>
                  <p className="text-xs text-emerald-800">
                    Case <span className="font-mono font-bold">{dispatchedResult.trackingCode}</span> logged and auto-dispatched via AI.
                  </p>
                </div>
              </div>

              {/* AI Auto-Allocated Officer Card */}
              <div className="p-4 bg-zinc-900 text-white rounded-2xl border border-zinc-800 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Auto-Allocated Super User
                  </span>
                  <span className="bg-red-600/90 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                    DISPATCHED
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-black text-white">
                      {dispatchedResult.aiResult.allocatedOfficer.name}
                    </h4>
                    <p className="text-xs text-zinc-300">
                      {dispatchedResult.aiResult.allocatedOfficer.roleTitle || dispatchedResult.aiResult.allocatedOfficer.designation}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      📍 {dispatchedResult.aiResult.allocatedOfficer?.village || dispatchedResult.aiResult.allocatedOfficer?.subCounty || 'Kitui Station'}
                    </p>
                  </div>

                  <div className="text-right bg-zinc-800/80 p-2.5 rounded-xl border border-zinc-700 shrink-0">
                    <div className="text-xs font-black text-amber-300">
                      {dispatchedResult.aiResult.distanceFormatted} away
                    </div>
                    <div className="text-[10px] text-zinc-300 flex items-center gap-1 justify-end mt-0.5">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      <span>ETA ~{dispatchedResult.aiResult.estimatedArrivalMins} mins</span>
                    </div>
                  </div>
                </div>

                {/* AI Rationale */}
                <div className="p-2.5 bg-zinc-800/50 rounded-xl border border-zinc-700/60 text-[11px] text-zinc-300">
                  <strong className="text-amber-400">AI Dispatch Reason: </strong>
                  {dispatchedResult.aiResult.reason}
                </div>

                {/* Direct Call Officer Button */}
                <a
                  href={`tel:${dispatchedResult.aiResult.allocatedOfficer.phone}`}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                >
                  <PhoneCall className="w-4 h-4 fill-white" />
                  <span>Call Assigned Super User ({dispatchedResult.aiResult.allocatedOfficer.phone})</span>
                </a>
              </div>

              {/* Toll-Free Backup hotline */}
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-red-950">Caritas Kitui Emergency Hotline:</div>
                  <div className="text-red-800 font-mono">{HOTLINE_DISPLAY} (Toll-Free)</div>
                </div>
                <a
                  href={`tel:${EMERGENCY_HOTLINE}`}
                  className="bg-red-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-red-900"
                >
                  Call Toll-Free
                </a>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-zinc-950 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl text-xs sm:text-sm shadow-xs transition-all"
                >
                  Close & Return to Dashboard
                </button>
              </div>
            </div>
          ) : (
            /* Emergency Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Permanent Live GPS Locked Banner */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-blue-700" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                  </div>
                  <div>
                    <div className="font-bold text-blue-950 flex items-center gap-1.5">
                      <span>My Live GPS:</span>
                      <span className="text-emerald-700 font-black text-[11px] bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> ALWAYS ON
                      </span>
                    </div>
                    <div className="text-[10px] text-blue-800 font-mono">
                      {userCoordinates.lat.toFixed(4)}, {userCoordinates.lng.toFixed(4)} (±{Math.round(userAccuracy)}m accuracy)
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-blue-800 bg-white px-2 py-1 rounded-lg border border-blue-200 shadow-2xs">
                  Auto-Attached
                </span>
              </div>

              {/* 1. Mandatory Phone Number */}
              <div className="space-y-1">
                <label className="block text-xs font-black text-zinc-950 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-red-600" />
                    <span>Your Phone Number <span className="text-red-600">* (Mandatory)</span></span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-normal">For immediate responder callback</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (phoneError) setPhoneError(null);
                    }}
                    placeholder="e.g. 0712 345 678 or 0722 000 000"
                    required
                    className={`w-full p-3 rounded-xl border text-xs sm:text-sm font-bold text-zinc-900 bg-zinc-50 outline-none transition-all ${
                      phoneError
                        ? 'border-red-500 ring-2 ring-red-200 bg-red-50/50'
                        : 'border-zinc-300 focus:border-red-600 focus:ring-2 focus:ring-red-100'
                    }`}
                  />
                  {phone && (
                    <span className="absolute right-3 top-3 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      ✓ Callback Ready
                    </span>
                  )}
                </div>
                {phoneError && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{phoneError}</span>
                  </p>
                )}
              </div>

              {/* 2. Incident Category Fast Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-zinc-950">
                  Incident Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCategory('donkey_theft')}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                      category === 'donkey_theft'
                        ? 'bg-red-950 text-white border-red-700 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <span>🚨 Donkey Theft</span>
                    {category === 'donkey_theft' && <span className="text-amber-400 text-xs">✓</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('bush_slaughter')}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                      category === 'bush_slaughter'
                        ? 'bg-red-950 text-white border-red-700 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <span>🔪 Bush Slaughter</span>
                    {category === 'bush_slaughter' && <span className="text-amber-400 text-xs">✓</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('trafficking')}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                      category === 'trafficking'
                        ? 'bg-red-950 text-white border-red-700 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <span>🚚 Trafficking / Truck</span>
                    {category === 'trafficking' && <span className="text-amber-400 text-xs">✓</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('general_abuse')}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                      category === 'general_abuse'
                        ? 'bg-red-950 text-white border-red-700 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <span>🩹 Severe Injury / Abuse</span>
                    {category === 'general_abuse' && <span className="text-amber-400 text-xs">✓</span>}
                  </button>
                </div>
              </div>

              {/* 3. Brief Narrative (Textarea) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-zinc-950 flex items-center justify-between">
                  <span>Brief Narrative <span className="text-red-600">*</span></span>
                  <span className="text-[10px] text-zinc-500 font-normal">Speak or type what is happening</span>
                </label>

                {/* Voice Dictation Button via Web Speech API */}
                <VoiceDictationButton
                  onTranscript={(text) => {
                    setNarrative((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
                    if (narrativeError) setNarrativeError(null);
                  }}
                  currentValue={narrative}
                  fieldLabel="Emergency Narrative"
                  placeholderPrompt="Speak situation in English or Kiswahili..."
                />

                <textarea
                  value={narrative}
                  onChange={(e) => {
                    setNarrative(e.target.value);
                    if (narrativeError) setNarrativeError(null);
                  }}
                  rows={3}
                  placeholder="Describe the situation briefly (or use the voice button above)..."
                  className={`w-full p-3 rounded-xl border text-xs sm:text-sm text-zinc-900 bg-zinc-50 outline-none transition-all resize-none ${
                    narrativeError
                      ? 'border-red-500 ring-2 ring-red-200 bg-red-50/50'
                      : 'border-zinc-300 focus:border-red-600 focus:ring-2 focus:ring-red-100'
                  }`}
                  required
                />
                {narrativeError && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{narrativeError}</span>
                  </p>
                )}

                {/* Quick Helper Phrase Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
                  <span className="text-[10px] font-bold text-zinc-400 whitespace-nowrap">Quick Tag:</span>
                  {[
                    'Stolen right now',
                    'Loading into lorry',
                    'Suspects heading to market',
                    'Severely injured bleeding',
                    'Bush slaughter in riverbed',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleInsertQuickPhrase(chip)}
                      className="px-2 py-0.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold whitespace-nowrap transition-all border border-zinc-200"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Optional Photo */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-black text-zinc-950 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5 text-zinc-700" />
                    <span>Attach Photo <span className="text-zinc-400 font-normal">(Optional)</span></span>
                  </span>
                  <span className="text-[10px] text-zinc-500">Camera snapshot or file</span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />

                {photoPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-900 group h-36 flex items-center justify-center">
                    <img
                      src={photoPreview}
                      alt="Incident scene evidence"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-between p-3">
                      <span className="text-xs text-white font-bold bg-black/60 px-2.5 py-1 rounded-lg backdrop-blur-xs">
                        Photo Attached
                      </span>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="p-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all shadow-md active:scale-95"
                        title="Remove photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-3 rounded-2xl border-2 border-dashed border-zinc-300 hover:border-red-400 bg-zinc-50/70 hover:bg-red-50/30 flex items-center justify-center gap-2 text-xs font-bold text-zinc-700 transition-all active:scale-98"
                  >
                    <Camera className="w-4 h-4 text-red-600" />
                    <span>Take Photo or Upload Evidence (Optional)</span>
                  </button>
                )}
              </div>

              {/* Number of Donkeys (Quick Select) */}
              <div className="flex items-center justify-between p-2.5 bg-zinc-50 rounded-xl border border-zinc-200 text-xs">
                <span className="font-bold text-zinc-800">Donkeys Involved:</span>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, '5+'].map((cnt) => {
                    const val = typeof cnt === 'number' ? cnt : 5;
                    const isSelected = donkeysCount === val;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setDonkeysCount(val)}
                        className={`w-7 h-7 rounded-lg font-black text-xs transition-all ${
                          isSelected
                            ? 'bg-red-700 text-white shadow-2xs'
                            : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {cnt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Submit Action Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-red-600 via-red-700 to-red-800 hover:from-red-700 hover:to-red-900 text-white font-black py-3.5 px-4 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all border border-red-900 disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />
                  <span>
                    {isSubmitting 
                      ? 'AI Proximity Dispatching...' 
                      : '🚨 Submit Emergency Report & Auto-Dispatch'}
                  </span>
                </button>
                <p className="text-[10px] text-zinc-500 text-center mt-1.5">
                  AI will calculate proximity and immediately alert the nearest Super User on live GPS.
                </p>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
