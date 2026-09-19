import React, { useState, useEffect } from 'react';
import { 
  X, Camera, MapPin, AlertTriangle, ShieldCheck, 
  Upload, ChevronRight, CheckCircle2, PhoneCall, 
  Trash2, ShieldAlert, Navigation, EyeOff, Plus, RefreshCw, Radio,
  Skull, Truck, HeartCrack, Mic, Sparkles
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CaseCategory, CaseUrgency, DonkeyCase, LocationData, CasePhoto, UserProfile } from '../types';
import { CATEGORY_INFO, KITUI_SUB_COUNTIES, EMERGENCY_HOTLINE, HOTLINE_DISPLAY, SUB_COUNTY_COORDINATES, INITIAL_OFFICERS } from '../data/mockData';
import { getProximityAllocationRecommendation, backgroundLocationTracker } from '../services/locationService';
import { allocateCaseWithAI } from '../services/aiAllocationService';
import { VoiceDictationButton } from './VoiceDictationButton';

interface ReportCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCase: (newCase: Omit<DonkeyCase, 'id' | 'trackingCode' | 'reportedAt' | 'status' | 'actionLogs'>) => void;
  currentUser?: UserProfile | null;
  userPhone?: string;
  userName?: string;
}

// Find closest Kitui Sub-county based on phone GPS coords
function findClosestSubCounty(lat: number, lng: number): string {
  let closestName = 'Kitui Central';
  let minDistance = Infinity;
  for (const [name, coords] of Object.entries(SUB_COUNTY_COORDINATES)) {
    const d = Math.hypot(lat - coords.lat, lng - coords.lng);
    if (d < minDistance) {
      minDistance = d;
      closestName = name;
    }
  }
  return closestName;
}

export const ReportCaseModal: React.FC<ReportCaseModalProps> = ({
  isOpen,
  onClose,
  onSubmitCase,
  currentUser,
  userPhone = '',
  userName = '',
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedCase, setSubmittedCase] = useState<{ id: string; trackingCode: string } | null>(null);

  // Form State
  const [category, setCategory] = useState<CaseCategory>('donkey_theft');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [donkeysCount, setDonkeysCount] = useState<number>(1);
  const [urgency, setUrgency] = useState<CaseUrgency>('high');
  const [incidentDateTime, setIncidentDateTime] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );

  // Location Fields
  const [county, setCounty] = useState('Kitui');
  const [subCounty, setSubCounty] = useState('Kitui Central');
  const [ward, setWard] = useState('Township');
  const [subLocation, setSubLocation] = useState('');
  const [village, setVillage] = useState('');
  const [landmark, setLandmark] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string>('Detecting GPS location...');

  // Auto-acquire Phone GPS and subscribe to live movement updates while Modal is open
  useEffect(() => {
    if (!isOpen) return;

    setIsLocating(true);
    setGpsStatusMessage('Acquiring real-time GPS coordinates...');

    // Subscribe to live device movement updates
    const unsubscribe = backgroundLocationTracker.subscribe((coords, accuracy) => {
      const lat = Number(coords.lat.toFixed(5));
      const lng = Number(coords.lng.toFixed(5));
      setCoordinates({ lat, lng });
      setIsLocating(false);
      setGpsStatusMessage(`GPS Active: ${lat}, ${lng} (±${Math.round(accuracy || 10)}m accuracy)`);

      // If coordinates are in/near Kitui, auto-match sub-county if not already set
      setSubCounty((prevSc) => {
        if (!prevSc || prevSc === 'Kitui Central') {
          const detectedSubCounty = findClosestSubCounty(lat, lng);
          const cfg = KITUI_SUB_COUNTIES.find((sc) => sc.name === detectedSubCounty);
          if (cfg && cfg.wards.length > 0) {
            setWard(cfg.wards[0]);
          }
          return detectedSubCounty;
        }
        return prevSc;
      });
    });

    // Also trigger immediate one-time fix with zero cache
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(5));
          const lng = Number(pos.coords.longitude.toFixed(5));
          setCoordinates({ lat, lng });
          setIsLocating(false);
          setGpsStatusMessage(`GPS Locked: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy || 10)}m accuracy)`);
        },
        (err) => {
          console.warn('Geolocation notice:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    }

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  // Suspects
  const [suspectDescription, setSuspectDescription] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [routeDirection, setRouteDirection] = useState('');

  // Photos
  const [photos, setPhotos] = useState<CasePhoto[]>([]);

  // Reporter
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [reporterName, setReporterName] = useState(userName || '');
  const [reporterPhone, setReporterPhone] = useState(userPhone || '');
  const [relationship, setRelationship] = useState<'owner' | 'neighbor' | 'witness' | 'local_leader' | 'vet'>('owner');

  if (!isOpen) return null;

  const currentSubCountyConfig = KITUI_SUB_COUNTIES.find((sc) => sc.name === subCounty) || KITUI_SUB_COUNTIES[0];

  const handleSubCountyChange = (scName: string) => {
    setSubCounty(scName);
    const cfg = KITUI_SUB_COUNTIES.find((sc) => sc.name === scName);
    if (cfg && cfg.wards.length > 0) {
      setWard(cfg.wards[0]);
    }
  };

  const handleFetchCurrentLocation = () => {
    setIsLocating(true);
    setGpsStatusMessage('Acquiring fresh real-time GPS coordinates...');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(5));
          const lng = Number(pos.coords.longitude.toFixed(5));
          setCoordinates({ lat, lng });
          setIsLocating(false);
          setGpsStatusMessage(`GPS Locked: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy || 10)}m accuracy)`);
        },
        () => {
          setCoordinates({
            lat: -1.3688,
            lng: 38.0108,
          });
          setIsLocating(false);
          setGpsStatusMessage('Using Kitui Central location reference');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
    } else {
      setCoordinates({
        lat: -1.3688,
        lng: 38.0108,
      });
      setIsLocating(false);
      setGpsStatusMessage('Geolocation not supported, using Kitui base');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const url = uploadEvent.target?.result as string;
        if (url) {
          setPhotos((prev) => [
            ...prev,
            {
              id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              url,
              caption: file.name,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const addSamplePhoto = (sampleUrl: string, sampleCaption: string) => {
    setPhotos((prev) => [
      ...prev,
      {
        id: `sample-${Date.now()}`,
        url: sampleUrl,
        caption: sampleCaption,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const baseCoords = SUB_COUNTY_COORDINATES[subCounty] || { lat: -1.3688, lng: 38.0108 };
    const jitterLat = (Math.random() - 0.5) * 0.03;
    const jitterLng = (Math.random() - 0.5) * 0.03;
    const finalCoordinates = coordinates || {
      lat: Number((baseCoords.lat + jitterLat).toFixed(5)),
      lng: Number((baseCoords.lng + jitterLng).toFixed(5)),
    };

    const location: LocationData = {
      county,
      subCounty,
      ward,
      subLocation: subLocation.trim() || `${ward} Sub-Location`,
      village: village.trim() || 'Village not specified',
      landmark: landmark.trim() || 'Near local centre',
      coordinates: finalCoordinates,
    };

    const aiResult = allocateCaseWithAI(
      {
        category,
        urgency,
        title: title.trim() || `${CATEGORY_INFO[category].label} in ${village || ward}`,
        description: description.trim(),
        location,
        donkeysCount: Number(donkeysCount) || 1,
      },
      INITIAL_OFFICERS
    );

    const newCasePayload: Omit<DonkeyCase, 'id' | 'trackingCode' | 'reportedAt' | 'status' | 'actionLogs'> = {
      category,
      title: title.trim() || `${CATEGORY_INFO[category].label} in ${village || ward}`,
      description: description.trim(),
      donkeysCount: Number(donkeysCount) || 1,
      incidentDateTime,
      urgency,
      reporterUserId: currentUser?.id,
      reporterUserPhone: currentUser?.phone || reporterPhone.trim() || undefined,
      location,
      photos,
      assignedOfficer: {
        id: aiResult.allocatedOfficer.id,
        name: aiResult.allocatedOfficer.name,
        title: aiResult.allocatedOfficer.roleTitle || aiResult.allocatedOfficer.designation || 'Super User',
        department: aiResult.allocatedOfficer.department || 'Caritas Command Desk',
        phone: aiResult.allocatedOfficer.phone,
      },
      aiAllocation: aiResult.metadata,
      suspectDetails: {
        description: suspectDescription.trim() || undefined,
        vehiclePlate: vehiclePlate.trim() || undefined,
        routeDirection: routeDirection.trim() || undefined,
      },
      reporter: {
        id: currentUser?.id,
        isAnonymous,
        name: isAnonymous ? undefined : reporterName.trim() || currentUser?.name || 'Community Resident',
        phone: isAnonymous ? undefined : reporterPhone.trim() || currentUser?.phone || undefined,
        relationship,
      },
    };

    setTimeout(() => {
      onSubmitCase(newCasePayload);
      setIsSubmitting(false);
      const generatedCode = `KR-${Math.floor(1000 + Math.random() * 9000)}`;
      setSubmittedCase({
        id: `KR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        trackingCode: generatedCode,
      });

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#991B1B', '#7F1D1D', '#18181B', '#FFFFFF'],
        });
      } catch (err) {}
    }, 500);
  };

  const handleResetAndClose = () => {
    setSubmittedCase(null);
    setStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[94dvh] sm:max-h-[88dvh]"
      >
        {/* Modal Top Header with Brick Red / Black Branding */}
        <div className="bg-gradient-to-r from-[#991B1B] via-[#7F1D1D] to-[#991B1B] text-white px-5 py-4 flex items-center justify-between shrink-0 border-b border-red-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-red-200">
                DIRA (Kaa Rada!) • Incident Report
              </div>
              <h2 className="text-base font-bold font-display text-white">
                Report Donkey Welfare Incident
              </h2>
            </div>
          </div>
          <button
            id="close-report-modal-btn"
            onClick={handleResetAndClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Container */}
        <div className="p-5 overflow-y-auto flex-1 text-zinc-900">
          {submittedCase ? (
            /* Submission Success View */
            <div className="py-6 text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-red-100 text-[#991B1B] flex items-center justify-center mb-4 ring-8 ring-red-50">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <span className="inline-block px-3 py-1 bg-zinc-100 text-zinc-900 text-xs font-bold rounded-full mb-2 border border-zinc-300">
                Case Successfully Logged
              </span>
              <h3 className="text-xl font-black font-display text-zinc-950 mb-1">
                Ripoti Imepokewa (Case Forwarded)
              </h3>
              <p className="text-xs text-zinc-600 max-w-sm mb-6">
                Your report is transmitted to Caritas Kitui welfare coordinators and local dispatch officers.
              </p>

              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 w-full max-w-sm mb-6 text-left space-y-2">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-200">
                  <span className="text-zinc-500 font-medium">Tracking Code</span>
                  <span className="font-mono font-bold text-[#991B1B] text-sm bg-red-50 px-2.5 py-0.5 rounded border border-red-200">
                    {submittedCase.trackingCode}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-200">
                  <span className="text-zinc-500 font-medium">Status</span>
                  <span className="font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-300">
                    Pending Officer Review
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 font-medium">Location</span>
                  <span className="font-semibold text-zinc-900">
                    {subCounty} • {ward}
                  </span>
                </div>
              </div>

              {/* Emergency Hotline fast dial */}
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 w-full max-w-sm mb-6 flex items-center justify-between gap-3 text-left">
                <div>
                  <div className="text-xs font-bold text-[#991B1B]">
                    Ongoing life-threatening emergency?
                  </div>
                  <div className="text-[11px] text-zinc-700">
                    Call toll-free <span className="font-bold">{HOTLINE_DISPLAY}</span>
                  </div>
                </div>
                <a
                  href={`tel:${EMERGENCY_HOTLINE}`}
                  className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Piga Sasa
                </a>
              </div>

              <button
                id="done-success-btn"
                onClick={handleResetAndClose}
                className="w-full max-w-sm bg-zinc-950 hover:bg-zinc-900 text-white font-bold py-3 rounded-xl text-xs sm:text-sm transition-all shadow-md"
              >
                Done & View in Portal
              </button>
            </div>
          ) : (
            /* Multi-Step Report Flow */
            <form onSubmit={handleFinalSubmit}>
              {/* Stepper Progress Bar */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-200">
                {[
                  { num: 1, label: 'Nature' },
                  { num: 2, label: 'Location & Photo' },
                  { num: 3, label: 'Suspects' },
                  { num: 4, label: 'Review' },
                ].map((s) => (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setStep(s.num as any)}
                    className={`flex items-center gap-1.5 text-xs font-bold transition-all ${
                      step === s.num
                        ? 'text-[#991B1B]'
                        : step > s.num
                        ? 'text-zinc-900'
                        : 'text-zinc-400'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        step === s.num
                          ? 'bg-[#991B1B] text-white'
                          : step > s.num
                          ? 'bg-zinc-900 text-white'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {step > s.num ? '✓' : s.num}
                    </span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                ))}
              </div>

              {/* STEP 1: Nature of Case */}
              {step === 1 && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
                      Select Case Category * (Aina ya Kesi)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(Object.keys(CATEGORY_INFO) as CaseCategory[]).map((catKey) => {
                        const info = CATEGORY_INFO[catKey];
                        const isSelected = category === catKey;
                        return (
                          <div
                            key={catKey}
                            id={`select-cat-${catKey}`}
                            onClick={() => setCategory(catKey)}
                            className={`cursor-pointer p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between relative group ${
                              isSelected
                                ? 'bg-red-50/90 border-[#991B1B] ring-2 ring-[#991B1B]/30 shadow-xs'
                                : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/60'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-2xs ${
                                  isSelected ? 'bg-white border-red-200 text-[#991B1B]' : 'bg-white border-zinc-200 text-zinc-700'
                                }`}>
                                  {catKey === 'donkey_theft' && <ShieldAlert className="w-4 h-4 text-[#DC2626]" />}
                                  {catKey === 'bush_slaughter' && <Skull className="w-4 h-4 text-[#7F1D1D]" />}
                                  {catKey === 'trafficking' && <Truck className="w-4 h-4 text-[#EA580C]" />}
                                  {catKey === 'general_abuse' && <HeartCrack className="w-4 h-4 text-[#9333EA]" />}
                                  {catKey === 'other' && <AlertTriangle className="w-4 h-4 text-zinc-600" />}
                                </div>
                                {isSelected ? (
                                  <span className="w-5 h-5 rounded-full bg-[#991B1B] text-white flex items-center justify-center text-xs">
                                    ✓
                                  </span>
                                ) : (
                                  <span className="w-4 h-4 rounded-full border border-zinc-300 group-hover:border-zinc-400" />
                                )}
                              </div>
                              <div className="font-bold text-xs sm:text-sm text-zinc-950">
                                {info.label}
                              </div>
                              <div className="text-[11px] font-bold text-[#991B1B] mt-0.5">
                                {info.swahiliLabel}
                              </div>
                            </div>
                            <p className="text-[11px] text-zinc-500 leading-snug mt-1.5 pt-1.5 border-t border-zinc-200/60">
                              {info.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Case Summary * (Kichwa cha Ripoti)
                    </label>
                    <input
                      id="case-title-input"
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. 3 Stolen donkeys missing from Kyatune boma"
                      className="w-full px-3 py-2.5 text-xs sm:text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">
                        Donkeys Count *
                      </label>
                      <input
                        id="case-donkeys-count-input"
                        type="number"
                        min="1"
                        max="200"
                        value={donkeysCount}
                        onChange={(e) => setDonkeysCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">
                        Urgency Level
                      </label>
                      <select
                        id="case-urgency-select"
                        value={urgency}
                        onChange={(e) => setUrgency(e.target.value as CaseUrgency)}
                        className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none font-medium"
                      >
                        <option value="critical">Critical (Ongoing / Slaughter)</option>
                        <option value="high">High (Theft &lt; 24h)</option>
                        <option value="medium">Medium (Abuse / Overload)</option>
                        <option value="low">Low (General Concern)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-zinc-700">
                        Incident Details * (Maelezo Kamili)
                      </label>
                      {description.trim() && (
                        <button
                          type="button"
                          onClick={() => setDescription('')}
                          className="text-[11px] text-zinc-500 hover:text-red-700 font-medium cursor-pointer"
                        >
                          Clear text
                        </button>
                      )}
                    </div>

                    {/* Web Speech API Voice Dictation Button */}
                    <VoiceDictationButton
                      onTranscript={(text, mode) => {
                        setDescription((prev) => {
                          const combined = prev.trim() ? `${prev.trim()} ${text}` : text;
                          if (!title.trim() && text.trim()) {
                            const candidate = text.split('.')[0].slice(0, 60);
                            setTitle(candidate);
                          }
                          return combined;
                        });
                      }}
                      currentValue={description}
                      fieldLabel="Incident Details"
                      placeholderPrompt="Describe what happened verbally..."
                    />

                    <textarea
                      id="case-description-input"
                      rows={3}
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what happened, visible injuries, marks, ear notches, or suspicious persons (or use the voice button above)..."
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      id="step1-next-btn"
                      type="button"
                      onClick={() => setStep(2)}
                      className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      Next: Location & Photos
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Location & Photos */}
              {step === 2 && (
                <div className="space-y-3.5">
                  {/* Automatic Phone GPS Indicator */}
                  <div className="bg-red-50/80 border border-red-200 rounded-2xl p-3 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#991B1B] text-white flex items-center justify-center shrink-0 mt-0.5">
                        <Radio className="w-4 h-4 animate-pulse" />
                      </div>
                      <div>
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#991B1B]">
                          Automatic Phone GPS Location
                        </div>
                        <div className="text-xs font-bold text-zinc-950">
                          {coordinates ? `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}` : 'Locating phone...'}
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          {gpsStatusMessage}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      id="refresh-phone-gps-btn"
                      onClick={handleFetchCurrentLocation}
                      disabled={isLocating}
                      className="text-[11px] font-bold text-[#991B1B] bg-white border border-red-300 hover:bg-red-100 px-2.5 py-1.5 rounded-xl flex items-center gap-1 shrink-0 transition-all shadow-2xs"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                      <span>{isLocating ? 'Updating...' : 'Re-scan'}</span>
                    </button>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5 uppercase tracking-wider">
                        <MapPin className="w-4 h-4 text-[#991B1B]" />
                        Sub-County & Ward (Kitui Area)
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-500 bg-white px-2 py-0.5 rounded-full border border-zinc-200">
                        Auto-assigned from GPS
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Sub-County *
                        </label>
                        <select
                          value={subCounty}
                          onChange={(e) => handleSubCountyChange(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] font-medium text-zinc-900 outline-none"
                        >
                          {KITUI_SUB_COUNTIES.map((sc) => (
                            <option key={sc.name} value={sc.name}>
                              {sc.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Ward *
                        </label>
                        <select
                          value={ward}
                          onChange={(e) => setWard(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] font-medium text-zinc-900 outline-none"
                        >
                          {currentSubCountyConfig.wards.map((w) => (
                            <option key={w} value={w}>
                              {w} Ward
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Sub-location * (Kitongoji)
                        </label>
                        <input
                          type="text"
                          required
                          value={subLocation}
                          onChange={(e) => setSubLocation(e.target.value)}
                          placeholder="e.g. Kivungoni"
                          className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Village * (Kijiji)
                        </label>
                        <input
                          type="text"
                          required
                          value={village}
                          onChange={(e) => setVillage(e.target.value)}
                          placeholder="e.g. Kyatune Village"
                          className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Landmark / Nearest Notable Spot * (Alama ya Eneo)
                      </label>
                      <input
                        type="text"
                        required
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        placeholder="e.g. 100m past Kwa Vonza Market near dispensary tank"
                        className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                      />
                    </div>
                  </div>

                  {/* Evidence Upload */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5 uppercase tracking-wider">
                        <Camera className="w-4 h-4 text-[#991B1B]" />
                        Photos / Evidence Upload (Picha)
                      </span>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {photos.length} photo(s) attached
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="cursor-pointer bg-white border-2 border-dashed border-zinc-300 hover:border-[#991B1B] rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all group">
                        <Upload className="w-5 h-5 text-zinc-400 group-hover:text-[#991B1B] mb-1" />
                        <span className="text-xs font-bold text-zinc-800 group-hover:text-[#991B1B]">
                          Upload Photo
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>

                      <div className="bg-white border border-zinc-200 rounded-xl p-2 flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Sample Photo Preset:
                        </span>
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() => addSamplePhoto('https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=600&auto=format&fit=crop&q=80', 'Bush Slaughter Remains')}
                            className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[10px] font-medium py-1 px-1 rounded text-center truncate"
                          >
                            + Bush Site
                          </button>
                          <button
                            type="button"
                            onClick={() => addSamplePhoto('https://images.unsplash.com/photo-1555169062-013468b47731?w=600&auto=format&fit=crop&q=80', 'Donkey Identity')}
                            className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[10px] font-medium py-1 px-1 rounded text-center truncate"
                          >
                            + Donkey ID
                          </button>
                        </div>
                      </div>
                    </div>

                    {photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {photos.map((photo) => (
                          <div key={photo.id} className="relative rounded-xl overflow-hidden border border-zinc-200 aspect-video bg-black">
                            <img
                              src={photo.url}
                              alt="Evidence"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() => removePhoto(photo.id)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold px-4 py-2.5 rounded-xl text-xs"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      Next: Suspects & Contact
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Suspects & Reporter Info */}
              {step === 3 && (
                <div className="space-y-3.5">
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 space-y-2.5">
                    <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5 uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4 text-zinc-800" />
                      Suspect / Vehicle Info (Optional)
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Vehicle Plate / Make
                        </label>
                        <input
                          type="text"
                          value={vehiclePlate}
                          onChange={(e) => setVehiclePlate(e.target.value)}
                          placeholder="e.g. KDL 452X Probox"
                          className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 uppercase outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                          Suspected Transit Route
                        </label>
                        <input
                          type="text"
                          value={routeDirection}
                          onChange={(e) => setRouteDirection(e.target.value)}
                          placeholder="e.g. Towards Kibwezi"
                          className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-semibold text-zinc-600">
                          Suspect Physical Descriptions (Maelezo ya Washukiwa)
                        </label>
                      </div>
                      <div className="space-y-1.5">
                        <VoiceDictationButton
                          onTranscript={(text) => {
                            setSuspectDescription((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
                          }}
                          currentValue={suspectDescription}
                          fieldLabel="Suspects"
                          placeholderPrompt="Describe suspects or vehicles..."
                        />
                        <input
                          type="text"
                          value={suspectDescription}
                          onChange={(e) => setSuspectDescription(e.target.value)}
                          placeholder="e.g. 2 men in blue gumboots with torch, or use voice dictation above"
                          className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Reporter Anonymity */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-zinc-200">
                      <input
                        id="anonymous-toggle-checkbox"
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                        className="w-4 h-4 text-[#991B1B] rounded focus:ring-[#991B1B]"
                      />
                      <label htmlFor="anonymous-toggle-checkbox" className="text-xs text-zinc-800 cursor-pointer flex-1">
                        <span className="font-bold flex items-center gap-1">
                          <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                          Keep My Identity Confidential (Ripoti ya Siri)
                        </span>
                        <p className="text-[11px] text-zinc-500">
                          Your contact will be kept strictly protected by Caritas Kitui welfare coordinators.
                        </p>
                      </label>
                    </div>

                    {!isAnonymous && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Your Name (Jina)
                          </label>
                          <input
                            type="text"
                            value={reporterName}
                            onChange={(e) => setReporterName(e.target.value)}
                            placeholder="e.g. Mwalimu James"
                            className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Phone Number (Simu)
                          </label>
                          <input
                            type="tel"
                            value={reporterPhone}
                            onChange={(e) => setReporterPhone(e.target.value)}
                            placeholder="e.g. 0722 000 000"
                            className="w-full px-2.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#991B1B] text-zinc-900 outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold px-4 py-2.5 rounded-xl text-xs"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      Review & Submit
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Review and Submit */}
              {step === 4 && (
                <div className="space-y-3.5">
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2.5 text-xs">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                      Summary Verification
                    </h3>

                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                      <span className="text-zinc-500 font-medium">Category</span>
                      <span className="font-bold text-[#991B1B] bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        {CATEGORY_INFO[category].label} ({CATEGORY_INFO[category].swahiliLabel})
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                      <span className="text-zinc-500 font-medium">Location</span>
                      <span className="font-semibold text-zinc-900 text-right">
                        {subCounty}, {ward} • {village || 'Village specified'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                      <span className="text-zinc-500 font-medium">Landmark</span>
                      <span className="text-zinc-700 text-right max-w-xs truncate">
                        {landmark || 'Near village centre'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                      <span className="text-zinc-500 font-medium">Donkeys Affected</span>
                      <span className="font-bold text-zinc-950">{donkeysCount} donkey(s)</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 font-medium">Photos</span>
                      <span className="font-bold text-zinc-950">{photos.length} item(s)</span>
                    </div>

                    {/* Proximity Auto-Allocation Preview */}
                    {(() => {
                      const tempLoc: LocationData = {
                        county,
                        subCounty,
                        ward,
                        subLocation,
                        village,
                        landmark,
                        coordinates: coordinates || SUB_COUNTY_COORDINATES[subCounty] || { lat: -1.3688, lng: 38.0108 },
                      };
                      const rec = getProximityAllocationRecommendation(tempLoc, INITIAL_OFFICERS);
                      return (
                        <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 space-y-1 mt-2">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase text-amber-900">
                            <span className="flex items-center gap-1">⚡ Auto-Dispatched Nearest Super User</span>
                            <span className="bg-amber-200 text-amber-950 px-1.5 py-0.2 rounded font-mono font-bold">{rec.distanceFormatted} away</span>
                          </div>
                          <div className="text-xs font-bold text-zinc-900">
                            {rec.recommendedOfficer.name} ({rec.recommendedOfficer.roleTitle})
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {rec.reason} • Est. response: ~{rec.estimatedResponseMins} mins
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-950 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#991B1B] shrink-0 mt-0.5" />
                    <span>
                      By submitting, this report is immediately transmitted to DIRA welfare coordinators and local authorities.
                    </span>
                  </div>

                  <div className="flex justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold px-4 py-2.5 rounded-xl text-xs"
                    >
                      Back
                    </button>
                    <button
                      id="submit-case-final-btn"
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-extrabold px-6 py-3 rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-red-950/20 active:scale-95 transition-all border border-red-800"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Forwarding Case...</span>
                        </div>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 text-white" />
                          <span>Tuma Ripoti (Submit Case)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
