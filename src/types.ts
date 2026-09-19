export type CaseCategory = 
  | 'donkey_theft' 
  | 'trafficking' 
  | 'bush_slaughter' 
  | 'general_abuse' 
  | 'other';

export type CaseUrgency = 'critical' | 'high' | 'medium' | 'low';

export interface Coordinates {
  lat: number;
  lng: number;
}

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
  coordinates?: Coordinates;
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
  isEmergency?: boolean;
  emergencyPhone?: string;
  aiAllocation?: AIAllocationMetadata;
}

export interface AIAllocationMetadata {
  officerId: string;
  officerName: string;
  officerRole: string;
  officerPhone: string;
  officerDepartment?: string;
  distanceKm: number;
  distanceFormatted: string;
  estimatedArrivalMins: number;
  reason: string;
  allocatedAt: string;
  isAutomatic: boolean;
  tacticalNotes?: string;
}

export type UserRole = 
  | 'super_admin'
  | 'primary_user' 
  | 'super_user' 
  | 'field_officer' 
  | 'chief_officer' 
  | 'village_elder' 
  | 'veterinary_officer' 
  | 'donkey_owner';

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
  coordinates?: Coordinates;
  lastKnownLocation?: {
    coordinates: Coordinates;
    timestamp: string;
    accuracy?: number;
    speed?: number | null;
    village?: string;
    subCounty?: string;
  };
  isOnline?: boolean;
  statusMessage?: string;
  activeAssignedCasesCount?: number;
}

export interface NearbyResponder {
  user: UserProfile;
  distanceKm: number;
  distanceFormatted: string;
  estimatedDriveTimeMins: number;
  estimatedMotorcycleTimeMins: number;
  proximityCategory: 'immediate' | 'nearby' | 'moderate' | 'distant';
  isOnline: boolean;
  lastUpdatedFormatted: string;
}

export interface LoggedInDevice {
  deviceId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userPhone: string;
  userDesignation?: string;
  subCounty?: string;
  village?: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  deviceModel: string;
  coordinates: Coordinates;
  accuracyMeters?: number;
  lastActive: string;
  loggedInAt: string;
  isOnline: boolean;
  batteryLevel?: number | null;
  speedKmh?: number;
  headingDeg?: number;
  isMoving?: boolean;
}

export interface DeviceMovementState {
  coords: Coordinates;
  accuracy: number;
  speedKmh?: number;
  headingDeg?: number;
  isMoving: boolean;
  distanceMovedMeters?: number;
  lastUpdated: string;
}

export interface ProximityAllocationRecommendation {
  recommendedOfficer: UserProfile;
  distanceKm: number;
  distanceFormatted: string;
  estimatedResponseMins: number;
  reason: string;
  allNearbyOfficers: NearbyResponder[];
}

export interface BackgroundLocationSettings {
  enabled: boolean;
  collectWhenNotInUse: boolean;
  highAccuracy: boolean;
  updateIntervalSeconds: number;
  lastSyncedTimestamp?: string;
  currentCoordinates?: Coordinates;
  accuracyMeters?: number;
  trackingStatus: 'active' | 'paused' | 'permission_denied' | 'idle';
}

export interface SubCountyConfig {
  name: string;
  wards: string[];
  prominentVillages: string[];
  hotspotRisk: 'high' | 'medium' | 'low';
  commonIncidents: CaseCategory[];
}

export interface InAppNotification {
  id: string;
  caseId: string;
  trackingCode: string;
  category: CaseCategory;
  urgency: CaseUrgency;
  title: string;
  village: string;
  subCounty: string;
  donkeysCount: number;
  reportedAt: string;
  isRead: boolean;
  reporterName?: string;
  reportedByCurrentUser?: boolean;
}

export interface VoiceNoteAttachment {
  audioUrl: string; // Base64 data URL
  durationSeconds: number;
  mimeType?: string;
  waveform?: number[];
}

export interface MediaAttachment {
  type: 'image' | 'document';
  url: string; // Base64 data URL
  fileName: string;
  fileSizeFormatted?: string;
  fileSizeBytes?: number;
  mimeType?: string;
}

export interface DiraMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhone?: string;
  senderRole: UserRole;
  senderSubCounty?: string;
  channelId: string;
  content: string;
  timestamp: string;
  caseTrackingCode?: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
  };
  attachmentUrl?: string;
  voiceNote?: VoiceNoteAttachment;
  mediaAttachment?: MediaAttachment;
  callInfo?: {
    callId: string;
    callType: CallType;
    status: CallStatus;
    isGroup: boolean;
    targetUserName?: string;
  };
  delivered?: boolean;
}

export interface ChatChannel {
  id: string;
  name: string;
  description: string;
  iconName: 'alert' | 'users' | 'search' | 'shield';
  requiresOfficerRole?: boolean;
  badge?: string;
}

export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended' | 'rejected' | 'busy';

export interface CallParticipant {
  id: string;
  name: string;
  phone?: string;
  role?: UserRole;
  subCounty?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  joinedAt?: string;
  isLocal?: boolean;
}

export interface ActiveCallSession {
  callId: string;
  channelId?: string;
  channelName?: string;
  callType: CallType;
  isGroup: boolean;
  initiator: {
    id: string;
    name: string;
    role?: UserRole;
    phone?: string;
  };
  initiatorDeviceId?: string;
  targetDeviceId?: string;
  targetDeviceName?: string;
  targetUser?: {
    id: string;
    name: string;
    phone?: string;
    role?: UserRole;
  };
  participants: CallParticipant[];
  status: CallStatus;
  startedAt: string;
  connectedAt?: string;
}

export interface CallSignalMessage {
  type: 'CALL_INVITE' | 'CALL_ACCEPT' | 'CALL_REJECT' | 'CALL_END' | 'CALL_OFFER' | 'CALL_ANSWER' | 'CALL_CANDIDATE' | 'CALL_JOIN' | 'CALL_LEAVE' | 'CALL_PARTICIPANT_UPDATE';
  callId: string;
  channelId?: string;
  callType: CallType;
  isGroup: boolean;
  caller: {
    id: string;
    name: string;
    role?: UserRole;
    phone?: string;
  };
  targetUserId?: string; // If direct call
  participant?: CallParticipant;
  sdp?: any;
  candidate?: any;
  timestamp: string;
}

