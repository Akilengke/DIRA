// Geographic boundaries and GeoJSON coordinates for Kitui County's 8 Sub-Counties
// Enables choropleth shading based on reported case density:
// - Subcounties with the most cases have a concentrated deep red
// - Subcounties with few cases have a light red
// - Subcounties with 0 cases have no red shading

export interface SubCountyGeoData {
  id: string;
  name: string;
  center: [number, number]; // [lat, lng]
  polygon: [number, number][]; // [[lat, lng], ...]
  wards: string[];
  headquarters: string;
}

export const KITUI_SUBCOUNTIES_GEO: SubCountyGeoData[] = [
  {
    id: 'mwingi_north',
    name: 'Mwingi North',
    center: [-0.4500, 38.1500],
    headquarters: 'Kyuso Town',
    wards: ['Ngomeni', 'Kyuso', 'Mumoni', 'Tseikuru', 'Tharaka'],
    polygon: [
      [-0.05, 38.18],
      [-0.15, 38.42],
      [-0.40, 38.58],
      [-0.68, 38.52],
      [-0.74, 38.18],
      [-0.72, 38.06],
      [-0.58, 37.92],
      [-0.35, 37.90],
      [-0.18, 38.02],
      [-0.05, 38.18],
    ],
  },
  {
    id: 'mwingi_west',
    name: 'Mwingi West',
    center: [-1.0500, 37.8500],
    headquarters: 'Migwani Town',
    wards: ['Kyome/Thaana', 'Nguutani', 'Migwani', 'Kiomo/Kyethani'],
    polygon: [
      [-0.72, 38.06],
      [-0.76, 38.18],
      [-0.95, 38.15],
      [-1.15, 38.12],
      [-1.18, 38.02],
      [-1.15, 37.82],
      [-1.02, 37.74],
      [-0.85, 37.78],
      [-0.74, 37.95],
      [-0.72, 38.06],
    ],
  },
  {
    id: 'mwingi_central',
    name: 'Mwingi Central',
    center: [-0.9234, 38.3129],
    headquarters: 'Mwingi Town',
    wards: ['Central', 'Kivou', 'Nguni', 'Nuu', 'Waita'],
    polygon: [
      [-0.74, 38.18],
      [-0.68, 38.52],
      [-0.78, 38.68],
      [-1.05, 38.62],
      [-1.15, 38.75],
      [-1.20, 38.48],
      [-1.18, 38.22],
      [-1.15, 38.12],
      [-0.95, 38.15],
      [-0.74, 38.18],
    ],
  },
  {
    id: 'kitui_west',
    name: 'Kitui West',
    center: [-1.2500, 37.9500],
    headquarters: 'Kabati / Matinyani',
    wards: ['Mutonguni', 'Kauwi', 'Matinyani', 'Kwa Mutonga/Kithumula'],
    polygon: [
      [-1.15, 37.82],
      [-1.18, 38.02],
      [-1.28, 38.00],
      [-1.31, 37.97],
      [-1.40, 37.96],
      [-1.38, 37.82],
      [-1.26, 37.76],
      [-1.15, 37.82],
    ],
  },
  {
    id: 'kitui_central',
    name: 'Kitui Central',
    center: [-1.3688, 38.0108],
    headquarters: 'Kitui Town Command HQ',
    wards: ['Miambani', 'Township', 'Kyangwithya West', 'Kyangwithya East', 'Mulango'],
    polygon: [
      [-1.28, 38.00],
      [-1.26, 38.12],
      [-1.35, 38.16],
      [-1.46, 38.14],
      [-1.48, 38.02],
      [-1.40, 37.96],
      [-1.31, 37.97],
      [-1.28, 38.00],
    ],
  },
  {
    id: 'kitui_rural',
    name: 'Kitui Rural',
    center: [-1.5422, 38.0125],
    headquarters: 'Kisasi / Mbitini',
    wards: ['Kisasi', 'Mbitini', 'Kwavonza/Yatta', 'Kanyangi'],
    polygon: [
      [-1.38, 37.82],
      [-1.40, 37.96],
      [-1.48, 38.02],
      [-1.46, 38.14],
      [-1.62, 38.22],
      [-1.78, 38.16],
      [-1.75, 37.90],
      [-1.55, 37.78],
      [-1.42, 37.80],
      [-1.38, 37.82],
    ],
  },
  {
    id: 'kitui_east',
    name: 'Kitui East',
    center: [-1.3400, 38.4500],
    headquarters: 'Mutitu / Zombe',
    wards: ['Zombe/Mwitika', 'Chuluni', 'Nzambani', 'Voo/Kyamatu', 'Endau/Malalani', 'Mutitu/Kaliku'],
    polygon: [
      [-1.18, 38.22],
      [-1.20, 38.48],
      [-1.15, 38.75],
      [-1.42, 38.92],
      [-1.72, 38.88],
      [-1.82, 38.52],
      [-1.80, 38.26],
      [-1.62, 38.22],
      [-1.46, 38.14],
      [-1.35, 38.16],
      [-1.26, 38.12],
      [-1.22, 38.18],
      [-1.18, 38.22],
    ],
  },
  {
    id: 'kitui_south',
    name: 'Kitui South',
    center: [-1.8291, 38.1633],
    headquarters: 'Mutomo / Ikutha',
    wards: ['Ikutha', 'Mutomo', 'Mutha', 'Athi', 'Kanziko'],
    polygon: [
      [-1.78, 38.16],
      [-1.80, 38.26],
      [-1.82, 38.52],
      [-2.15, 38.68],
      [-2.45, 38.62],
      [-2.72, 38.42],
      [-2.65, 38.15],
      [-2.35, 38.02],
      [-2.02, 37.95],
      [-1.85, 38.00],
      [-1.78, 38.16],
    ],
  },
];

export interface SubCountyShadingStyle {
  hasCases: boolean;
  isMax: boolean;
  fillColor: string;
  fillOpacity: number;
  color: string;
  weight: number;
  dashArray?: string;
  intensityLevel: 'none' | 'few' | 'moderate' | 'high' | 'concentrated';
  label: string;
}

/**
 * Calculates subcounty choropleth shading style based on case count and maximum case count:
 * - The subcounty with the most cases has concentrated deep red (#7f1d1d, fillOpacity 0.70)
 * - Subcounties with few cases have a light red (#fca5a5, fillOpacity 0.25)
 * - Subcounties with 0 cases have no red shading (transparent)
 */
export function getSubCountyShadingStyle(caseCount: number, maxCases: number): SubCountyShadingStyle {
  if (caseCount <= 0 || maxCases <= 0) {
    return {
      hasCases: false,
      isMax: false,
      fillColor: 'transparent',
      fillOpacity: 0,
      color: '#cbd5e1',
      weight: 1,
      dashArray: '3, 4',
      intensityLevel: 'none',
      label: 'No Cases (Unshaded)',
    };
  }

  const ratio = caseCount / maxCases;

  // The one with the MOST cases: concentrated red
  if (caseCount === maxCases || ratio >= 0.99) {
    return {
      hasCases: true,
      isMax: true,
      fillColor: '#7f1d1d', // Concentrated blood/crimson red
      fillOpacity: 0.70,     // Strong saturated fill
      color: '#991b1b',     // Bold border
      weight: 3,
      intensityLevel: 'concentrated',
      label: 'Concentrated Red (Most Cases)',
    };
  }

  // High incident density
  if (ratio >= 0.60) {
    return {
      hasCases: true,
      isMax: false,
      fillColor: '#b91c1c',
      fillOpacity: 0.52,
      color: '#991b1b',
      weight: 2.5,
      intensityLevel: 'high',
      label: 'High Density Red',
    };
  }

  // Moderate incident density
  if (ratio >= 0.30) {
    return {
      hasCases: true,
      isMax: false,
      fillColor: '#ef4444',
      fillOpacity: 0.38,
      color: '#dc2626',
      weight: 2,
      intensityLevel: 'moderate',
      label: 'Moderate Red',
    };
  }

  // Few cases: light red
  return {
    hasCases: true,
    isMax: false,
    fillColor: '#fca5a5', // Light rose red
    fillOpacity: 0.25,     // Light, translucent red wash
    color: '#f87171',
    weight: 1.5,
    intensityLevel: 'few',
    label: 'Few Cases (Light Red)',
  };
}

/**
 * Standardize subcounty naming for lookup
 */
export function normalizeSubCountyName(name?: string): string {
  if (!name) return '';
  const cleaned = name.trim().toLowerCase();
  for (const sc of KITUI_SUBCOUNTIES_GEO) {
    if (sc.name.toLowerCase() === cleaned || sc.id === cleaned.replace(/\s+/g, '_')) {
      return sc.name;
    }
  }
  // Try partial containment
  for (const sc of KITUI_SUBCOUNTIES_GEO) {
    if (cleaned.includes(sc.name.toLowerCase()) || sc.name.toLowerCase().includes(cleaned)) {
      return sc.name;
    }
  }
  return name.trim();
}
