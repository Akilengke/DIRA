import { 
  DonkeyCase, 
  UserProfile, 
  Coordinates, 
  ActionLog, 
  AIAllocationMetadata, 
  CaseCategory 
} from '../types';
import { 
  INITIAL_OFFICERS, 
  SUB_COUNTY_COORDINATES 
} from '../data/mockData';
import { 
  calculateDistanceKm, 
  formatDistance, 
  estimateMotorcycleTimeMinutes, 
  getOfficerCoordinates, 
  PRIMARY_USER_VILLAGE_COORDINATES, 
  DEFAULT_KITUI_COORDINATES 
} from './locationService';
import { getStoredLoggedInDevices } from './deviceTrackingService';

export interface AIAllocationResult {
  allocatedOfficer: UserProfile;
  distanceKm: number;
  distanceFormatted: string;
  estimatedArrivalMins: number;
  reason: string;
  tacticalNotes: string;
  actionLog: ActionLog;
  metadata: AIAllocationMetadata;
  rankedCandidates: Array<{
    officer: UserProfile;
    distanceKm: number;
    distanceFormatted: string;
    estimatedArrivalMins: number;
    score: number;
    matchReasons: string[];
  }>;
}

/**
 * Resolves case coordinates with fallbacks for village, sub-county, or Kitui default
 */
export function resolveCaseCoordinates(caseData: {
  location?: {
    coordinates?: Coordinates;
    village?: string;
    subCounty?: string;
  };
}): Coordinates {
  if (caseData.location?.coordinates && 
      typeof caseData.location.coordinates.lat === 'number' && 
      typeof caseData.location.coordinates.lng === 'number') {
    return caseData.location.coordinates;
  }

  // Fallback 1: match village in known village coordinates
  const villageUpper = (caseData.location?.village || '').toUpperCase().trim();
  if (villageUpper) {
    for (const [key, coords] of Object.entries(PRIMARY_USER_VILLAGE_COORDINATES)) {
      if (villageUpper.includes(key) || key.includes(villageUpper)) {
        return coords;
      }
    }
  }

  // Fallback 2: match sub-county centroid
  const sc = caseData.location?.subCounty;
  if (sc && SUB_COUNTY_COORDINATES[sc]) {
    return SUB_COUNTY_COORDINATES[sc];
  }

  return DEFAULT_KITUI_COORDINATES;
}

/**
 * Core AI Proximity & Operational Case Allocation Engine
 * Automatically assesses spatial distance, officer jurisdiction, incident urgency, and operational suitability.
 */
export function allocateCaseWithAI(
  caseData: {
    category?: CaseCategory;
    urgency?: string;
    title?: string;
    description?: string;
    location?: {
      village?: string;
      subCounty?: string;
      coordinates?: Coordinates;
    };
    isEmergency?: boolean;
    donkeysCount?: number;
  },
  availableOfficers: UserProfile[] = INITIAL_OFFICERS
): AIAllocationResult {
  const incidentCoords = resolveCaseCoordinates(caseData);
  let officers = availableOfficers.filter((off) => off.role === 'super_user');

  // If no super users explicitly passed, pull dynamically from stored logged-in devices
  if (officers.length === 0) {
    const devices = getStoredLoggedInDevices();
    const superDevices = devices.filter((d) => d.userRole === 'super_user');
    const devicePool = superDevices.length > 0 ? superDevices : devices;

    officers = devicePool.map((d) => ({
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
      department: d.userRole === 'super_user' ? 'Field Response Command' : 'Community Leadership Unit',
    }));
  }

  const scoredCandidates = officers.map((officer) => {
    const officerCoords = getOfficerCoordinates(officer);
    const dist = calculateDistanceKm(
      incidentCoords.lat,
      incidentCoords.lng,
      officerCoords.lat,
      officerCoords.lng
    );

    const matchReasons: string[] = [];

    // 1. Distance scoring (inverse decay - maximum points for under 3km)
    // 0km -> 100pts, 5km -> 50pts, 15km -> 25pts, 35km -> 12pts
    let score = 100 / (1 + dist * 0.2);
    matchReasons.push(`Live Proximity: ${formatDistance(dist)}`);

    // 2. Immediate proximity bonus (< 5km is critical for fast intervention)
    if (dist <= 3) {
      score += 40;
      matchReasons.push('Immediate Strike Zone (<3 km)');
    } else if (dist <= 8) {
      score += 20;
      matchReasons.push('Nearby Response Range (<8 km)');
    }

    // 3. Sub-county territorial match
    if (caseData.location?.subCounty && 
        officer.subCounty && 
        caseData.location.subCounty.toLowerCase().trim() === officer.subCounty.toLowerCase().trim()) {
      score += 25;
      matchReasons.push(`Territorial Station Match: ${officer.subCounty}`);
    }

    // 4. Role & Jurisdiction Tactical Suitability
    const cat = caseData.category || 'donkey_theft';
    const descLower = `${caseData.title || ''} ${caseData.description || ''}`.toLowerCase();
    const designation = (officer.designation || officer.roleTitle || '').toUpperCase();

    // A: Theft / Slaughter -> Police & Enforcement have high jurisdiction
    if (cat === 'donkey_theft' || cat === 'bush_slaughter') {
      if (designation.includes('OCS') || designation.includes('POLICE')) {
        score += 35;
        matchReasons.push('Police Interception Authority');
      } else if (designation.includes('DCC') || designation.includes('ACC')) {
        score += 25;
        matchReasons.push('Administrative Roadblock Command');
      } else if (designation.includes('SCAPC')) {
        score += 20;
        matchReasons.push('Animal Protection Command');
      }
    }

    // B: Trafficking -> DCC / ACC & Administration for highway intercepts
    if (cat === 'trafficking' || descLower.includes('lorry') || descLower.includes('truck')) {
      if (designation.includes('DCC') || designation.includes('ACC')) {
        score += 35;
        matchReasons.push('Sub-County Transit & Border Checkpoint Command');
      } else if (designation.includes('OCS')) {
        score += 30;
        matchReasons.push('Roadblock Intercept Unit');
      }
    }

    // C: General Abuse / Veterinary Emergency / Injuries
    if (cat === 'general_abuse' || descLower.includes('injur') || descLower.includes('wound') || descLower.includes('sick')) {
      if (designation.includes('PROJECT MANAGER') || designation.includes('DIRECTOR') || officer.department?.includes('Caritas')) {
        score += 35;
        matchReasons.push('Caritas Vet & Welfare Clinic Mobilization');
      }
    }

    // D: Emergency Urgency Modifier
    if (caseData.isEmergency || caseData.urgency === 'critical') {
      if (dist <= 6) {
        score += 30;
        matchReasons.push('Emergency Fast-Arrival Priority');
      }
    }

    const estMins = estimateMotorcycleTimeMinutes(dist);

    return {
      officer,
      distanceKm: dist,
      distanceFormatted: formatDistance(dist),
      estimatedArrivalMins: estMins,
      score: Math.round(score),
      matchReasons,
    };
  });

  // Sort by highest score first (falls back to shortest distance)
  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.distanceKm - b.distanceKm;
  });

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

  const best = scoredCandidates[0] || {
    officer: officers[0] || fallbackOfficer,
    distanceKm: 0,
    distanceFormatted: '0 km',
    estimatedArrivalMins: 3,
    score: 100,
    matchReasons: ['Default Response Dispatch'],
  };

  const villageOrSubCounty = caseData.location?.village || caseData.location?.subCounty || 'Incident Location';
  const roleTitle = best.officer.roleTitle || best.officer.designation || 'Super User';

  const reason = `AI Proximity Dispatch automatically matched ${best.officer.name} (${roleTitle}), stationed ${best.distanceFormatted} from ${villageOrSubCounty}. Rapid response ETA: ~${best.estimatedArrivalMins} mins via motorcycle/patrol. Key qualifications: ${best.matchReasons.join(', ')}.`;

  const tacticalNotes = `Automatic AI Incident Dispatch. Location GPS: [${incidentCoords.lat.toFixed(4)}, ${incidentCoords.lng.toFixed(4)}]. Primary Responder: ${best.officer.name} (${best.officer.phone}). Sector: ${best.officer.subCounty || 'Kitui'}. Immediate mobilization ordered.`;

  const timestamp = new Date().toISOString();

  const actionLog: ActionLog = {
    id: `log-ai-alloc-${Date.now()}`,
    timestamp,
    officer: 'DIRA AI Dispatch Engine',
    action: '⚡ AI Auto-Allocated by Proximity',
    notes: reason,
    newStatus: 'dispatched',
  };

  const metadata: AIAllocationMetadata = {
    officerId: best.officer.id,
    officerName: best.officer.name,
    officerRole: roleTitle,
    officerPhone: best.officer.phone,
    officerDepartment: best.officer.department,
    distanceKm: best.distanceKm,
    distanceFormatted: best.distanceFormatted,
    estimatedArrivalMins: best.estimatedArrivalMins,
    reason,
    allocatedAt: timestamp,
    isAutomatic: true,
    tacticalNotes,
  };

  return {
    allocatedOfficer: best.officer,
    distanceKm: best.distanceKm,
    distanceFormatted: best.distanceFormatted,
    estimatedArrivalMins: best.estimatedArrivalMins,
    reason,
    tacticalNotes,
    actionLog,
    metadata,
    rankedCandidates: scoredCandidates,
  };
}

/**
 * Runs an AI auto-allocation sweep across an array of cases, allocating any case
 * that has not yet been assigned to an officer or has status 'reported' / 'pending'.
 */
export function autoAllocateCasesBatch(
  cases: DonkeyCase[],
  officers: UserProfile[] = INITIAL_OFFICERS
): DonkeyCase[] {
  return cases.map((c) => {
    // If case already resolved or already has an active assigned officer, keep it
    if (c.status === 'resolved' || c.status === 'dismissed' || (c.assignedOfficer && c.aiAllocation)) {
      return c;
    }

    // Auto-allocate with AI
    const result = allocateCaseWithAI(c, officers);

    return {
      ...c,
      status: (c.status === 'reported' || c.status === 'pending') ? 'dispatched' : c.status,
      assignedOfficer: {
        id: result.allocatedOfficer.id,
        name: result.allocatedOfficer.name,
        title: result.allocatedOfficer.roleTitle || result.allocatedOfficer.designation || 'Super User',
        department: result.allocatedOfficer.department || 'Caritas Response Command',
        phone: result.allocatedOfficer.phone,
      },
      aiAllocation: result.metadata,
      actionLogs: [result.actionLog, ...(c.actionLogs || [])],
    };
  });
}
