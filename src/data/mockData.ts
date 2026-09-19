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

// Clean slate for real user-reported cases (no sample data)
export const INITIAL_CASES: DonkeyCase[] = [];

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
