import { DonkeyCase, SubCountyConfig, UserProfile, CaseCategory } from '../types';

export const EMERGENCY_HOTLINE = '0800000890';
export const HOTLINE_DISPLAY = '0800 000 890';
export const ORG_NAME = 'Caritas Kitui';
export const APP_NAME = 'DIRA';
export const APP_FULL_NAME = 'DIRA (Donkey Incident Reporting APP)';
export const APP_TAGLINE = 'Kaa Rada!';

export const CATEGORY_INFO: Record<CaseCategory, {
  label: string;
  swahiliLabel: string;
  description: string;
  color: string;
  dotColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  iconName: string;
}> = {
  donkey_theft: {
    label: 'Donkey Theft',
    swahiliLabel: 'Wizi wa Punda',
    description: 'Stolen working donkeys from homesteads, grazing fields, or markets.',
    color: '#DC2626',
    dotColor: '#DC2626', // Bright Red
    badgeBg: 'bg-red-50',
    badgeBorder: 'border-red-200',
    badgeText: 'text-red-800',
    iconName: 'ShieldAlert',
  },
  bush_slaughter: {
    label: 'Illegal / Bush Slaughter',
    swahiliLabel: 'Uchinjaji Haramu',
    description: 'Clandestine slaughter of stolen donkeys for illicit meat and skins in riverbeds or thickets.',
    color: '#7F1D1D',
    dotColor: '#7F1D1D', // Dark Maroon / Blood Red
    badgeBg: 'bg-red-100/80',
    badgeBorder: 'border-red-300',
    badgeText: 'text-red-950',
    iconName: 'Skull',
  },
  trafficking: {
    label: 'Trafficking of Donkeys',
    swahiliLabel: 'Usafirishaji Haramu',
    description: 'Illegal transit of donkeys via lorries or pickups across sub-counties or borders without permits.',
    color: '#EA580C',
    dotColor: '#EA580C', // Bright Amber / Orange
    badgeBg: 'bg-orange-50',
    badgeBorder: 'border-orange-200',
    badgeText: 'text-orange-900',
    iconName: 'Truck',
  },
  general_abuse: {
    label: 'General Abuse & Neglect',
    swahiliLabel: 'Ukatili na Majeraha',
    description: 'Beating, excessive overloading, untreated open harness sores, abandonment, or tethering without water.',
    color: '#9333EA',
    dotColor: '#9333EA', // Vivid Purple
    badgeBg: 'bg-purple-50',
    badgeBorder: 'border-purple-200',
    badgeText: 'text-purple-900',
    iconName: 'HeartCrack',
  },
  other: {
    label: 'Other Welfare Incident',
    swahiliLabel: 'Kesi Nyingine',
    description: 'Road accidents involving donkeys, stray disputes, or veterinary emergencies.',
    color: '#475569',
    dotColor: '#475569', // Slate Gray
    badgeBg: 'bg-slate-50',
    badgeBorder: 'border-slate-200',
    badgeText: 'text-slate-700',
    iconName: 'HelpCircle',
  },
};

export const KITUI_SUB_COUNTIES: SubCountyConfig[] = [
  {
    name: 'Kitui South',
    wards: ['Mutomo', 'Ikutha', 'Kanziko', 'Athi', 'Mutha'],
    prominentVillages: ['Kyatune', 'Kivungoni', 'Ikutha Town', 'Mutomo Market', 'Kavisuni', 'Kasunganywa'],
    hotspotRisk: 'high',
    commonIncidents: ['bush_slaughter', 'donkey_theft', 'trafficking'],
  },
  {
    name: 'Kitui Central',
    wards: ['Miambani', 'Township', 'Kyangwithya West', 'Mulango', 'Kyangwithya East'],
    prominentVillages: ['Ithookwe', 'Kalundu', 'Kaveta', 'Syongila', 'Kunda Kindu', 'Kanyonyoo'],
    hotspotRisk: 'medium',
    commonIncidents: ['general_abuse', 'donkey_theft'],
  },
  {
    name: 'Kitui Rural',
    wards: ['Kisasi', 'Mbitini', 'Kwavonza/Yatta', 'Kanyangi'],
    prominentVillages: ['Kwa Vonza Center', 'Kisasi Market', 'Katutu', 'Nguuni', 'Kanyangi', 'Mbitini Junction'],
    hotspotRisk: 'high',
    commonIncidents: ['donkey_theft', 'bush_slaughter'],
  },
  {
    name: 'Kitui East',
    wards: ['Zombe/Mwitika', 'Nzambani', 'Chuluni', 'Voo/Kyamatu', 'Endau/Malalani', 'Mutito/Kaliku'],
    prominentVillages: ['Zombe Market', 'Chuluni Center', 'Endau Town', 'Voo', 'Malalani Border', 'Inyanzaa'],
    hotspotRisk: 'high',
    commonIncidents: ['trafficking', 'donkey_theft'],
  },
  {
    name: 'Kitui West',
    wards: ['Mutonguni', 'Kauwi', 'Matinyani', 'Kwa Mutonga/Kithumula'],
    prominentVillages: ['Kabati Market', 'Matinyani Center', 'Musengo', 'Kauwi', 'Tulungungu'],
    hotspotRisk: 'medium',
    commonIncidents: ['general_abuse', 'donkey_theft'],
  },
  {
    name: 'Mwingi Central',
    wards: ['Central', 'Kivou', 'Nguni', 'Nuu', 'Mui', 'Waita'],
    prominentVillages: ['Mwingi Town', 'Nguni Livestock Market', 'Nuu Center', 'Waita', 'Mui Basin', 'Mbondoni'],
    hotspotRisk: 'high',
    commonIncidents: ['trafficking', 'donkey_theft', 'bush_slaughter'],
  },
  {
    name: 'Mwingi North',
    wards: ['Ngomeni', 'Kyuso', 'Mumoni', 'Tseikuru', 'Tharaka'],
    prominentVillages: ['Tseikuru Market', 'Kyuso Town', 'Ngomeni', 'Katse', 'Kathungweni'],
    hotspotRisk: 'high',
    commonIncidents: ['trafficking', 'donkey_theft'],
  },
  {
    name: 'Mwingi West',
    wards: ['Kyome/Thaana', 'Nguutani', 'Migwani', 'Kiomo/Kyethani'],
    prominentVillages: ['Migwani Town', 'Nguutani Market', 'Kyome', 'Kakumuti', 'Thitani'],
    hotspotRisk: 'medium',
    commonIncidents: ['general_abuse', 'donkey_theft'],
  },
];

export const SUB_COUNTY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Kitui Central': { lat: -1.3688, lng: 38.0108 },
  'Kitui South': { lat: -1.8291, lng: 38.1633 },
  'Kitui Rural': { lat: -1.5422, lng: 38.0125 },
  'Kitui East': { lat: -1.3400, lng: 38.4500 },
  'Kitui West': { lat: -1.2500, lng: 37.9500 },
  'Mwingi Central': { lat: -0.9234, lng: 38.3129 },
  'Mwingi North': { lat: -0.4500, lng: 38.1500 },
  'Mwingi West': { lat: -1.0500, lng: 37.8500 },
};

// Super Admin Account for System Administration
export const SUPER_ADMIN_ACCOUNT: UserProfile = {
  id: 'usr-super-admin',
  role: 'super_admin',
  name: 'Super Admin',
  phone: 'admin',
  email: 'admin@dira.ke',
  password: 'admin',
  roleTitle: 'System Super Administrator',
  designation: 'Super Administrator',
  department: 'Kitui County Equine Command & Oversight',
  organization: 'DIRA County Administration',
  badgeNumber: 'SUPER-ADMIN-01',
  subCounty: 'Kitui Central',
  village: 'County Command HQ',
  coordinates: { lat: -1.3688, lng: 38.0108 },
  isOnline: true,
};

// All legacy accounts deleted per user requirement: clean slate with Super Admin
export const INITIAL_OFFICERS: UserProfile[] = [];
export const INITIAL_PRIMARY_USERS: UserProfile[] = [];

export const ALL_PRELOADED_USERS: UserProfile[] = [
  SUPER_ADMIN_ACCOUNT,
];

export const DEFAULT_PRIMARY_USER: UserProfile | null = null;

// Helper to generate a realistic deterministic/dynamic OTP code from phone digits
export function generateOtpForPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '1234';
  // Compute deterministic 4-digit code using digits
  let hash = 0;
  for (let i = 0; i < digits.length; i++) {
    hash = (hash * 31 + digits.charCodeAt(i)) % 9000;
  }
  const code = (1000 + hash).toString();
  return code;
}

// Initial realistic baseline cases across Kitui County:
// - Kitui South has 4 cases (MOST cases -> Concentrated deep red)
// - Kitui Central has 2 cases (Moderate red)
// - Kitui Rural has 1 case (FEW cases -> Light red)
// - Mwingi Central has 1 case (FEW cases -> Light red)
// - Other subcounties have 0 cases (Unshaded)
export const INITIAL_CASES: DonkeyCase[] = [
  {
    id: 'case-ks-01',
    trackingCode: 'KR-9011',
    category: 'bush_slaughter',
    title: 'Illegal Bush Slaughter Discovered in Riverbed',
    description: 'Remains of 3 working pack donkeys found slaughtered for illegal meat in dry riverbed near Mutomo Market. Tracks lead towards Kibwezi highway.',
    donkeysCount: 3,
    incidentDateTime: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    reportedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    urgency: 'critical',
    status: 'investigating',
    location: {
      county: 'Kitui',
      subCounty: 'Kitui South',
      ward: 'Mutomo',
      subLocation: 'Mutomo Central',
      village: 'Mutomo Market',
      landmark: 'Near River Tiva Crossing',
      coordinates: { lat: -1.8450, lng: 38.2100 },
    },
    photos: [],
    reporter: {
      isAnonymous: false,
      name: 'Mwikali Kilonzo',
      phone: '0712345678',
      relationship: 'local_leader',
    },
    actionLogs: [
      {
        id: 'log-1',
        timestamp: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
        action: 'Case logged & emergency alerts dispatched to Kitui South taskforce',
      },
    ],
  },
  {
    id: 'case-ks-02',
    trackingCode: 'KR-8422',
    category: 'donkey_theft',
    title: 'Night Boma Theft of 4 Working Donkeys',
    description: 'Four plough donkeys cut out of fenced boma between midnight and 3 AM. Footprints indicate donkeys driven south towards Ikutha thickets.',
    donkeysCount: 4,
    incidentDateTime: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    reportedAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
    urgency: 'high',
    status: 'dispatched',
    location: {
      county: 'Kitui',
      subCounty: 'Kitui South',
      ward: 'Ikutha',
      subLocation: 'Ikutha East',
      village: 'Ikutha Town',
      landmark: 'Next to Primary School Boma',
      coordinates: { lat: -2.0720, lng: 38.1780 },
    },
    photos: [],
    reporter: {
      isAnonymous: false,
      name: 'Musyoka Mutua',
      phone: '0723456789',
      relationship: 'owner',
    },
    actionLogs: [],
  },
  {
    id: 'case-ks-03',
    trackingCode: 'KR-7731',
    category: 'trafficking',
    title: 'Unpermitted Donkey Transit Lorry Intercepted',
    description: 'Isuzu lorry carrying 6 donkeys intercepted without county movement permit or veterinary health inspection certificate.',
    donkeysCount: 6,
    incidentDateTime: new Date(Date.now() - 16 * 3600 * 1000).toISOString(),
    reportedAt: new Date(Date.now() - 15 * 3600 * 1000).toISOString(),
    urgency: 'critical',
    status: 'under_review',
    location: {
      county: 'Kitui',
      subCounty: 'Kitui South',
      ward: 'Kanziko',
      subLocation: 'Kanziko West',
      village: 'Kavisuni Junction',
      landmark: 'Kanziko Roadblock',
      coordinates: { lat: -2.2500, lng: 38.2800 },
    },
    photos: [],
    reporter: {
      isAnonymous: false,
      name: 'Officer Mwangi',
      phone: '0734567890',
      relationship: 'vet',
    },
    actionLogs: [],
  },
  {
    id: 'case-ks-04',
    trackingCode: 'KR-6204',
    category: 'bush_slaughter',
    title: 'Clandestine Slaughter Site in Athi Thicket',
    description: 'Suspicious overnight movement reported. Two donkey skins recovered hidden in thorn bushes.',
    donkeysCount: 2,
    incidentDateTime: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    reportedAt: new Date(Date.now() - 22 * 3600 * 1000).toISOString(),
    urgency: 'high',
    status: 'investigating',
    location: {
      county: 'Kitui',
      subCounty: 'Kitui South',
      ward: 'Athi',
      subLocation: 'Athi South',
      village: 'Mutha Border',
      landmark: 'Athi Bushland',
      coordinates: { lat: -1.9500, lng: 38.3500 },
    },
    photos: [],
    reporter: {
      isAnonymous: true,
      relationship: 'witness',
    },
    actionLogs: [],
  },
  {
    id: 'case-kc-01',
    trackingCode: 'KR-5521',
    category: 'general_abuse',
    title: 'Severe Overloading & Open Harness Wounds',
    description: 'Two cart donkeys carrying excessive water drums exceeding 350kg with deep untreated shoulder sores and harness cuts.',
    donkeysCount: 2,
    incidentDateTime: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    reportedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    urgency: 'medium',
    status: 'pending',
    location: {
      county: 'Kitui',
      subCounty: 'Kitui Central',
      ward: 'Township',
      subLocation: 'Township',
      village: 'Kalundu Market',
      landmark: 'Water Kiosk Point 3',
      coordinates: { lat: -1.3650, lng: 38.0120 },
    },
    photos: [],
    reporter: {
      isAnonymous: false,
      name: 'Faith Wayua',
      phone: '0745678901',
      relationship: 'witness',
    },
    actionLogs: [],
  },
  {
    id: 'case-kc-02',
    trackingCode: 'KR-4932',
    category: 'donkey_theft',
    title: 'Two Grazing Donkeys Stolen at Ithookwe',
    description: 'Two grey female pack donkeys went missing from communal grazing pasture during evening round up.',
    donkeysCount: 2,
    incidentDateTime: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    reportedAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
    urgency: 'high',
    status: 'reported',
    location: {
      county: 'Kitui',
      subCounty: 'Kitui Central',
      ward: 'Kyangwithya West',
      subLocation: 'Ithookwe',
      village: 'Ithookwe Center',
      landmark: 'Showground Perimeter',
      coordinates: { lat: -1.3520, lng: 37.9950 },
    },
    photos: [],
    reporter: {
      isAnonymous: false,
      name: 'John Kilonzo',
      phone: '0756789012',
      relationship: 'owner',
    },
    actionLogs: [],
  },
  {
    id: 'case-kr-01',
    trackingCode: 'KR-3105',
    category: 'donkey_theft',
    title: 'Single Water Cart Donkey Untethered & Stolen',
    description: 'Lone working male donkey stolen outside local market while owner was delivering produce. Tracked heading west towards Yatta border.',
    donkeysCount: 1,
    incidentDateTime: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    reportedAt: new Date(Date.now() - 17 * 3600 * 1000).toISOString(),
    urgency: 'medium',
    status: 'investigating',
    location: {
      county: 'Kitui',
      subCounty: 'Kitui Rural',
      ward: 'Kwavonza/Yatta',
      subLocation: 'Kwa Vonza',
      village: 'Kwa Vonza Center',
      landmark: 'Near SEKU Junction',
      coordinates: { lat: -1.5350, lng: 37.8950 },
    },
    photos: [],
    reporter: {
      isAnonymous: false,
      name: 'David Nzau',
      phone: '0767890123',
      relationship: 'owner',
    },
    actionLogs: [],
  },
  {
    id: 'case-mc-01',
    trackingCode: 'KR-2849',
    category: 'trafficking',
    title: 'Unauthorized Donkey Loading at Nguni Market',
    description: 'Four donkeys being loaded into unmarked pickup truck without veterinary movement permit or slaughter clearance.',
    donkeysCount: 4,
    incidentDateTime: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    reportedAt: new Date(Date.now() - 5.5 * 3600 * 1000).toISOString(),
    urgency: 'high',
    status: 'under_review',
    location: {
      county: 'Kitui',
      subCounty: 'Mwingi Central',
      ward: 'Nguni',
      subLocation: 'Nguni East',
      village: 'Nguni Livestock Market',
      landmark: 'Livestock Ring Bay 2',
      coordinates: { lat: -0.9120, lng: 38.4520 },
    },
    photos: [],
    reporter: {
      isAnonymous: false,
      name: 'Samuel Munyao',
      phone: '0778901234',
      relationship: 'witness',
    },
    actionLogs: [],
  },
];

export const WELFARE_TIPS = [
  {
    title: 'Emergency Toll-Free Hotline',
    content: 'Call 0800000890 immediately if you witness suspicious donkey movement at night, missing boma livestock, or unusual meat sales.',
  },
  {
    title: 'Kenya Animal Protection Law (Cap 360)',
    content: 'Cruelty to working donkeys, unauthorized bush slaughter, and transport without veterinary permits carry strict fines and imprisonment.',
  },
  {
    title: 'Humane Cart Loading Standard',
    content: 'A single healthy donkey should not pull more than 1.5x its body weight on a well-balanced 2-wheel pneumatic cart with padded breeching straps.',
  },
  {
    title: 'Protecting Donkeys from Theft',
    content: 'House donkeys in secure, locked bomas near the main homestead at night with guard dogs or solar floodlighting. Brand or microchip with vet office.',
  },
];
