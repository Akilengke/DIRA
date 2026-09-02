import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MapPin, Filter, Layers, Navigation, ZoomIn, ZoomOut, 
  Info, AlertTriangle, ShieldAlert, Skull, Truck, HeartCrack, 
  ChevronRight, X, PhoneCall, ExternalLink, Compass, Plus, RotateCcw
} from 'lucide-react';
import { DonkeyCase, CaseCategory, UserProfile } from '../types';
import { 
  CATEGORY_INFO, 
  KITUI_SUB_COUNTIES, 
  SUB_COUNTY_COORDINATES, 
  EMERGENCY_HOTLINE, 
  HOTLINE_DISPLAY 
} from '../data/mockData';

// Leaflet dynamic imports / globals
declare global {
  interface Window {
    L: any;
  }
}

interface HotspotsMapViewProps {
  cases: DonkeyCase[];
  currentUser: UserProfile | null;
  onOpenReportModal: () => void;
  onOpenHotlineModal?: () => void;
  onSelectCase?: (c: DonkeyCase) => void;
}

export const HotspotsMapView: React.FC<HotspotsMapViewProps> = ({
  cases,
  currentUser,
  onOpenReportModal,
  onOpenHotlineModal,
  onSelectCase,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerGroupRef = useRef<any>(null);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedSubCounty, setSelectedSubCounty] = useState<string>('all');
  const [selectedCase, setSelectedCase] = useState<DonkeyCase | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

  // Filter cases
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (activeCategory !== 'all' && c.category !== activeCategory) return false;
      if (selectedSubCounty !== 'all' && c.location.subCounty !== selectedSubCounty) return false;
      return true;
    });
  }, [cases, activeCategory, selectedSubCounty]);

  // Load Leaflet CSS & JS dynamically if not already on page
  useEffect(() => {
    const loadLeaflet = async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!window.L) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => {
          setIsMapLoaded(true);
        };
        document.body.appendChild(script);
      } else {
        setIsMapLoaded(true);
      }
    };

    loadLeaflet();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isMapLoaded || !mapContainerRef.current || mapInstanceRef.current) return;

    const L = window.L;
    if (!L) return;

    // Center on Kitui County (-1.3688, 38.0108)
    const map = L.map(mapContainerRef.current, {
      center: [-1.3688, 38.0108],
      zoom: 9,
      zoomControl: false,
      attributionControl: true,
      minZoom: 6,
      maxZoom: 18,
    });

    // Standard OpenStreetMap public tiles - Free, reliable, NO API KEY REQUIRED
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Caritas Kitui',
    });
    osmLayer.addTo(map);

    // Zoom Controls on top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerGroupRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Trigger invalidateSize to ensure full edge-to-edge container fill
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 150);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isMapLoaded]);

  // Keep map filling container on window/parent element resize
  useEffect(() => {
    if (!mapContainerRef.current || !mapInstanceRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });

    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isMapLoaded]);

  // Update Markers when cases change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerGroupRef.current || !window.L) return;

    const L = window.L;
    const markersGroup = markersLayerGroupRef.current;
    markersGroup.clearLayers();

    filteredCases.forEach((c) => {
      const lat = c.location.coordinates?.lat || -1.3688;
      const lng = c.location.coordinates?.lng || 38.0108;
      const cat = CATEGORY_INFO[c.category] || CATEGORY_INFO['other'];

      // Custom HTML Marker Icon with Category Unique Color Dot & Radar Pulse
      const dotHex = cat.dotColor || cat.color;
      const isPending = c.status === 'pending' || c.status === 'investigating';
      
      const markerHtml = `
        <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${isPending ? `
            <div style="
              position: absolute;
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background-color: ${dotHex};
              opacity: 0.35;
              animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>
          ` : ''}
          <div style="
            background: linear-gradient(135deg, ${dotHex}, #18181b);
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 14px rgba(0,0,0,0.45);
            border: 2.5px solid #ffffff;
            font-family: system-ui, -apple-system, sans-serif;
            font-weight: 900;
            font-size: 12px;
            position: relative;
            z-index: 10;
          ">
            <span style="font-size: 11px;">${c.donkeysCount}</span>
            <div style="
              position: absolute;
              bottom: -2px;
              right: -2px;
              width: 11px;
              height: 11px;
              border-radius: 50%;
              background-color: ${dotHex};
              border: 1.5px solid #ffffff;
            "></div>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-marker-icon',
        html: markerHtml,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      // Popup Content
      const popupContent = `
        <div style="padding: 10px; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; min-width: 220px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; background: ${cat.color}; color: white; padding: 2px 6px; border-radius: 4px;">
              ${cat.label}
            </span>
            <span style="font-size: 10px; font-weight: 700; color: #71717A;">${c.trackingCode}</span>
          </div>
          <div style="font-weight: 800; font-size: 13px; color: #09090B; margin: 4px 0 2px;">
            ${c.title}
          </div>
          <div style="font-size: 11px; color: #52525B; margin-bottom: 6px;">
            📍 ${c.location.subCounty}, ${c.location.village}
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; border-top: 1px solid #E4E4E7; padding-top: 6px;">
            <span style="color: #991B1B; font-weight: 700;">${c.donkeysCount} Donkey(s)</span>
            <span style="color: #18181B; font-weight: 600; text-transform: capitalize;">${c.status.replace('_', ' ')}</span>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('click', () => {
        setSelectedCase(c);
      });

      markersGroup.addLayer(marker);
    });
  }, [filteredCases]);

  // Recenter on Kitui County
  const handleRecenterKitui = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([-1.3688, 38.0108], 9, { duration: 0.8 });
    }
  };

  // Fly to specific Sub-County
  const handleSubCountySelect = (subCountyName: string) => {
    setSelectedSubCounty(subCountyName);
    if (subCountyName === 'all') {
      handleRecenterKitui();
      return;
    }

    const coords = SUB_COUNTY_COORDINATES[subCountyName];
    if (coords && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([coords.lat, coords.lng], 11, { duration: 0.8 });
    }
  };

  return (
    <div className="space-y-3 pb-16 flex flex-col">
      {/* 1. Top Controls Bar */}
      <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-zinc-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#991B1B]">
              Interactive Hotspots Radar
            </div>
            <h2 className="text-sm sm:text-base font-black font-display text-zinc-950">
              Donkey Incident Live Map
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Sub-County Jump Selector */}
            <select
              value={selectedSubCounty}
              onChange={(e) => handleSubCountySelect(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 text-xs font-bold text-zinc-800 rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#991B1B]"
            >
              <option value="all">All Sub-Counties</option>
              {KITUI_SUB_COUNTIES.map((sc) => (
                <option key={sc.name} value={sc.name}>
                  {sc.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleRecenterKitui}
              className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-all border border-zinc-200"
              title="Recenter Map on Kitui"
            >
              <Compass className="w-3.5 h-3.5 text-[#991B1B]" />
              <span className="hidden xs:inline">Recenter</span>
            </button>

            <button
              id="map-add-report-btn"
              onClick={onOpenReportModal}
              className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1 border border-red-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>
          </div>
        </div>

        {/* Filter Badges in Brick Red / Black */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition-all ${
              activeCategory === 'all'
                ? 'bg-zinc-950 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            All Categories ({cases.length})
          </button>

          {(Object.keys(CATEGORY_INFO) as CaseCategory[]).map((catKey) => {
            const info = CATEGORY_INFO[catKey];
            const isSelected = activeCategory === catKey;
            const count = cases.filter((c) => c.category === catKey).length;

            return (
              <button
                key={catKey}
                onClick={() => setActiveCategory(catKey)}
                className={`px-2.5 py-1 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1 text-[11px] ${
                  isSelected
                    ? 'bg-[#991B1B] text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                <span>{info.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-red-950 text-red-100' : 'bg-zinc-200 text-zinc-700'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Full Section Leaflet Map Container */}
      <div className="relative rounded-3xl overflow-hidden border border-zinc-200 shadow-md h-[480px] sm:h-[560px] lg:h-[620px] w-full bg-zinc-100">
        <div 
          ref={mapContainerRef} 
          className="w-full h-full min-h-full" 
          style={{ minHeight: '100%', height: '100%', width: '100%' }}
        />

        {/* Map Overlay Indicator */}
        <div className="absolute top-3 left-3 z-20 bg-white/95 backdrop-blur px-3 py-1.5 rounded-2xl shadow-md border border-zinc-200 text-xs flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${filteredCases.length > 0 ? 'bg-[#991B1B] animate-ping' : 'bg-emerald-500'}`} />
          <span className="font-bold text-zinc-900">
            {filteredCases.length > 0 
              ? `${filteredCases.length} Incident Pin(s) in Kitui` 
              : 'Kitui Radar Active • 0 Active Pins'}
          </span>
        </div>

        {/* Empty State Banner overlay when 0 cases exist */}
        {filteredCases.length === 0 && (
          <div className="absolute bottom-4 inset-x-4 z-20 bg-white/95 backdrop-blur p-3.5 rounded-2xl shadow-lg border border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div>
              <div className="text-xs font-bold text-zinc-900">
                Ready for New Community Reports
              </div>
              <div className="text-[11px] text-zinc-500">
                Tap "+ Report Incident" to log stolen donkeys, illegal bush slaughter, or cruelty in your village.
              </div>
            </div>
            <button
              onClick={onOpenReportModal}
              className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold px-3.5 py-2 rounded-xl shrink-0 shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Log New Report</span>
            </button>
          </div>
        )}

        {/* Map Legend on bottom left (when cases exist) */}
        {filteredCases.length > 0 && (
          <div className="absolute bottom-3 left-3 z-20 bg-white/95 backdrop-blur p-2.5 rounded-2xl shadow-md border border-zinc-200 text-[10px] space-y-1 hidden sm:block">
            <span className="font-extrabold uppercase text-zinc-400 block tracking-wider">
              Legend
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#991B1B]" />
              <span className="font-bold text-zinc-800">Theft</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7F1D1D]" />
              <span className="font-bold text-zinc-800">Bush Slaughter</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#18181B]" />
              <span className="font-bold text-zinc-800">Trafficking</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Selected Case Detail Bottom Sheet */}
      {selectedCase && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200 shadow-lg space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md border ${CATEGORY_INFO[selectedCase.category].badgeBg} ${CATEGORY_INFO[selectedCase.category].badgeBorder} ${CATEGORY_INFO[selectedCase.category].badgeText}`}>
                  {CATEGORY_INFO[selectedCase.category].label}
                </span>
                <span className="font-mono text-xs font-bold text-zinc-400">
                  {selectedCase.trackingCode}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-black font-display text-zinc-950">
                {selectedCase.title}
              </h3>
            </div>

            <button
              onClick={() => setSelectedCase(null)}
              className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Location
              </span>
              <span className="font-bold text-zinc-900">
                {selectedCase.location.subCounty}, {selectedCase.location.village}
              </span>
            </div>

            <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Status / Animals
              </span>
              <span className="font-bold text-zinc-900 capitalize">
                {selectedCase.status.replace('_', ' ')} • {selectedCase.donkeysCount} Donkey(s)
              </span>
            </div>
          </div>

          <p className="text-xs text-zinc-600 bg-zinc-50 p-3 rounded-2xl border border-zinc-200 leading-relaxed">
            {selectedCase.description}
          </p>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-zinc-500 font-medium truncate max-w-[200px]">
              Landmark: {selectedCase.location.landmark}
            </span>

            <a
              href={`tel:${EMERGENCY_HOTLINE}`}
              className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition-all border border-red-800"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              Hotline 0800000890
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

