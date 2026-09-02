export type CaseCategory = 
  | 'donkey_theft' 
  | 'trafficking' 
  | 'bush_slaughter' 
  | 'general_abuse' 
  | 'other';

export type CaseUrgency = 'critical' | 'high' | 'medium' | 'low';

export type CaseStatus = 
  | 'reported'
  | 'pending' 
  | 'under_review'
  | 'investigating' 
  | 'dispatched' 
  | 'resolved' 
  | 'dismissed';

export interface LocationData {
  county: string;
  subCounty: string;
  ward: string;
  subLocation: string;
  village: string;
  landmark: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface CasePhoto {
  id: string;
  url: string;
  caption?: string;
  timestamp: string;
}

export interface ActionLog {
  id: string;
  timestamp: string;
  officerName?: string;
  officerRole?: string;
  officer?: string;
  action: string;
  note?: string;
  notes?: string;
  newStatus?: CaseStatus;
  evidencePhoto?: string;
}

export interface CaseResolution {
  resolvedAt: string;
  officerName: string;
  officerRole: string;
  summary: string;
  donkeysRecovered: number;
  suspectsApprehended?: number;
  outcomeCategory?: 
    | 'recovered_safely' 
    | 'medical_treated' 
    | 'suspects_arrested' 
    | 'slaughter_prevented' 
    | 'donkeys_reunited' 
    | 'other';
  notes?: string;
}

export interface CaseRating {
  rating: number; // 1 to 5 stars
  feedback?: string;
  ratedAt: string;
  ratedByName?: string;
  ratedByPhone?: string;
}

export interface DonkeyCase {
  id: string;
  trackingCode: string;
  category: CaseCategory;
  title: string;
  description: string;
  donkeysCount: number;
  incidentDateTime: string;
  reportedAt: string;
  urgency: CaseUrgency;
  status: CaseStatus;
  reporterUserId?: string;
  reporterUserPhone?: string;
  location: LocationData;
  photos: CasePhoto[];
  suspectDetails?: {
    description?: string;
    vehiclePlate?: string;
    routeDirection?: string;
    namesOrAliases?: string;
  };
  reporter: {
    id?: string;
    isAnonymous: boolean;
    name?: string;
    phone?: string;
    nationalId?: string;
    relationship?: 'owner' | 'neighbor' | 'witness' | 'local_leader' | 'vet';
  };
  assignedOfficer?: {
    id: string;
    name: string;
    title: string;
    department: string;
    phone: string;
  };
  actionLogs: ActionLog[];
  resolution?: CaseResolution;
  resolutionNotes?: string;
  resolvedAt?: string;
  emergencyHotlineContacted?: boolean;
  userRating?: CaseRating;
}

export type UserRole = 'primary_user' | 'super_user';

export interface UserProfile {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  password?: string;
  email?: string;
  roleTitle?: string;
  title?: string;
  designation?: string; // e.g. 'CHIEF', 'A/CHIEF', 'VILLAGE ELDER', 'DCC', etc.
  subCounty?: string;
  village?: string;
  badgeNumber?: string;
  department?: string;
  organization?: string;
}

export interface SubCountyConfig {
  name: string;
  wards: string[];
  prominentVillages: string[];
  hotspotRisk: 'high' | 'medium' | 'low';
  commonIncidents: CaseCategory[];
}
