import { Coordinates, LocationData, UserProfile, NearbyResponder, ProximityAllocationRecommendation, BackgroundLocationSettings } from '../types';
import { INITIAL_OFFICERS, SUB_COUNTY_COORDINATES } from '../data/mockData';
import { getStoredLoggedInDevices } from './deviceTrackingService';

const STORAGE_KEY_BG_SETTINGS = 'kaa_rada_bg_location_settings_v1';
const STORAGE_KEY_LAST_COORDS = 'kaa_rada_last_known_coords_v1';
const STORAGE_KEY_BREADCRUMBS = 'kaa_rada_location_breadcrumbs_v1';

// Default Kitui coordinates (Kitui Central / Mwingi West focus)
export const DEFAULT_KITUI_COORDINATES: Coordinates = {
  lat: -1.0500, // Mwingi West / Migwani / Ngutani area
  lng: 38.0108,
};

// Nairobi Coordinates (Capital Command Base)
export const NAIROBI_COORDINATES: Coordinates = {
  lat: -1.286389,
  lng: 36.817223,
};

/**
 * Detect location name and whether coordinates are in Nairobi or Kitui
 */
export function detectLocationInfo(coords: Coordinates): {
  name: string;
  isNairobi: boolean;
  isKitui: boolean;
  distanceToKituiKm: number;
} {
  const distToKitui = calculateDistanceKm(coords.lat, coords.lng, -1.3688, 38.0108);
  const isNrb = coords.lat >= -1.55 && coords.lat <= -1.10 && coords.lng >= 36.55 && coords.lng <= 37.25;
  const isKt = coords.lat >= -2.40 && coords.lat <= -0.50 && coords.lng >= 37.60 && coords.lng <= 38.80;

  let name = 'Field Coordinates';
  if (isNrb) {
    name = 'Nairobi (Capital Base)';
  } else if (distToKitui < 15) {
    name = 'Kitui Central / Town';
  } else if (isKt) {
    name = 'Kitui County';
  } else {
    name = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  }

  return {
    name,
    isNairobi: isNrb,
    isKitui: isKt,
    distanceToKituiKm: Math.round(distToKitui),
  };
}

// Kitui field headquarters and officer locations
export const SUPER_USER_LOCATIONS: Record<string, { coordinates: Coordinates; village: string; subCounty: string }> = {
  'super-user-1': {
    coordinates: { lat: -1.0667, lng: 38.0500 }, // Migwani DCC HQ
    village: 'Migwani HQ',
    subCounty: 'Mwingi West',
  },
  'super-user-2': {
    coordinates: { lat: -0.9350, lng: 38.0620 }, // Mwingi Central / West Command
    village: 'Mwingi Central / West Desk',
    subCounty: 'Mwingi West',
  },
  'super-user-3': {
    coordinates: { lat: -1.0250, lng: 37.9850 }, // Ngutani Police Station
    village: 'Ngutani Town',
    subCounty: 'Mwingi West',
  },
  'super-user-4': {
    coordinates: { lat: -1.0280, lng: 37.9890 }, // Ngutani Sub-County Office
    village: 'Ngutani Sub-County Office',
    subCounty: 'Mwingi West',
  },
  'super-user-5': {
    coordinates: { lat: -1.3688, lng: 38.0108 }, // Kitui Town HQ (Caritas)
    village: 'Kitui Town HQ',
    subCounty: 'Kitui Central',
  },
  'super-user-6': {
    coordinates: { lat: -1.3645, lng: 38.0160 }, // Kitui Project Office
    village: 'Kitui Project Office',
    subCounty: 'Kitui Central',
  },
};

// Primary user (Chief / Assistant Chief) locations mapping
export const PRIMARY_USER_VILLAGE_COORDINATES: Record<string, Coordinates> = {
  'NGONGONI': { lat: -1.0820, lng: 37.8920 },
  'KAKUMUTI': { lat: -1.0450, lng: 37.9120 },
  'NZANZI': { lat: -1.0120, lng: 37.8420 },
  'SYOINI': { lat: -1.0630, lng: 37.9310 },
  'KANYONGO': { lat: -1.0950, lng: 37.8710 },
  'MUTHALE': { lat: -1.1400, lng: 37.9800 },
  'MIGWANI': { lat: -1.0667, lng: 38.0500 },
  'NGUTANI': { lat: -1.0250, lng: 37.9850 },
  'THITANI': { lat: -0.9850, lng: 38.0120 },
  'NZAUNI': { lat: -1.1150, lng: 37.9250 },
  'KYOME': { lat: -1.0380, lng: 38.1200 },
  'MWINGI': { lat: -0.9234, lng: 38.3129 },
  'KITUI TOWN': { lat: -1.3688, lng: 38.0108 },
};

/**
 * Computes geodesic distance in kilometers between two GPS coordinates using Haversine formula
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Formats distance in readable meters or kilometers
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Estimates response drive time (average 35 km/h on Kitui mixed roads)
 */
export function estimateDriveTimeMinutes(distanceKm: number): number {
  if (distanceKm <= 0.2) return 2;
  const hours = distanceKm / 35;
  return Math.max(3, Math.round(hours * 60));
}

/**
 * Estimates response motorcycle / boda time (average 40 km/h)
 */
export function estimateMotorcycleTimeMinutes(distanceKm: number): number {
  if (distanceKm <= 0.2) return 1;
  const hours = distanceKm / 40;
  return Math.max(2, Math.round(hours * 60));
}

/**
 * Determines proximity category
 */
export function getProximityCategory(
  distanceKm: number
): 'immediate' | 'nearby' | 'moderate' | 'distant' {
  if (distanceKm <= 3.5) return 'immediate';
  if (distanceKm <= 12) return 'nearby';
  if (distanceKm <= 30) return 'moderate';
  return 'distant';
}

/**
 * Get coordinates for a super user or fallback to sub-county centroid
 */
export function getOfficerCoordinates(officer: UserProfile): Coordinates {
  if (!officer) return DEFAULT_KITUI_COORDINATES;
  if (officer?.coordinates) return officer.coordinates;
  if (officer?.lastKnownLocation?.coordinates) return officer.lastKnownLocation.coordinates;

  const preloaded = officer.id ? SUPER_USER_LOCATIONS[officer.id] : undefined;
  if (preloaded?.coordinates) return preloaded.coordinates;

  if (officer.village) {
    const villageUpper = officer.village.toUpperCase();
    for (const [key, coords] of Object.entries(PRIMARY_USER_VILLAGE_COORDINATES)) {
      if (villageUpper.includes(key)) return coords;
    }
  }

  if (officer?.subCounty && SUB_COUNTY_COORDINATES[officer.subCounty]) {
    return SUB_COUNTY_COORDINATES[officer.subCounty];
  }

  return DEFAULT_KITUI_COORDINATES;
}

/**
 * Rank and detect all nearby super users based on real phone location data
 */
export function rankNearbySuperUsers(
  originCoords: Coordinates,
  officers: UserProfile[] = INITIAL_OFFICERS
): NearbyResponder[] {
  let pool: UserProfile[] = (officers || []).filter((off) => off && off.role === 'super_user');

  // If no super users explicitly passed, pull dynamically from stored logged-in devices
  if (pool.length === 0) {
    const devices = getStoredLoggedInDevices();
    const superDevices = devices.filter((d) => d && d.userRole === 'super_user');
    const devicePool = superDevices.length > 0 ? superDevices : devices;

    pool = devicePool.map((d) => ({
      id: d.userId,
      name: d.userName,
      role: (d.userRole === 'super_user' ? 'super_user' : 'primary_user') as any,
      phone: d.userPhone,
      roleTitle: d.userDesignation,
      designation: d.userDesignation,
      subCounty: d.subCounty,
      village: d.village,
      coordinates: d.coordinates,
      isOnline: d.isOnline,
      department: d.userRole === 'super_user' ? 'Field Response Command' : 'Community Leadership Desk',
    }));
  }

  const responders: NearbyResponder[] = pool.filter(Boolean).map((officer) => {
    const coords = getOfficerCoordinates(officer);
    const dist = calculateDistanceKm(
      originCoords?.lat ?? -1.3688,
      originCoords?.lng ?? 38.0108,
      coords.lat,
      coords.lng
    );

    const isOnline = officer.isOnline ?? true;

    return {
      user: {
        ...officer,
        coordinates: coords,
      },
      distanceKm: dist,
      distanceFormatted: formatDistance(dist),
      estimatedDriveTimeMins: estimateDriveTimeMinutes(dist),
      estimatedMotorcycleTimeMins: estimateMotorcycleTimeMinutes(dist),
      proximityCategory: getProximityCategory(dist),
      isOnline,
      lastUpdatedFormatted: 'Live Phone GPS',
    };
  });

  // Sort by closest distance first
  responders.sort((a, b) => a.distanceKm - b.distanceKm);
  return responders;
}

/**
 * Case Allocation Recommendation based on proximity to where the case has been reported
 */
export function getProximityAllocationRecommendation(
  caseLocation?: LocationData | null,
  officers: UserProfile[] = INITIAL_OFFICERS
): ProximityAllocationRecommendation {
  // Determine case coordinates safely
  let caseCoords: Coordinates = caseLocation?.coordinates || DEFAULT_KITUI_COORDINATES;

  if (!caseLocation?.coordinates && caseLocation?.subCounty && SUB_COUNTY_COORDINATES[caseLocation.subCounty]) {
    caseCoords = SUB_COUNTY_COORDINATES[caseLocation.subCounty];
  }

  const allNearby = rankNearbySuperUsers(caseCoords, officers);
  const fallbackOfficer: UserProfile = {
    id: 'dispatch-central',
    name: 'Kitui Central Dispatch Officer',
    role: 'super_user',
    roleTitle: 'Emergency Command Desk',
    phone: '+254712753886',
    subCounty: 'Kitui Central',
    village: 'Kitui Town HQ',
    coordinates: DEFAULT_KITUI_COORDINATES,
    isOnline: true,
  };

  const bestOfficerResponder = allNearby[0] || {
    user: fallbackOfficer,
    distanceKm: 0,
    distanceFormatted: '0 km',
    estimatedDriveTimeMins: 5,
    estimatedMotorcycleTimeMins: 3,
    proximityCategory: 'immediate' as const,
    isOnline: true,
    lastUpdatedFormatted: 'Central Command',
  };

  const reason = `${bestOfficerResponder.user.name} (${bestOfficerResponder.user.roleTitle || bestOfficerResponder.user.designation}) is stationed just ${bestOfficerResponder.distanceFormatted} from ${caseLocation?.village || caseLocation?.subCounty || 'the incident location'}, allowing the fastest estimated response time (~${bestOfficerResponder.estimatedMotorcycleTimeMins} mins).`;

  return {
    recommendedOfficer: bestOfficerResponder.user,
    distanceKm: bestOfficerResponder.distanceKm,
    distanceFormatted: bestOfficerResponder.distanceFormatted,
    estimatedResponseMins: bestOfficerResponder.estimatedMotorcycleTimeMins,
    reason,
    allNearbyOfficers: allNearby,
  };
}

/**
 * Storage helpers for background location settings
 */
export function getStoredBackgroundLocationSettings(): BackgroundLocationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BG_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        enabled: true,
        collectWhenNotInUse: true,
        trackingStatus: 'active',
      };
    }
  } catch (err) {
    console.warn('Could not read background location settings:', err);
  }

  return {
    enabled: true,
    collectWhenNotInUse: true,
    highAccuracy: true,
    updateIntervalSeconds: 15,
    trackingStatus: 'active',
    currentCoordinates: DEFAULT_KITUI_COORDINATES,
  };
}

export function saveBackgroundLocationSettings(settings: BackgroundLocationSettings): void {
  try {
    // Live GPS is strictly enforced: always keep enabled and active
    const lockedSettings: BackgroundLocationSettings = {
      ...settings,
      enabled: true,
      collectWhenNotInUse: true,
      trackingStatus: 'active',
    };
    localStorage.setItem(STORAGE_KEY_BG_SETTINGS, JSON.stringify(lockedSettings));
  } catch (err) {
    console.warn('Could not save background location settings:', err);
  }
}

export function getStoredLastKnownLocation(): Coordinates {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_COORDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return NAIROBI_COORDINATES;
}

export function saveLastKnownLocation(coords: Coordinates, accuracy?: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_COORDS, JSON.stringify(coords));
    
    // Save breadcrumb to history log (keep last 30)
    const breadcrumb = {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: accuracy || 10,
      timestamp: new Date().toISOString(),
    };
    
    const existingRaw = localStorage.getItem(STORAGE_KEY_BREADCRUMBS);
    const crumbs = existingRaw ? JSON.parse(existingRaw) : [];
    crumbs.unshift(breadcrumb);
    localStorage.setItem(STORAGE_KEY_BREADCRUMBS, JSON.stringify(crumbs.slice(0, 30)));
  } catch (err) {
    console.warn('Error saving location breadcrumb:', err);
  }
}

export interface LocationUpdateDetails {
  speedKmh?: number;
  headingDeg?: number;
  isMoving?: boolean;
  distanceMovedMeters?: number;
  timestamp: string;
}

export type LocationListener = (
  coords: Coordinates,
  accuracy?: number,
  details?: LocationUpdateDetails
) => void;

/**
 * Active Background Location Tracking Watcher
 * Continuously tracks device movement via GPS watchPosition and updates real-time position
 */
class BackgroundLocationTracker {
  private watchId: number | null = null;
  private wakeLockSentinel: any = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<LocationListener> = new Set();
  private isCollecting = false;
  private lastCoords: Coordinates | null = null;
  private lastTimestamp = 0;
  private lastAccuracy = 10;
  private lastDetails: LocationUpdateDetails = {
    isMoving: false,
    timestamp: new Date().toISOString(),
  };

  public subscribe(cb: LocationListener): () => void {
    this.listeners.add(cb);
    // Immediately emit last known position if available
    if (this.lastCoords) {
      try {
        cb(this.lastCoords, this.lastAccuracy, this.lastDetails);
      } catch (e) {
        console.error('Initial subscriber location error:', e);
      }
    }
    return () => this.listeners.delete(cb);
  }

  private notify(coords: Coordinates, accuracy?: number, details?: LocationUpdateDetails) {
    saveLastKnownLocation(coords, accuracy);
    this.lastCoords = coords;
    this.lastAccuracy = accuracy || 10;
    if (details) {
      this.lastDetails = details;
    }

    this.listeners.forEach((cb) => {
      try {
        cb(coords, accuracy, details || this.lastDetails);
      } catch (e) {
        console.error('Error in location listener:', e);
      }
    });
  }

  private processPosition(pos: GeolocationPosition) {
    const coords: Coordinates = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };

    let distanceMovedMeters = 0;
    if (this.lastCoords) {
      distanceMovedMeters = Math.round(
        calculateDistanceKm(this.lastCoords.lat, this.lastCoords.lng, coords.lat, coords.lng) * 1000
      );
    }

    const speedKmh =
      pos.coords.speed !== null && pos.coords.speed !== undefined && pos.coords.speed >= 0
        ? Math.round(pos.coords.speed * 3.6)
        : undefined;

    const headingDeg =
      pos.coords.heading !== null && pos.coords.heading !== undefined && pos.coords.heading >= 0
        ? Math.round(pos.coords.heading)
        : undefined;

    const isMoving = (speedKmh !== undefined && speedKmh > 1) || distanceMovedMeters >= 2;

    const details: LocationUpdateDetails = {
      speedKmh,
      headingDeg,
      isMoving,
      distanceMovedMeters,
      timestamp: new Date().toISOString(),
    };

    this.notify(coords, pos.coords.accuracy, details);
  }

  public async startTracking(collectWhenNotInUse = true): Promise<boolean> {
    if (this.isCollecting) return true;
    this.isCollecting = true;

    // 1. Acquire WakeLock if supported and allowed, so tracking continues smoothly
    if (collectWhenNotInUse && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel?.addEventListener?.('release', () => {
          // Re-acquire when page becomes visible again
        });
      } catch {
        // WakeLock may be rejected in low battery or iframe, graceful fallback
      }
    }

    // 2. Start HTML5 geolocation watchPosition & immediate fix
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      try {
        // Immediate one-time fix to resolve current location with zero cache
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            this.processPosition(pos);
          },
          (err) => {
            console.warn('Initial geolocation fetch notice:', err.message);
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );

        this.restartWatch();
      } catch (err) {
        console.warn('Failed to start geolocation watch:', err);
      }
    }

    // 3. Heartbeat timer for active polling as device moves (ensures continuous GPS fixes)
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            this.processPosition(pos);
          },
          () => {
            // Heartbeat fallback
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
        );
      }
    }, 5000);

    // 4. Handle visibility change so background location collection is persistent
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    return true;
  }

  private restartWatch = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    if (this.watchId !== null) {
      try {
        navigator.geolocation.clearWatch(this.watchId);
      } catch {}
      this.watchId = null;
    }

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.processPosition(position);
        },
        (err) => {
          console.warn('Geolocation watch notice:', err.message);
          // If timeout or transient loss, auto-rearm watchPosition
          if (err.code === 3) {
            setTimeout(this.restartWatch, 2000);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0, // CRITICAL: zero cache to get real location updates when device moves
          timeout: 10000,
        }
      );
    } catch (e) {
      console.warn('Error starting watchPosition:', e);
    }
  };

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      // Re-acquired focus: trigger immediate position check
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            this.processPosition(pos);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
      }
      this.restartWatch();
    }
  };

  public stopTracking() {
    // Live GPS is permanently active for officer proximity allocation and cannot be turned off.
    // We restart or maintain tracking to ensure uninterrupted responder dispatch capability.
    if (!this.isCollecting) {
      this.startTracking(true);
    }
  }

  public setManualSimulation(coords: Coordinates) {
    this.notify(coords, 5);
  }

  public getSettings(): BackgroundLocationSettings {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_BG_SETTINGS);
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            ...parsed,
            enabled: true,
            collectWhenNotInUse: true,
            trackingStatus: 'active',
          };
        }
      } catch (e) {
        console.error('Failed to parse saved background settings:', e);
      }
    }
    return {
      enabled: true,
      collectWhenNotInUse: true,
      highAccuracy: true,
      updateIntervalSeconds: 15,
      trackingStatus: 'active',
    };
  }
}

export const backgroundLocationTracker = new BackgroundLocationTracker();
