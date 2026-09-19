import React, { useState, useEffect, useMemo } from 'react';
import { 
  Radio, Shield, MapPin, Navigation, Phone, MessageSquare, 
  CheckCircle2, AlertTriangle, RefreshCw, Zap, Compass, 
  Clock, Award, ExternalLink, SlidersHorizontal, ChevronRight, Eye, Lock,
  Smartphone, Tablet, Monitor, Battery, LogOut
} from 'lucide-react';
import { DonkeyCase, UserProfile, NearbyResponder, Coordinates, BackgroundLocationSettings, LoggedInDevice } from '../types';
import { 
  rankNearbySuperUsers, 
  getProximityAllocationRecommendation, 
  calculateDistanceKm, 
  formatDistance, 
  estimateMotorcycleTimeMinutes,
  estimateDriveTimeMinutes,
  backgroundLocationTracker,
  SUPER_USER_LOCATIONS 
} from '../services/locationService';
import { 
  getStoredLoggedInDevices, 
  subscribeToLoggedInDevices, 
  getOrCreateDeviceId,
  isSampleDevice,
  isSuperAdmin,
} from '../services/deviceTrackingService';
import { INITIAL_OFFICERS } from '../data/mockData';

interface NearbySuperUsersMapSectionProps {
  userCoordinates: Coordinates;
  userAccuracy?: number;
  cases: DonkeyCase[];
  currentUser: UserProfile | null;
  bgSettings: BackgroundLocationSettings;
  onUpdateBgSettings: (newSettings: BackgroundLocationSettings) => void;
  onSelectOfficerOnMap?: (officer: UserProfile) => void;
  onSelectDeviceOnMap?: (device: LoggedInDevice) => void;
  onAllocateCaseToOfficer?: (caseId: string, officer: UserProfile, distanceKm: number) => void;
  onSimulateLocation?: (coords: Coordinates, label: string) => void;
  onLogoutDevice?: (device: LoggedInDevice) => void;
}

const LOCATION_PRESETS = [
  { label: 'Nairobi Command Base (Live Device)', coords: { lat: -1.286389, lng: 36.817223 } },
  { label: 'Ngutani Town (Field Base)', coords: { lat: -1.0250, lng: 37.9850 } },
  { label: 'Migwani HQ (Chief Command)', coords: { lat: -1.0667, lng: 38.0500 } },
  { label: 'Mwingi Central / West Command', coords: { lat: -0.9350, lng: 38.0620 } },
  { label: 'Kitui Town HQ (Caritas)', coords: { lat: -1.3688, lng: 38.0108 } },
  { label: 'Wikililye / Katulani Market', coords: { lat: -1.4502, lng: 38.0315 } },
];

export const NearbySuperUsersMapSection: React.FC<NearbySuperUsersMapSectionProps> = ({
  userCoordinates,
  userAccuracy = 12,
  cases,
  currentUser,
  bgSettings,
  onUpdateBgSettings,
  onSelectOfficerOnMap,
  onSelectDeviceOnMap,
  onAllocateCaseToOfficer,
  onSimulateLocation,
  onLogoutDevice,
}) => {
  const [selectedCaseIdForAllocation, setSelectedCaseIdForAllocation] = useState<string>(
    cases.find((c) => c.status === 'reported' || c.status === 'pending' || c.status === 'investigating')?.id || cases[0]?.id || ''
  );
  const [allocationSuccessMsg, setAllocationSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'devices' | 'allocation' | 'bg_settings'>('devices');

  // Stored devices in registry
  const [storedDevices, setStoredDevices] = useState<LoggedInDevice[]>(() => getStoredLoggedInDevices());

  useEffect(() => {
    const unsub = subscribeToLoggedInDevices((fresh) => {
      setStoredDevices(fresh);
    });
    return unsub;
  }, []);

  // Compute active devices ranked by proximity from your live location (real devices only)
  const rankedDevices = useMemo(() => {
    const thisDevId = getOrCreateDeviceId();
    const list = storedDevices.filter((d) => d && !isSampleDevice(d) && d.isOnline !== false);

    // If user is LOGGED IN: ensure their device is present and accurate
    if (currentUser) {
      const userDevId = `${thisDevId}_${currentUser.id}`;
      const currentEntry: LoggedInDevice = {
        deviceId: userDevId,
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        userPhone: currentUser.phone || '',
        userDesignation:
          currentUser.designation ||
          currentUser.roleTitle ||
          currentUser.title ||
          'Live Active Device',
        subCounty: currentUser.subCounty || 'Kitui Central',
        village: currentUser.village || 'Field Post',
        deviceType: 'mobile',
        deviceModel: 'This Device (Active)',
        coordinates: userCoordinates,
        accuracyMeters: Math.round(userAccuracy),
        lastActive: new Date().toISOString(),
        loggedInAt: new Date().toISOString(),
        isOnline: true,
        batteryLevel: 95,
      };

      const idx = list.findIndex(
        (d) =>
          d.deviceId === userDevId ||
          d.deviceId === thisDevId ||
          d.deviceId.startsWith(thisDevId) ||
          d.userId === currentUser.id
      );

      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          ...currentEntry,
          coordinates: userCoordinates,
          accuracyMeters: Math.round(userAccuracy),
          lastActive: new Date().toISOString(),
          isOnline: true,
        };
      } else {
        list.unshift(currentEntry);
      }

      return list
        .filter((d) => d && !isSampleDevice(d) && d.isOnline !== false)
        .map((dev) => {
          const coords =
            dev?.coordinates &&
            typeof dev.coordinates.lat === 'number' &&
            typeof dev.coordinates.lng === 'number'
              ? dev.coordinates
              : { lat: -1.3688, lng: 38.0108 };
          const distKm = calculateDistanceKm(userCoordinates.lat, userCoordinates.lng, coords.lat, coords.lng);
          const isCurrentDevice =
            dev.deviceId === userDevId ||
            dev.deviceId === thisDevId ||
            dev.deviceId.startsWith(thisDevId) ||
            dev.userId === currentUser.id;
          const estDriveMins = estimateDriveTimeMinutes(distKm);
          const estMotoMins = estimateMotorcycleTimeMinutes(distKm);

          return {
            device: dev,
            distKm,
            distanceFormatted: isCurrentDevice ? 'Your Device (0 m)' : formatDistance(distKm),
            isCurrentDevice,
            estDriveMins,
            estMotoMins,
          };
        })
        .sort((a, b) => {
          if (a.isCurrentDevice) return -1;
          if (b.isCurrentDevice) return 1;
          return a.distKm - b.distKm;
        });
    }

    // When LOGGED OUT: strictly filter out this device so it NEVER appears in logged-in devices
    return list
      .filter(
        (d) =>
          d &&
          !isSampleDevice(d) &&
          d.isOnline !== false &&
          d.deviceId !== thisDevId &&
          !d.deviceId.startsWith(thisDevId)
      )
      .map((dev) => {
        const coords =
          dev?.coordinates &&
          typeof dev.coordinates.lat === 'number' &&
          typeof dev.coordinates.lng === 'number'
            ? dev.coordinates
            : { lat: -1.3688, lng: 38.0108 };
        const distKm = calculateDistanceKm(userCoordinates.lat, userCoordinates.lng, coords.lat, coords.lng);
        const estDriveMins = estimateDriveTimeMinutes(distKm);
        const estMotoMins = estimateMotorcycleTimeMinutes(distKm);

        return {
          device: dev,
          distKm,
          distanceFormatted: formatDistance(distKm),
          isCurrentDevice: false,
          estDriveMins,
          estMotoMins,
        };
      })
      .sort((a, b) => a.distKm - b.distKm);
  }, [storedDevices, currentUser, userCoordinates, userAccuracy]);

  // If a case is selected, compute recommendation from the case's coordinates
  const selectedCase = cases.find((c) => c.id === selectedCaseIdForAllocation);
  const caseRecommendation = selectedCase?.location
    ? getProximityAllocationRecommendation(selectedCase.location, INITIAL_OFFICERS)
    : null;

  const handleExecuteAllocation = (officer: UserProfile, distKm: number) => {
    if (!selectedCaseIdForAllocation) return;
    if (onAllocateCaseToOfficer) {
      onAllocateCaseToOfficer(selectedCaseIdForAllocation, officer, distKm);
      setAllocationSuccessMsg(`Case assigned to ${officer.name} (${formatDistance(distKm)} from scene). Orders dispatched.`);
      setTimeout(() => setAllocationSuccessMsg(null), 5000);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-4 sm:p-5 space-y-4">
      {/* 1. Header & Live Radar Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center shrink-0 shadow-xs relative">
            <Radio className="w-5 h-5 animate-pulse text-emerald-400" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full border-2 border-white animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black font-display text-zinc-950">
                Active Logged-In Devices & Proximity Radar
              </h3>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-200">
                Live GPS
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Real-time proximity detection of active logged-in devices & rapid case allocation
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-2xl text-xs font-bold self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'devices'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span>Logged-In Devices ({rankedDevices.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('allocation')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
              activeTab === 'allocation'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>Case Allocation</span>
          </button>
          <button
            onClick={() => setActiveTab('bg_settings')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
              activeTab === 'bg_settings'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Background GPS</span>
          </button>
        </div>
      </div>

      {/* 2. Success Alert Message */}
      {allocationSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{allocationSuccessMsg}</span>
        </div>
      )}

      {/* 3. Background Location Status Banner */}
      <div className="bg-gradient-to-r from-zinc-900 to-zinc-950 text-white rounded-2xl p-3 sm:p-3.5 border border-zinc-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
          <div className="text-xs">
            <div className="font-bold flex items-center gap-2">
              <span>Background Location Collection:</span>
              <span className="px-2 py-0.2 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
                Active (Tracking When Not In Use)
              </span>
            </div>
            <div className="text-zinc-400 text-[11px]">
              Current GPS: {userCoordinates.lat.toFixed(4)}, {userCoordinates.lng.toFixed(4)} • Precision ±{Math.round(userAccuracy)}m
            </div>
          </div>
        </div>

        {/* Fast Location Preset Simulator */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-400 font-semibold hidden md:inline">Simulate Location:</span>
          <select
            onChange={(e) => {
              const preset = LOCATION_PRESETS.find((p) => p.label === e.target.value);
              if (preset && onSimulateLocation) {
                onSimulateLocation(preset.coords, preset.label);
              }
            }}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl px-2.5 py-1 border border-zinc-700 outline-none"
          >
            <option value="">Jump Kitui Coordinates...</option>
            {LOCATION_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: Logged-In Devices List */}
      {activeTab === 'devices' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-700">
              Active Devices Detected (Ranked by Proximity from your Live Location)
            </span>
            <span className="text-emerald-700 font-bold">{rankedDevices.length} Devices Online & Logged In</span>
          </div>

          {rankedDevices.length === 0 ? (
            <div className="bg-zinc-50 border border-dashed border-zinc-300 rounded-2xl p-8 text-center">
              <Smartphone className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <div className="font-bold text-zinc-800 text-sm">No Other Logged-In Devices</div>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
                Real hardware devices will appear here in real time as officers and community field reporters sign in across Kitui.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {rankedDevices.map((item, idx) => {
                const { device, distKm, distanceFormatted, isCurrentDevice, estMotoMins, estDriveMins } = item;
                const isNearest = idx === 0;

                return (
                  <div
                    key={device.deviceId}
                    className={`rounded-2xl p-3.5 border transition-all relative flex flex-col justify-between ${
                      isCurrentDevice
                        ? 'bg-blue-50/50 border-blue-300 shadow-xs'
                        : isNearest
                        ? 'bg-emerald-50/50 border-emerald-300 shadow-xs'
                        : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    {isCurrentDevice ? (
                      <div className="absolute -top-2.5 right-3 bg-blue-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                        <Navigation className="w-2.5 h-2.5" />
                        <span>Your Device</span>
                      </div>
                    ) : isNearest ? (
                      <div className="absolute -top-2.5 right-3 bg-emerald-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5" />
                        <span>Nearest Device</span>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shrink-0 ${
                            isCurrentDevice
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {device.deviceType === 'tablet' ? '📟' : device.deviceType === 'desktop' ? '💻' : '📱'}
                          </div>
                          <div>
                            <div className="font-black text-xs sm:text-sm text-zinc-950 leading-tight">
                              {device.userName}
                            </div>
                            <div className="text-[11px] font-bold text-[#991B1B]">
                              {device.userDesignation || device.userRole}
                            </div>
                            <div className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                              <span className="font-semibold text-zinc-700">{device.deviceModel}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono font-black text-xs text-zinc-900">
                            {distanceFormatted}
                          </div>
                          <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded inline-block ${
                            isCurrentDevice
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : distKm < 5
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-zinc-200 text-zinc-700'
                          }`}>
                            {isCurrentDevice ? 'Self' : distKm < 5 ? 'Immediate' : distKm < 25 ? 'Nearby' : 'Sub-County'}
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-2 rounded-xl border border-zinc-200 text-[11px] space-y-1">
                        <div className="text-zinc-600 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-[#991B1B] shrink-0" />
                          <span className="font-semibold text-zinc-900">{device.village}</span>
                          <span className="text-zinc-400">({device.subCounty})</span>
                        </div>
                        <div className="flex items-center justify-between text-zinc-500 text-[10px]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-400" />
                            <span>🛵 ~{estMotoMins}m / 🚙 ~{estDriveMins}m</span>
                          </span>
                          <span className="font-semibold text-emerald-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            Logged In
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 pt-3 mt-2 border-t border-zinc-200/80">
                      <a
                        href={`tel:${device.userPhone}`}
                        className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-1.5 px-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-all active:scale-95"
                      >
                        <Phone className="w-3 h-3 text-red-400" />
                        <span>Call ({device.userPhone.slice(-4)})</span>
                      </a>

                      {/* Super Admin Remote Logout Action */}
                      {isSuperAdmin(currentUser) && onLogoutDevice && (
                        <button
                          onClick={() => onLogoutDevice(device)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 active:scale-95 text-red-700 rounded-xl border border-red-200 transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="Super Admin: Terminate session and remove device icon from live map"
                        >
                          <LogOut className="w-3.5 h-3.5 text-red-600" />
                          <span className="hidden sm:inline text-[11px]">Log Out</span>
                        </button>
                      )}

                      {onSelectDeviceOnMap && (
                        <button
                          onClick={() => onSelectDeviceOnMap(device)}
                          className="p-1.5 bg-white hover:bg-zinc-100 text-zinc-800 rounded-xl border border-zinc-300 transition-all text-xs font-bold flex items-center gap-1"
                          title="Locate Device on Map"
                        >
                          <MapPin className="w-4 h-4 text-[#991B1B]" />
                          <span className="hidden sm:inline text-[11px]">Pin</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Case Allocation Based on Proximity */}
      {activeTab === 'allocation' && (
        <div className="space-y-4">
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  Automated Proximity-Based Case Dispatching
                </span>
                <h4 className="text-sm font-black text-zinc-950">
                  Select Incident Case to Allocate to Nearest Logged-In Device
                </h4>
              </div>

              {cases.length > 0 && (
                <select
                  value={selectedCaseIdForAllocation}
                  onChange={(e) => setSelectedCaseIdForAllocation(e.target.value)}
                  className="bg-white border border-amber-300 text-xs font-bold text-zinc-900 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.trackingCode} — {c.title.slice(0, 30)} ({c.location?.village || 'Kitui'}, {c.donkeysCount} Donkeys)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedCase && caseRecommendation ? (
              <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">
                      Incident Location: {selectedCase.location?.village || 'Incident Area'}, {selectedCase.location?.subCounty || 'Kitui'}
                    </div>
                    <div className="text-sm font-black text-zinc-950 mt-0.5">
                      Case #{selectedCase.trackingCode}: {selectedCase.title}
                    </div>
                    <div className="text-xs text-zinc-600 mt-1 leading-relaxed">
                      {caseRecommendation.reason}
                    </div>
                  </div>

                  <div className="bg-amber-100 text-amber-950 border border-amber-300 px-3 py-2 rounded-xl text-center shrink-0">
                    <div className="text-[10px] font-bold uppercase text-amber-800">Proximity</div>
                    <div className="text-base font-black font-mono">{caseRecommendation.distanceFormatted}</div>
                    <div className="text-[10px] font-bold text-amber-800">~{caseRecommendation.estimatedResponseMins} mins response</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-950 text-emerald-300 flex items-center justify-center font-bold text-xs">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-zinc-900">
                        {caseRecommendation.recommendedOfficer.name}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {caseRecommendation.recommendedOfficer.roleTitle} • Tel: {caseRecommendation.recommendedOfficer.phone}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleExecuteAllocation(caseRecommendation.recommendedOfficer, caseRecommendation.distanceKm)}
                    className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all border border-red-800"
                  >
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>⚡ Auto-Allocate to Nearest Device</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-zinc-500">
                No active case selected. Report a case first or load sample scenarios to test allocation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Background Location Collection Settings */}
      {activeTab === 'bg_settings' && (
        <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-4 text-xs">
          <div className="space-y-1">
            <h4 className="text-sm font-black text-zinc-950">
              Background Location Tracking Architecture
            </h4>
            <p className="text-zinc-600 leading-relaxed">
              When enabled, DIRA collects location data even when the app is minimized, locked, or running in the background. This ensures that field response units and devices that have logged in are always tracked relative to live incident reports for instantaneous dispatching.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-zinc-200">
              <div className="pr-3">
                <div className="font-bold text-zinc-900 flex items-center gap-2">
                  <span>Collect Location Even When Not In Use</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase flex items-center gap-1 border border-emerald-300">
                    <Lock className="w-2.5 h-2.5" /> ALWAYS ON (LOCKED)
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Mandatory safety directive: My Live GPS is permanently active for instant proximity dispatch and rapid emergency response. Users cannot turn it off.
                </div>
              </div>
              <input
                type="checkbox"
                checked={true}
                disabled={true}
                readOnly={true}
                className="w-5 h-5 accent-emerald-600 rounded cursor-not-allowed opacity-90"
                title="Live GPS is permanently active and cannot be turned off"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-zinc-200">
              <div>
                <div className="font-bold text-zinc-900">High Precision GPS Sensor</div>
                <div className="text-[11px] text-zinc-500">
                  Uses hardware satellite GPS with high accuracy rather than IP/cell tower approximations
                </div>
              </div>
              <input
                type="checkbox"
                checked={bgSettings.highAccuracy}
                onChange={(e) =>
                  onUpdateBgSettings({
                    ...bgSettings,
                    highAccuracy: e.target.checked,
                  })
                }
                className="w-5 h-5 accent-[#991B1B] rounded cursor-pointer"
              />
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-start gap-2">
              <Navigation className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Kitui Field Security & Battery Optimization:</div>
                <div className="text-[11px] text-blue-800 leading-normal">
                  DIRA throttles background queries to 15-second cycles to conserve battery life during extended patrols across Mwingi West and rural Kitui terrain.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
