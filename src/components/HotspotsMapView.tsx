import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MapPin, Filter, Layers, Navigation, ZoomIn, ZoomOut, 
  Info, AlertTriangle, ShieldAlert, Skull, Truck, HeartCrack, 
  ChevronRight, X, PhoneCall, ExternalLink, Compass, Plus, RotateCcw,
  Shield, Radio, Zap, Lock, Smartphone, Tablet, Monitor, Flame, LogOut
} from 'lucide-react';
import { DonkeyCase, CaseCategory, UserProfile, Coordinates, BackgroundLocationSettings, LoggedInDevice } from '../types';
import { 
  CATEGORY_INFO, 
  KITUI_SUB_COUNTIES, 
  SUB_COUNTY_COORDINATES, 
  EMERGENCY_HOTLINE, 
  HOTLINE_DISPLAY,
  INITIAL_OFFICERS
} from '../data/mockData';
import { 
  rankNearbySuperUsers, 
  calculateDistanceKm, 
  formatDistance, 
  estimateMotorcycleTimeMinutes,
  getOfficerCoordinates,
  NAIROBI_COORDINATES,
  detectLocationInfo
} from '../services/locationService';
import {
  getStoredLoggedInDevices,
  subscribeToLoggedInDevices,
  getOrCreateDeviceId,
  isSampleDevice,
  isSuperAdmin,
  adminForceLogoutDevice,
} from '../services/deviceTrackingService';
import { NearbySuperUsersMapSection } from './NearbySuperUsersMapSection';
import { RemoteLogoutConfirmModal } from './RemoteLogoutConfirmModal';

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
  userCoordinates?: Coordinates;
  userAccuracy?: number;
  bgSettings?: BackgroundLocationSettings;
  onUpdateBgSettings?: (newSettings: BackgroundLocationSettings) => void;
  onAllocateCaseToOfficer?: (caseId: string, officer: UserProfile, distanceKm: number) => void;
  onSimulateLocation?: (coords: Coordinates, label: string) => void;
  onSyncGps?: (coords?: Coordinates) => void;
  showNearbySection?: boolean;
  incidentMapOnly?: boolean;
}

export const HotspotsMapView: React.FC<HotspotsMapViewProps> = ({
  cases,
  currentUser,
  onOpenReportModal,
  onOpenHotlineModal,
  onSelectCase,
  userCoordinates = NAIROBI_COORDINATES,
  userAccuracy = 12,
  bgSettings = {
    enabled: true,
    collectWhenNotInUse: true,
    highAccuracy: true,
    updateIntervalSeconds: 15,
    trackingStatus: 'active',
  },
  onUpdateBgSettings = () => {},
  onAllocateCaseToOfficer,
  onSimulateLocation,
  onSyncGps,
  showNearbySection = true,
  incidentMapOnly = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerGroupRef = useRef<any>(null);
  const devicesLayerGroupRef = useRef<any>(null);
  const userLocationLayerGroupRef = useRef<any>(null);
  const densityClustersLayerGroupRef = useRef<any>(null);
  const heatLayerRef = useRef<any>(null);
  const deviceMarkersMapRef = useRef<Map<string, any>>(new Map());
  const userMarkerRef = useRef<any>(null);
  const userCircleRef = useRef<any>(null);
  const [autoFollowUserGps, setAutoFollowUserGps] = useState<boolean>(true);

  const locInfo = useMemo(() => detectLocationInfo(userCoordinates), [userCoordinates]);
  const isUserOutsideKitui = !locInfo.isKitui;

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedSubCounty, setSelectedSubCounty] = useState<string>(() => {
    return localStorage.getItem('kaa_rada_map_subcounty') || 'all';
  });
  const [selectedCase, setSelectedCase] = useState<DonkeyCase | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<LoggedInDevice | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);
  const [isHeatLoaded, setIsHeatLoaded] = useState<boolean>(false);
  const [isSyncingGps, setIsSyncingGps] = useState<boolean>(false);

  // Density Overlay States
  const [showDensityOverlay, setShowDensityOverlay] = useState<boolean>(() => {
    const val = localStorage.getItem('kaa_rada_layer_density');
    return val !== null ? val === 'true' : true;
  });
  const [densityViewMode, setDensityViewMode] = useState<'hybrid' | 'heat_only' | 'pins_only'>(() => {
    return (localStorage.getItem('kaa_rada_density_view_mode') as any) || 'hybrid';
  });

  // Synchronized Layer Toggles
  const [showCasesLayer, setShowCasesLayer] = useState<boolean>(() => {
    const val = localStorage.getItem('kaa_rada_layer_cases');
    return val !== null ? val === 'true' : true;
  });
  const [showDevicesLayer, setShowDevicesLayer] = useState<boolean>(() => {
    if (incidentMapOnly) return false;
    const val = localStorage.getItem('kaa_rada_layer_devices');
    return val !== null ? val === 'true' : true;
  });
  const [showUserLocationLayer, setShowUserLocationLayer] = useState<boolean>(() => {
    if (incidentMapOnly) return false;
    const val = localStorage.getItem('kaa_rada_layer_user');
    return val !== null ? val === 'true' : true;
  });

  const toggleDensityOverlay = () => {
    setShowDensityOverlay((prev) => {
      const next = !prev;
      localStorage.setItem('kaa_rada_layer_density', String(next));
      return next;
    });
  };

  const handleSetDensityViewMode = (mode: 'hybrid' | 'heat_only' | 'pins_only') => {
    setDensityViewMode(mode);
    localStorage.setItem('kaa_rada_density_view_mode', mode);
  };

  const toggleCasesLayer = () => {
    setShowCasesLayer((prev) => {
      const next = !prev;
      localStorage.setItem('kaa_rada_layer_cases', String(next));
      window.dispatchEvent(new CustomEvent('kaa_rada_map_sync', { detail: { type: 'cases', value: next } }));
      return next;
    });
  };

  const toggleDevicesLayer = () => {
    setShowDevicesLayer((prev) => {
      const next = !prev;
      localStorage.setItem('kaa_rada_layer_devices', String(next));
      window.dispatchEvent(new CustomEvent('kaa_rada_map_sync', { detail: { type: 'devices', value: next } }));
      return next;
    });
  };

  const toggleUserLocationLayer = () => {
    setShowUserLocationLayer((prev) => {
      const next = !prev;
      localStorage.setItem('kaa_rada_layer_user', String(next));
      window.dispatchEvent(new CustomEvent('kaa_rada_map_sync', { detail: { type: 'user', value: next } }));
      return next;
    });
  };

  // Listen to layer and location changes across both maps (Home Map & Hotspots Map)
  useEffect(() => {
    const handleSync = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (detail.type === 'cases') setShowCasesLayer(detail.value);
      if (detail.type === 'devices') setShowDevicesLayer(detail.value);
      if (detail.type === 'user') setShowUserLocationLayer(detail.value);
      if (detail.type === 'subcounty') setSelectedSubCounty(detail.value);
    };
    window.addEventListener('kaa_rada_map_sync', handleSync);
    return () => window.removeEventListener('kaa_rada_map_sync', handleSync);
  }, []);

  // Devices that have logged into the network
  const [storedDevices, setStoredDevices] = useState<LoggedInDevice[]>(() => getStoredLoggedInDevices());
  const [deviceToLogout, setDeviceToLogout] = useState<LoggedInDevice | null>(null);
  const [logoutSuccessMessage, setLogoutSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToLoggedInDevices((fresh) => {
      setStoredDevices(fresh);
    });
    return unsub;
  }, []);

  // Synchronize when a device is logged out remotely
  useEffect(() => {
    const handleRemoteLogout = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.deviceId) {
        setStoredDevices((prev) =>
          prev.filter((d) => d && d.deviceId !== detail.deviceId && (!detail.userId || d.userId !== detail.userId))
        );
        setSelectedDevice((curr) => {
          if (curr && (curr.deviceId === detail.deviceId || curr.userId === detail.userId)) {
            return null;
          }
          return curr;
        });
      }
    };
    window.addEventListener('dira_device_logged_out', handleRemoteLogout);
    return () => window.removeEventListener('dira_device_logged_out', handleRemoteLogout);
  }, []);

  // Merge currently logged-in user's device with real-time GPS coordinates (real devices only)
  const activeDevices = useMemo(() => {
    const thisDeviceId = getOrCreateDeviceId();
    // Filter out sample devices and offline devices
    const list = storedDevices.filter((d) => d && !isSampleDevice(d) && d.isOnline !== false);

    // If user is LOGGED IN: inject/update current device session
    if (currentUser) {
      const userDevId = `${thisDeviceId}_${currentUser.id}`;
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
          (currentUser.role === 'super_user' ? 'Super User Officer' : 'Community Member'),
        subCounty: currentUser.subCounty || locInfo.subCounty || 'Kitui Central',
        village: currentUser.village || locInfo.name || 'Field Post',
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
          d.deviceId === thisDeviceId ||
          d.deviceId.startsWith(thisDeviceId) ||
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

      return list.filter((d) => d && !isSampleDevice(d) && d.isOnline !== false);
    }

    // When LOGGED OUT (currentUser is null):
    // Strictly filter out this device so it NEVER appears on the map or in logged-in users list
    return list.filter(
      (d) =>
        d &&
        !isSampleDevice(d) &&
        d.isOnline !== false &&
        d.deviceId !== thisDeviceId &&
        !d.deviceId.startsWith(thisDeviceId)
    );
  }, [storedDevices, currentUser, userCoordinates, userAccuracy, locInfo]);

  // Clear selected device sheet if the device was logged out or removed
  useEffect(() => {
    if (selectedDevice && !activeDevices.some((d) => d.deviceId === selectedDevice.deviceId)) {
      setSelectedDevice(null);
    }
  }, [activeDevices, selectedDevice]);

  // Filter cases
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (!c) return false;
      if (activeCategory !== 'all' && c.category !== activeCategory) return false;
      if (selectedSubCounty !== 'all' && c.location?.subCounty !== selectedSubCounty) return false;
      return true;
    });
  }, [cases, activeCategory, selectedSubCounty]);

  // Total donkeys in current filtered cases
  const totalDonkeysInFiltered = useMemo(() => {
    return filteredCases.reduce((acc, c) => acc + (c.donkeysCount || 1), 0);
  }, [filteredCases]);

  // Aggregate hotspot clusters by subcounty and village to calculate incident frequency density
  const hotspotClusters = useMemo(() => {
    const mapByLocation = new Map<string, {
      key: string;
      subCounty: string;
      village: string;
      coordinates: { lat: number; lng: number };
      cases: DonkeyCase[];
      totalDonkeys: number;
      theftCount: number;
      slaughterCount: number;
      otherCount: number;
    }>();

    filteredCases.forEach((c) => {
      const subCounty = c.location?.subCounty || 'Kitui Central';
      const village = c.location?.village || 'Area';
      const lat = c.location?.coordinates?.lat ?? (SUB_COUNTY_COORDINATES[subCounty]?.lat || -1.3688);
      const lng = c.location?.coordinates?.lng ?? (SUB_COUNTY_COORDINATES[subCounty]?.lng || 38.0108);
      const locKey = `${subCounty}_${village}`;

      if (!mapByLocation.has(locKey)) {
        mapByLocation.set(locKey, {
          key: locKey,
          subCounty,
          village,
          coordinates: { lat, lng },
          cases: [c],
          totalDonkeys: c.donkeysCount || 1,
          theftCount: c.category === 'theft' ? 1 : 0,
          slaughterCount: c.category === 'bush_slaughter' ? 1 : 0,
          otherCount: (c.category !== 'theft' && c.category !== 'bush_slaughter') ? 1 : 0,
        });
      } else {
        const item = mapByLocation.get(locKey)!;
        item.cases.push(c);
        item.totalDonkeys += (c.donkeysCount || 1);
        if (c.category === 'theft') item.theftCount++;
        else if (c.category === 'bush_slaughter') item.slaughterCount++;
        else item.otherCount++;
      }
    });

    return Array.from(mapByLocation.values()).sort((a, b) => b.cases.length - a.cases.length);
  }, [filteredCases]);

  // Load Leaflet CSS & JS dynamically if not already on page, plus Leaflet.heat
  useEffect(() => {
    const loadLeaflet = async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const ensureHeatPlugin = () => {
        if (!window.L) return;
        if (!window.L.heatLayer && !document.getElementById('leaflet-heat-script')) {
          const heatScript = document.createElement('script');
          heatScript.id = 'leaflet-heat-script';
          heatScript.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
          heatScript.async = true;
          heatScript.onload = () => {
            setIsHeatLoaded(true);
          };
          document.body.appendChild(heatScript);
        } else if (window.L && window.L.heatLayer) {
          setIsHeatLoaded(true);
        }
      };

      if (!window.L) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => {
          setIsMapLoaded(true);
          ensureHeatPlugin();
        };
        document.body.appendChild(script);
      } else {
        setIsMapLoaded(true);
        ensureHeatPlugin();
      }
    };

    loadLeaflet();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isMapLoaded || !mapContainerRef.current || mapInstanceRef.current) return;

    const L = window.L;
    if (!L) return;

    // Determine initial center and zoom (Supports Nairobi base or Kitui operational area)
    const initialCenter: [number, number] = isUserOutsideKitui
      ? [(userCoordinates.lat + -1.3688) / 2, (userCoordinates.lng + 38.0108) / 2]
      : [-1.3688, 38.0108];
    const initialZoom = isUserOutsideKitui ? 8 : 9;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: true,
      minZoom: 5,
      maxZoom: 18,
      tap: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: true,
      keyboard: true,
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

    const densityGroup = L.layerGroup().addTo(map);
    densityClustersLayerGroupRef.current = densityGroup;

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerGroupRef.current = markersGroup;

    const devicesGroup = L.layerGroup().addTo(map);
    devicesLayerGroupRef.current = devicesGroup;

    const userLocGroup = L.layerGroup().addTo(map);
    userLocationLayerGroupRef.current = userLocGroup;

    mapInstanceRef.current = map;

    // Trigger invalidateSize to ensure full edge-to-edge container fill and auto-fit if in Nairobi/outside Kitui
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        if (isUserOutsideKitui) {
          try {
            const bounds = L.latLngBounds(
              [userCoordinates.lat, userCoordinates.lng],
              [-1.3688, 38.0108]
            );
            map.fitBounds(bounds, { padding: [35, 35], maxZoom: 12 });
          } catch {}
        }
      }
    }, 180);

    return () => {
      if (heatLayerRef.current && mapInstanceRef.current) {
        try {
          mapInstanceRef.current.removeLayer(heatLayerRef.current);
        } catch {}
        heatLayerRef.current = null;
      }
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

  // 0. Update Density Overlay (Leaflet Heatmap + Concentric Incident Density Halo Clusters)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    // Clean up existing heat layer
    if (heatLayerRef.current) {
      try {
        map.removeLayer(heatLayerRef.current);
      } catch {}
      heatLayerRef.current = null;
    }

    // Clean up existing density clusters
    if (densityClustersLayerGroupRef.current) {
      densityClustersLayerGroupRef.current.clearLayers();
    }

    if (!showDensityOverlay || densityViewMode === 'pins_only' || filteredCases.length === 0) {
      return;
    }

    // 1. Heat points calculation
    const heatPoints = filteredCases.map((c) => {
      const subCounty = c.location?.subCounty;
      const lat = c.location?.coordinates?.lat || (subCounty && SUB_COUNTY_COORDINATES[subCounty]?.lat) || -1.3688;
      const lng = c.location?.coordinates?.lng || (subCounty && SUB_COUNTY_COORDINATES[subCounty]?.lng) || 38.0108;
      
      // Weight intensity based on donkey frequency and severity of violation
      let weight = 0.55;
      if (c.category === 'bush_slaughter') weight += 0.35;
      if (c.category === 'theft') weight += 0.25;
      if (c.category === 'trafficking') weight += 0.2;
      if ((c.donkeysCount || 1) > 1) weight += Math.min(0.3, (c.donkeysCount || 1) * 0.08);
      if (c.status === 'pending' || c.status === 'investigating') weight += 0.1;
      
      return [lat, lng, Math.min(1.0, weight)];
    });

    // If leaflet.heat plugin is loaded, initialize L.heatLayer
    if (typeof L.heatLayer === 'function') {
      try {
        const heat = L.heatLayer(heatPoints, {
          radius: 35,
          blur: 22,
          maxZoom: 14,
          max: 1.0,
          minOpacity: 0.35,
          gradient: {
            0.2: '#0284c7', // Sky Blue (Low / single report)
            0.4: '#10b981', // Emerald
            0.6: '#f59e0b', // Amber (Medium frequency)
            0.8: '#ea580c', // High frequency
            1.0: '#991b1b', // Critical hotspot
          },
        });
        heat.addTo(map);
        heatLayerRef.current = heat;
      } catch (err) {
        console.warn('Leaflet heatLayer init warning:', err);
      }
    }

    // 2. Render graduated incident density frequency halos and badges
    const clusterGroup = densityClustersLayerGroupRef.current;
    if (clusterGroup) {
      hotspotClusters.forEach((cluster) => {
        if (!cluster?.coordinates) return;
        const { lat, lng } = cluster.coordinates;
        const count = cluster.cases.length;
        const totalDonkeys = cluster.totalDonkeys;
        const isCritical = count >= 3 || cluster.slaughterCount >= 2 || totalDonkeys >= 8;
        const isHigh = count >= 2 || totalDonkeys >= 4;

        const mainColor = isCritical ? '#991B1B' : isHigh ? '#EA580C' : '#0284C7';
        const waveColor = isCritical ? '#EF4444' : isHigh ? '#F97316' : '#38BDF8';
        const densityLabel = isCritical ? 'Critical Hotspot' : isHigh ? 'High Frequency' : 'Moderate Density';
        const coreRadiusMeters = isCritical ? 4200 : isHigh ? 2800 : 1800;

        // Outer density halo ring
        const outerCircle = L.circle([lat, lng], {
          radius: coreRadiusMeters,
          color: waveColor,
          weight: isCritical ? 2 : 1.5,
          opacity: 0.75,
          fillColor: mainColor,
          fillOpacity: isCritical ? 0.2 : 0.12,
        });

        // Inner core
        const innerCircle = L.circle([lat, lng], {
          radius: Math.max(600, coreRadiusMeters * 0.4),
          color: mainColor,
          weight: 2,
          fillColor: mainColor,
          fillOpacity: 0.3,
        });

        // Density Frequency Badge
        const badgeHtml = `
          <div style="
            background: linear-gradient(135deg, ${mainColor}, #09090b);
            color: #ffffff;
            padding: 3px 8px;
            border-radius: 9999px;
            border: 2px solid #ffffff;
            box-shadow: 0 4px 12px rgba(0,0,0,0.45);
            font-family: system-ui, -apple-system, sans-serif;
            font-weight: 900;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
            cursor: pointer;
            transform: translate(-50%, -50%);
          ">
            <span>${isCritical ? '🔥' : isHigh ? '⚠️' : '📍'}</span>
            <span>${count} ${count === 1 ? 'Incident' : 'Incidents'}</span>
            <span style="font-size: 9px; opacity: 0.85;">(${totalDonkeys} 🫏)</span>
          </div>
        `;

        const badgeIcon = L.divIcon({
          className: 'density-badge-icon',
          html: badgeHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const badgeMarker = L.marker([lat, lng], { icon: badgeIcon });

        const popupContent = `
          <div style="padding: 10px; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; min-width: 230px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; background: ${mainColor}; color: white; padding: 2px 7px; border-radius: 5px;">
                ${densityLabel}
              </span>
              <span style="font-size: 10px; font-weight: 700; color: #71717A;">${cluster.subCounty}</span>
            </div>
            <div style="font-weight: 800; font-size: 13px; color: #09090B; margin: 2px 0;">
              ${cluster.village}, ${cluster.subCounty}
            </div>
            <div style="font-size: 11px; color: #52525B; margin-bottom: 6px;">
              Total: <strong>${count} reported cases</strong> involving <strong>${totalDonkeys} donkeys</strong>.
            </div>
            <div style="background: #F4F4F5; padding: 6px 8px; border-radius: 8px; font-size: 10px; margin-bottom: 6px;">
              <div>• Stolen Donkeys: <strong>${cluster.theftCount}</strong></div>
              <div>• Bush Slaughter: <strong>${cluster.slaughterCount}</strong></div>
              ${cluster.otherCount > 0 ? `<div>• Cruelty/Trafficking: <strong>${cluster.otherCount}</strong></div>` : ''}
            </div>
          </div>
        `;

        outerCircle.bindPopup(popupContent);
        innerCircle.bindPopup(popupContent);
        badgeMarker.bindPopup(popupContent);

        clusterGroup.addLayer(outerCircle);
        clusterGroup.addLayer(innerCircle);
        clusterGroup.addLayer(badgeMarker);
      });
    }
  }, [filteredCases, showDensityOverlay, densityViewMode, isHeatLoaded, hotspotClusters]);

  // 1. Update Cases Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerGroupRef.current || !window.L) return;

    const L = window.L;
    const markersGroup = markersLayerGroupRef.current;
    markersGroup.clearLayers();

    if (!showCasesLayer || densityViewMode === 'heat_only') return;

    filteredCases.forEach((c) => {
      const subCounty = c.location?.subCounty;
      const lat = c.location?.coordinates?.lat || (subCounty && SUB_COUNTY_COORDINATES[subCounty]?.lat) || -1.3688;
      const lng = c.location?.coordinates?.lng || (subCounty && SUB_COUNTY_COORDINATES[subCounty]?.lng) || 38.0108;
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
            📍 ${c.location?.subCounty || 'Kitui'}${c.location?.village ? `, ${c.location.village}` : ''}
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
  }, [filteredCases, showCasesLayer, densityViewMode]);

  // 2. Update Logged-In Devices Markers on Map (Loaded dynamically based on logged-in devices & locations)
  useEffect(() => {
    if (!mapInstanceRef.current || !devicesLayerGroupRef.current || !window.L) return;

    const L = window.L;
    const devicesGroup = devicesLayerGroupRef.current;
    devicesGroup.clearLayers();

    if (incidentMapOnly || !showDevicesLayer) return;

    const thisDeviceId = getOrCreateDeviceId();
    deviceMarkersMapRef.current.clear();

    activeDevices.forEach((device) => {
      if (!device) return;
      const isCurrentDevice =
        device.deviceId === thisDeviceId || (currentUser && device.userId === currentUser.id);
      const coords = isCurrentDevice ? userCoordinates : device?.coordinates;
      if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;

      const dist = calculateDistanceKm(userCoordinates.lat, userCoordinates.lng, coords.lat, coords.lng);
      const distFormatted = isCurrentDevice ? 'You' : formatDistance(dist);
      const estMinutes = estimateMotorcycleTimeMinutes(dist);

      const isSuperUser = device.userRole === 'super_user';
      const roleLabel = isSuperUser ? 'Super User Officer' : 'Primary User (Community)';
      const markerColor = isCurrentDevice ? '#2563eb' : isSuperUser ? '#b91c1c' : '#059669';
      const markerBorder = isCurrentDevice ? '#60a5fa' : isSuperUser ? '#f59e0b' : '#34d399';
      const deviceEmoji = isCurrentDevice ? '📱' : isSuperUser ? '🛡️' : '👥';
      const firstName = (device.userName || 'User').split(' ')[0];

      const deviceMarkerHtml = `
        <div style="position: relative; width: 48px; height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
          <div style="
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background-color: ${markerColor};
            opacity: 0.35;
            animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
          <div style="
            background: linear-gradient(135deg, ${markerColor}, #09090b);
            color: #ffffff;
            width: 36px;
            height: 36px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 14px rgba(0,0,0,0.5);
            border: 2px solid ${markerBorder};
            font-family: system-ui, -apple-system, sans-serif;
            font-weight: 900;
            font-size: 15px;
            z-index: 10;
          ">
            ${deviceEmoji}
          </div>
          <div style="
            position: absolute;
            bottom: -6px;
            background: #18181b;
            color: #ffffff;
            font-size: 8px;
            font-weight: 900;
            padding: 1px 6px;
            border-radius: 6px;
            border: 1px solid ${markerBorder};
            white-space: nowrap;
            z-index: 12;
            box-shadow: 0 2px 5px rgba(0,0,0,0.4);
            max-width: 95px;
            overflow: hidden;
            text-overflow: ellipsis;
          ">
            ${firstName} • ${distFormatted}
          </div>
        </div>
      `;

      const deviceIcon = L.divIcon({
        className: 'device-marker-icon',
        html: deviceMarkerHtml,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        popupAnchor: [0, -24],
      });

      const marker = L.marker([coords.lat, coords.lng], { icon: deviceIcon });

      const popupContent = `
        <div style="padding: 10px; font-family: system-ui, -apple-system, sans-serif; min-width: 230px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; background: ${isCurrentDevice ? '#1e3a8a' : isSuperUser ? '#7f1d1d' : '#064e3b'}; color: white; padding: 2px 7px; border-radius: 5px;">
              ${deviceEmoji} ${roleLabel}
            </span>
            <span style="font-size: 9px; font-weight: 800; color: #059669;">● Live On Map</span>
          </div>
          <div style="font-weight: 900; font-size: 14px; color: #09090b; margin: 2px 0;">
            ${device.userName} ${isCurrentDevice ? '<span style="font-size: 10px; color: #2563eb; font-weight: bold;">(Your Device)</span>' : ''}
          </div>
          <div style="font-size: 11px; font-weight: 700; color: #991b1b; margin-bottom: 4px;">
            ${device.userDesignation || (isSuperUser ? 'Super User Officer' : 'Primary User')}
          </div>
          <div style="font-size: 11px; color: #52525b; margin-bottom: 6px;">
            📍 ${device.village || 'Station'}, ${device.subCounty || 'Kitui County'}
          </div>
          <div style="background: #f4f4f5; padding: 6px 8px; border-radius: 8px; font-size: 11px; margin-bottom: 8px;">
            <div><strong>Distance from you:</strong> ${distFormatted}</div>
            ${!isCurrentDevice ? `<div style="color: #71717a; font-size: 10px; margin-top: 2px;">Est. Travel: ~${estMinutes} mins</div>` : ''}
            <div style="color: #71717a; font-size: 9px; margin-top: 2px;">Device: ${device.deviceModel || 'Active Device'} • GPS: ±${device.accuracyMeters || 10}m</div>
          </div>
          ${device.userPhone ? `
            <a href="tel:${device.userPhone}" style="display: block; text-align: center; background: #059669; color: white; padding: 6px; border-radius: 8px; font-weight: bold; font-size: 11px; text-decoration: none; margin-bottom: 4px;">
              📞 Call User (${device.userPhone})
            </a>
          ` : ''}
          ${isSuperAdmin(currentUser) ? `
            <button 
              type="button" 
              class="leaflet-admin-logout-btn" 
              data-device-id="${device.deviceId}" 
              data-user-id="${device.userId || ''}" 
              data-user-name="${(device.userName || '').replace(/"/g, '&quot;')}" 
              style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: #dc2626; color: white; padding: 7px 10px; border-radius: 8px; font-weight: 800; font-size: 11px; border: none; cursor: pointer; margin-top: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"
            >
              <span>🚪</span> <span>Log Out User (Remove Icon)</span>
            </button>
          ` : ''}
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('click', () => {
        setSelectedDevice(device);
      });

      deviceMarkersMapRef.current.set(device.deviceId, marker);
      devicesGroup.addLayer(marker);
    });
  }, [showDevicesLayer, activeDevices, userCoordinates, currentUser, incidentMapOnly]);

  // Handle map container clicks for Leaflet popup logout buttons
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleMapContainerClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.leaflet-admin-logout-btn') as HTMLElement;
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        const devId = target.getAttribute('data-device-id');
        const uId = target.getAttribute('data-user-id');
        const uName = target.getAttribute('data-user-name');

        const matched = activeDevices.find((d) => d && (d.deviceId === devId || (uId && d.userId === uId)));
        if (matched) {
          setDeviceToLogout(matched);
        } else if (devId) {
          setDeviceToLogout({
            deviceId: devId,
            userId: uId || '',
            userName: uName || 'User',
            userRole: 'primary_user',
            userPhone: '',
            deviceType: 'mobile',
            isOnline: true,
          } as LoggedInDevice);
        }
      }
    };

    container.addEventListener('click', handleMapContainerClick);
    return () => {
      container.removeEventListener('click', handleMapContainerClick);
    };
  }, [activeDevices]);

  // Super Admin action to log out device and remove icon immediately (optimistic, instantaneous)
  const handleConfirmLogoutDevice = (targetDevice: LoggedInDevice, reason?: string) => {
    try {
      // 1. Immediately purge from storedDevices state
      setStoredDevices((prev) =>
        prev.filter(
          (d) =>
            d &&
            d.deviceId !== targetDevice.deviceId &&
            (!targetDevice.userId || d.userId !== targetDevice.userId)
        )
      );

      // 2. Remove Leaflet marker layer immediately
      if (devicesLayerGroupRef.current) {
        const marker = deviceMarkersMapRef.current.get(targetDevice.deviceId);
        if (marker) {
          devicesLayerGroupRef.current.removeLayer(marker);
        }
        deviceMarkersMapRef.current.delete(targetDevice.deviceId);
      }

      // 3. Close popup and selected device sheet immediately
      if (mapInstanceRef.current) {
        mapInstanceRef.current.closePopup();
      }

      if (
        selectedDevice &&
        (selectedDevice.deviceId === targetDevice.deviceId ||
          selectedDevice.userId === targetDevice.userId)
      ) {
        setSelectedDevice(null);
      }

      // 4. Instant feedback toast confirming icon removal and user data preservation
      setLogoutSuccessMessage(
        `✓ "${targetDevice.userName}" was logged out from map. User account is kept safe in database to log in again.`
      );
      setTimeout(() => setLogoutSuccessMessage(null), 5000);

      // 5. Fire backend broadcast & Firestore sync in background (non-blocking)
      adminForceLogoutDevice(
        targetDevice.deviceId,
        targetDevice.userId,
        targetDevice.userName,
        reason
      ).catch((err) => {
        console.warn('Background logout notice:', err);
      });
    } catch (err) {
      console.error('Failed to log out device from map:', err);
    }
  };

  // 3. Update User Live Location Pin & Accuracy Circle (repositions dynamically as device moves)
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocationLayerGroupRef.current || !window.L) return;

    const L = window.L;
    const userLocGroup = userLocationLayerGroupRef.current;

    if (incidentMapOnly || !showUserLocationLayer || !currentUser) {
      userLocGroup.clearLayers();
      userMarkerRef.current = null;
      userCircleRef.current = null;
      return;
    }

    const popupHtml = `
      <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 11px; padding: 4px; min-width: 175px;">
        <div style="font-weight: 800; color: #1e3a8a; font-size: 12px; display: flex; align-items: center; gap: 4px;">
          <span>📱</span> <span>Your Device (${locInfo.name})</span>
        </div>
        <div style="color: #475569; font-size: 10px; margin-top: 3px;">
          Coordinates: ${userCoordinates.lat.toFixed(5)}, ${userCoordinates.lng.toFixed(5)}
        </div>
        <div style="color: #64748b; font-size: 10px;">
          GPS Precision: ±${Math.round(userAccuracy)}m • Live Tracking Active
        </div>
        ${locInfo.isNairobi ? `
          <div style="margin-top: 4px; padding: 4px 6px; background: #eff6ff; border-radius: 4px; color: #1d4ed8; font-size: 10px; font-weight: 700; border: 1px solid #bfdbfe;">
            📍 Located in Nairobi (~${locInfo.distanceToKituiKm} km from Kitui Incident Zone)
          </div>
        ` : ''}
      </div>
    `;

    if (userMarkerRef.current && userCircleRef.current) {
      // Reposition smoothly without rebuilding layers
      userMarkerRef.current.setLatLng([userCoordinates.lat, userCoordinates.lng]);
      userMarkerRef.current.setPopupContent(popupHtml);
      userCircleRef.current.setLatLng([userCoordinates.lat, userCoordinates.lng]);
      userCircleRef.current.setRadius(Math.max(40, userAccuracy));
    } else {
      userLocGroup.clearLayers();

      const userMarkerHtml = `
        <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
          <div style="
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background-color: #3b82f6;
            opacity: 0.35;
            animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
          <div style="
            background: #2563eb;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          "></div>
        </div>
      `;

      const userIcon = L.divIcon({
        className: 'user-loc-marker',
        html: userMarkerHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([userCoordinates.lat, userCoordinates.lng], { icon: userIcon });
      marker.bindPopup(popupHtml);
      userLocGroup.addLayer(marker);
      userMarkerRef.current = marker;

      // Accuracy Circle
      const circle = L.circle([userCoordinates.lat, userCoordinates.lng], {
        radius: Math.max(40, userAccuracy),
        color: '#3b82f6',
        fillColor: '#60a5fa',
        fillOpacity: 0.12,
        weight: 1.5,
      });
      userLocGroup.addLayer(circle);
      userCircleRef.current = circle;
    }

    // If auto-follow is active, gently pan map as device moves
    if (autoFollowUserGps && mapInstanceRef.current) {
      mapInstanceRef.current.panTo([userCoordinates.lat, userCoordinates.lng], {
        animate: true,
        duration: 0.5,
      });
    }
  }, [showUserLocationLayer, userCoordinates, userAccuracy, locInfo, incidentMapOnly, autoFollowUserGps, currentUser]);

  // Recenter on Kitui County Incident Zone
  const handleRecenterKitui = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([-1.3688, 38.0108], 9, { duration: 0.8 });
    }
  };

  // Fly to User GPS / Nairobi Location
  const handleFlyToUser = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([userCoordinates.lat, userCoordinates.lng], 13, { duration: 0.8 });
    }
  };

  // Fit Panoramic bounds (Nairobi to Kitui Operations and all active devices)
  const handleFitPanoramic = () => {
    if (mapInstanceRef.current && window.L) {
      const L = window.L;
      const bounds = L.latLngBounds(
        [userCoordinates.lat, userCoordinates.lng],
        [-1.3688, 38.0108]
      );
      activeDevices.forEach((dev) => {
        if (dev?.coordinates && typeof dev.coordinates.lat === 'number' && typeof dev.coordinates.lng === 'number') {
          bounds.extend([dev.coordinates.lat, dev.coordinates.lng]);
        }
      });
      filteredCases.forEach((c) => {
        if (c?.location?.coordinates && typeof c.location.coordinates.lat === 'number' && typeof c.location.coordinates.lng === 'number') {
          bounds.extend([c.location.coordinates.lat, c.location.coordinates.lng]);
        }
      });
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  };

  // Manual Trigger to Sync Live GPS
  const handleSyncGpsTrigger = () => {
    setIsSyncingGps(true);
    if (onSyncGps) {
      onSyncGps();
    }
    setTimeout(() => {
      setIsSyncingGps(false);
      handleFlyToUser();
    }, 1200);
  };

  // Fly to Logged-in Device and open its interactive marker popup
  const handleFlyToDevice = (device: LoggedInDevice) => {
    if (mapInstanceRef.current && device?.coordinates && typeof device.coordinates.lat === 'number' && typeof device.coordinates.lng === 'number') {
      mapInstanceRef.current.flyTo([device.coordinates.lat, device.coordinates.lng], 13, { duration: 0.8 });
      setSelectedDevice(device);
      const marker = deviceMarkersMapRef.current.get(device.deviceId);
      if (marker) {
        setTimeout(() => {
          marker.openPopup();
        }, 500);
      }
    }
  };

  // Fly to Officer
  const handleFlyToOfficer = (officer: UserProfile) => {
    const coords = getOfficerCoordinates(officer);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([coords.lat, coords.lng], 13, { duration: 0.8 });
    }
  };

  // Fly to specific Sub-County
  const handleSubCountySelect = (subCountyName: string) => {
    setSelectedSubCounty(subCountyName);
    localStorage.setItem('kaa_rada_map_subcounty', subCountyName);
    window.dispatchEvent(new CustomEvent('kaa_rada_map_sync', { detail: { type: 'subcounty', value: subCountyName } }));
    
    if (subCountyName === 'all') {
      if (isUserOutsideKitui) {
        handleFitPanoramic();
      } else {
        handleRecenterKitui();
      }
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
        {!incidentMapOnly && (
          /* Device Location & Sync Bar */
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-gradient-to-r from-blue-50/80 via-white to-zinc-50 rounded-2xl border border-blue-100 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-zinc-950 text-xs sm:text-sm">
                    {locInfo.isNairobi ? '📍 Your Device: Nairobi Base' : `📍 Your Device: ${locInfo.name}`}
                  </span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                    Live GPS
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                  <span>{userCoordinates.lat.toFixed(4)}, {userCoordinates.lng.toFixed(4)} (±{Math.round(userAccuracy)}m)</span>
                  <span>•</span>
                  <span className="font-bold text-blue-700">~{locInfo.distanceToKituiKm} km to Kitui Operations</span>
                </div>
              </div>
            </div>

            {/* Quick Focus Actions */}
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <button
                onClick={handleFlyToUser}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1 transition-all"
                title="Fly directly to your device location"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{locInfo.isNairobi ? 'Nairobi Device' : 'My Device'}</span>
              </button>

              <button
                onClick={() => {
                  const next = !autoFollowUserGps;
                  setAutoFollowUserGps(next);
                  if (next) {
                    handleFlyToUser();
                  }
                }}
                className={`px-2.5 py-1.5 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1 transition-all ${
                  autoFollowUserGps
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200'
                }`}
                title="When active, map smoothly follows your device as you move"
              >
                <Compass className={`w-3.5 h-3.5 ${autoFollowUserGps ? 'animate-spin' : ''}`} style={{ animationDuration: '8s' }} />
                <span>{autoFollowUserGps ? 'Auto-Follow: ON' : 'Auto-Follow'}</span>
              </button>

              <button
                onClick={handleFitPanoramic}
                className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl border border-zinc-200 flex items-center gap-1 transition-all"
                title="Show panoramic view of both your location and Kitui incident cases"
              >
                <Compass className="w-3.5 h-3.5 text-[#991B1B]" />
                <span>Show Both (All)</span>
              </button>

              <button
                onClick={handleRecenterKitui}
                className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl border border-zinc-200 flex items-center gap-1 transition-all"
                title="Center on Kitui County Incident Zone"
              >
                <Shield className="w-3.5 h-3.5 text-zinc-700" />
                <span>Kitui HQ</span>
              </button>

              <button
                onClick={handleSyncGpsTrigger}
                disabled={isSyncingGps}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl flex items-center gap-1 transition-all disabled:opacity-50"
                title="Detect and refresh real phone GPS now"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isSyncingGps ? 'animate-spin' : ''}`} />
                <span>{isSyncingGps ? 'Syncing...' : 'Sync GPS'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Sub-County & Quick Filters (shown on full radar map) */}
        {!incidentMapOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#991B1B]">
                Interactive Hotspots Radar
              </div>
              <span className="text-zinc-300">•</span>
              <span className="text-xs text-zinc-500 font-medium">Synced with Home Map</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Quick Location Switcher / Station selector */}
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'gps') {
                    handleSyncGpsTrigger();
                  } else if (val === 'nairobi') {
                    if (onSimulateLocation) onSimulateLocation(NAIROBI_COORDINATES, 'Nairobi Command Base');
                    if (mapInstanceRef.current) mapInstanceRef.current.flyTo([NAIROBI_COORDINATES.lat, NAIROBI_COORDINATES.lng], 13);
                  } else if (val === 'kitui') {
                    const kituiCoords = { lat: -1.3688, lng: 38.0108 };
                    if (onSimulateLocation) onSimulateLocation(kituiCoords, 'Kitui Town HQ');
                    if (mapInstanceRef.current) mapInstanceRef.current.flyTo([-1.3688, 38.0108], 11);
                  } else if (val === 'ngutani') {
                    const ngutaniCoords = { lat: -1.0250, lng: 37.9850 };
                    if (onSimulateLocation) onSimulateLocation(ngutaniCoords, 'Ngutani Field Base');
                    if (mapInstanceRef.current) mapInstanceRef.current.flyTo([-1.0250, 37.9850], 13);
                  }
                }}
                value={locInfo.isNairobi ? 'nairobi' : 'gps'}
                className="bg-zinc-50 border border-zinc-200 text-xs font-bold text-zinc-800 rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#991B1B]"
              >
                <option value="gps">🛰️ GPS Auto-Detect</option>
                <option value="nairobi">🏢 Nairobi (Your Device)</option>
                <option value="kitui">🛡️ Kitui Town HQ</option>
                <option value="ngutani">📍 Ngutani Field Base</option>
              </select>

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
                id="map-add-report-btn"
                onClick={onOpenReportModal}
                className="bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1 border border-red-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Report</span>
              </button>
            </div>
          </div>
        )}

        {/* Map Layers & Density Overlay Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">Map Layers:</span>

            {/* Density Overlay Toggle */}
            <button
              onClick={toggleDensityOverlay}
              className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                showDensityOverlay
                  ? 'bg-amber-950 text-amber-200 border border-amber-800 shadow-2xs'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
              title="Toggle Leaflet Density Overlay heatmap & incident frequency halos"
            >
              <Flame className={`w-3.5 h-3.5 ${showDensityOverlay ? 'text-amber-400' : 'text-zinc-400'}`} />
              <span>Density Overlay</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${showDensityOverlay ? 'bg-amber-900 text-amber-100' : 'bg-zinc-200 text-zinc-600'}`}>
                {showDensityOverlay ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Density View Mode Selection */}
            {showDensityOverlay && (
              <div className="inline-flex rounded-xl bg-zinc-100 p-0.5 border border-zinc-200 text-[11px] font-bold">
                <button
                  onClick={() => handleSetDensityViewMode('hybrid')}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    densityViewMode === 'hybrid'
                      ? 'bg-white text-zinc-950 shadow-2xs font-black'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                  title="Show both density heatmap and individual incident pins"
                >
                  ⚡ Hybrid
                </button>
                <button
                  onClick={() => handleSetDensityViewMode('heat_only')}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    densityViewMode === 'heat_only'
                      ? 'bg-white text-[#991B1B] shadow-2xs font-black'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                  title="Show density heatmap only without pin markers"
                >
                  🔥 Heat Only
                </button>
                <button
                  onClick={() => handleSetDensityViewMode('pins_only')}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    densityViewMode === 'pins_only'
                      ? 'bg-white text-zinc-950 shadow-2xs font-black'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                  title="Show individual pins only"
                >
                  📍 Pins Only
                </button>
              </div>
            )}

            {/* Incident Pins Toggle */}
            <button
              onClick={toggleCasesLayer}
              className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                showCasesLayer
                  ? 'bg-red-950 text-red-200 border border-red-800 shadow-2xs'
                  : 'bg-zinc-100 text-zinc-500'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Incidents ({filteredCases.length})</span>
            </button>

            {/* Non-Incident Layers (hidden if incidentMapOnly) */}
            {!incidentMapOnly && (
              <>
                <button
                  onClick={toggleDevicesLayer}
                  className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                    showDevicesLayer
                      ? 'bg-emerald-950 text-emerald-200 border border-emerald-800 shadow-2xs'
                      : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Logged-In Devices ({activeDevices.length})</span>
                </button>

                <div
                  className="px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 bg-blue-950 text-blue-200 border border-blue-800 shadow-2xs select-none cursor-default"
                  title="My Live GPS is permanently active for community emergency response and proximity responder allocation"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  <span className="flex items-center gap-1">
                    <span>My Live GPS:</span>
                    <span className="text-emerald-400 text-[10px] uppercase tracking-wider font-black flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" /> ALWAYS ON
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Top Hotspots Quick Jump Ribbon */}
          {hotspotClusters.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] max-w-full">
              <span className="text-[10px] font-extrabold uppercase text-zinc-400 mr-0.5 shrink-0">Hotspots:</span>
              {hotspotClusters.slice(0, 3).map((cl) => {
                const isCritical = cl.cases.length >= 3 || cl.slaughterCount >= 2;
                return (
                  <button
                    key={cl.key}
                    onClick={() => {
                      if (mapInstanceRef.current && cl?.coordinates) {
                        mapInstanceRef.current.flyTo([cl.coordinates.lat, cl.coordinates.lng], 13, { duration: 0.8 });
                      }
                    }}
                    className={`px-2 py-0.5 rounded-lg border font-bold flex items-center gap-1 transition-all shrink-0 ${
                      isCritical
                        ? 'bg-red-50 hover:bg-red-100 text-[#991B1B] border-red-200'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                    }`}
                    title={`Fly to ${cl.village}, ${cl.subCounty} (${cl.cases.length} incidents)`}
                  >
                    <span>{isCritical ? '🔥' : '⚠️'}</span>
                    <span>{cl.village}</span>
                    <span className="text-[10px] opacity-75">({cl.cases.length})</span>
                  </button>
                );
              })}
            </div>
          )}
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

      {/* 1b. Real-Time Active Users On Radar Bar (hidden in incidentMapOnly mode) */}
      {!incidentMapOnly && showDevicesLayer && activeDevices.length > 0 && (
        <div className="bg-zinc-950 text-white rounded-3xl p-3 sm:p-3.5 border border-zinc-800 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                Active Users on Map ({activeDevices.length} Online)
              </span>
              <span className="text-[10px] text-zinc-400 hidden sm:inline">
                • Click any user to fly directly to their live GPS location
              </span>
            </div>
            <button
              onClick={handleFitPanoramic}
              className="text-[11px] font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-xl border border-zinc-700 transition-all flex items-center gap-1 shrink-0"
              title="Fit all logged in devices and cases on screen"
            >
              <Compass className="w-3 h-3 text-[#991B1B]" />
              <span>Show All on Map</span>
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {activeDevices.map((dev) => {
              const thisDeviceId = getOrCreateDeviceId();
              const isCurrent = dev.deviceId === thisDeviceId || (currentUser && dev.userId === currentUser.id);
              const dist = (dev?.coordinates && typeof dev.coordinates.lat === 'number' && typeof dev.coordinates.lng === 'number')
                ? calculateDistanceKm(userCoordinates.lat, userCoordinates.lng, dev.coordinates.lat, dev.coordinates.lng)
                : 0;
              const distText = isCurrent ? 'You' : formatDistance(dist);
              const isSuper = dev.userRole === 'super_user';

              return (
                <button
                  key={dev.deviceId}
                  onClick={() => handleFlyToDevice(dev)}
                  className={`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-2xl border text-left transition-all hover:scale-[1.02] active:scale-95 ${
                    isCurrent
                      ? 'bg-blue-950/70 border-blue-500/80 text-blue-100 hover:bg-blue-900/80'
                      : isSuper
                      ? 'bg-red-950/60 border-red-700/80 text-red-100 hover:bg-red-900/70'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-100 hover:bg-zinc-800'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                    isCurrent ? 'bg-blue-600 text-white' : isSuper ? 'bg-red-700 text-white' : 'bg-emerald-700 text-white'
                  }`}>
                    {isCurrent ? '📱' : isSuper ? '🛡️' : '👥'}
                  </div>
                  <div className="min-w-[100px] max-w-[160px]">
                    <div className="text-xs font-black truncate text-white">
                      {dev.userName} {isCurrent && '(You)'}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {dev.userDesignation || (isSuper ? 'Super User' : 'Primary User')}
                    </div>
                    <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                      <span>{distText}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Full Section Leaflet Map Container */}
      <div className="relative rounded-3xl overflow-hidden border border-zinc-200 shadow-md h-[380px] sm:h-[500px] lg:h-[600px] w-full bg-zinc-100">
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
              ? `${filteredCases.length} Incidents • ${showDensityOverlay ? '🔥 Density Heatmap Active' : '📍 Pins Active'}` 
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
          <div className="absolute bottom-3 left-3 z-20 bg-white/95 backdrop-blur p-2.5 rounded-2xl shadow-md border border-zinc-200 text-[10px] space-y-1.5 hidden sm:block max-w-[240px]">
            {showDensityOverlay && (
              <div className="pb-1.5 border-b border-zinc-200/80">
                <div className="flex items-center justify-between text-[9px] font-extrabold uppercase text-zinc-500 mb-1">
                  <span>Incident Density Scale</span>
                  <span className="text-[#991B1B] font-black">🔥 Live Heat</span>
                </div>
                <div className="h-2 rounded-full w-full bg-gradient-to-r from-sky-500 via-emerald-500 via-amber-500 via-orange-600 to-[#991B1B]" />
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold mt-0.5">
                  <span>Low (1-2)</span>
                  <span>Moderate</span>
                  <span className="text-[#991B1B]">Critical (3+)</span>
                </div>
              </div>
            )}
            <span className="font-extrabold uppercase text-zinc-400 block tracking-wider text-[9px]">
              Incident Types
            </span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#991B1B]" />
                <span className="font-bold text-zinc-800">Theft</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#7F1D1D]" />
                <span className="font-bold text-zinc-800">Slaughter</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#18181B]" />
                <span className="font-bold text-zinc-800">Trafficking</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                <span className="font-bold text-zinc-800">Cruelty</span>
              </div>
            </div>
          </div>
        )}

        {/* Real-Time Live Device GPS Movement HUD on Bottom-Right (active only when logged in) */}
        {currentUser && (
          <div className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-1.5 max-w-[220px] sm:max-w-none">
            <div className="bg-zinc-950/90 backdrop-blur text-white px-2.5 py-1.5 rounded-2xl shadow-md border border-zinc-800 text-[11px] flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="flex flex-col text-right">
                <span className="font-extrabold text-[10px] text-emerald-400 flex items-center justify-end gap-1">
                  <span>REAL GPS TRACKING</span>
                </span>
                <span className="font-mono text-[10px] text-zinc-300">
                  {userCoordinates.lat.toFixed(5)}, {userCoordinates.lng.toFixed(5)} (±{Math.round(userAccuracy)}m)
                </span>
              </div>
              <button
                onClick={() => {
                  const next = !autoFollowUserGps;
                  setAutoFollowUserGps(next);
                  if (next) handleFlyToUser();
                }}
                className={`p-1.5 rounded-xl transition-all ${
                  autoFollowUserGps
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
                title={autoFollowUserGps ? 'Auto-follow ON: map follows device movement' : 'Enable auto-follow on movement'}
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>
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
                {selectedCase.location?.subCounty || 'Kitui'}{selectedCase.location?.village ? `, ${selectedCase.location.village}` : ''}
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
              Landmark: {selectedCase.location?.landmark || 'None recorded'}
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

      {/* 4. Selected Logged-In Device Detail Bottom Sheet */}
      {selectedDevice && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-emerald-300 shadow-lg space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
                {selectedDevice.deviceType === 'tablet' ? '📟' : selectedDevice.deviceType === 'desktop' ? '💻' : '📱'}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
                    {selectedDevice.deviceModel}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Logged-In Device
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-black font-display text-zinc-950">
                  {selectedDevice.userName}
                </h3>
              </div>
            </div>

            <button
              onClick={() => setSelectedDevice(null)}
              className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                User Designation
              </span>
              <span className="font-bold text-zinc-900">
                {selectedDevice.userDesignation || selectedDevice.userRole}
              </span>
            </div>

            <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Location & Distance
              </span>
              <span className="font-bold text-zinc-900 truncate block">
                {selectedDevice.village}, {selectedDevice.subCounty}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100">
            <div className="text-[11px] text-zinc-500 font-medium">
              {selectedDevice.coordinates && typeof selectedDevice.coordinates.lat === 'number' && typeof selectedDevice.coordinates.lng === 'number'
                ? `GPS: ${selectedDevice.coordinates.lat.toFixed(4)}, ${selectedDevice.coordinates.lng.toFixed(4)}`
                : 'GPS: Not recorded'}
              {selectedDevice.accuracyMeters ? ` (±${selectedDevice.accuracyMeters}m)` : ''}
            </div>

            <div className="flex items-center gap-2">
              {/* Super Admin Remote Logout Button */}
              {isSuperAdmin(currentUser) && (
                <button
                  type="button"
                  id="admin-logout-device-sheet-btn"
                  onClick={() => setDeviceToLogout(selectedDevice)}
                  className="bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-all border border-red-700 cursor-pointer"
                  title="Super Admin: Disconnect user and remove device icon from map"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out User</span>
                </button>
              )}

              {selectedDevice.userPhone && (
                <a
                  href={`tel:${selectedDevice.userPhone}`}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Call Device ({selectedDevice.userPhone})
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Dedicated Section: Nearby Logged-In Devices on Map & Proximity Case Allocation */}
      {showNearbySection && !incidentMapOnly && (
        <NearbySuperUsersMapSection
          userCoordinates={userCoordinates}
          userAccuracy={userAccuracy}
          cases={cases}
          currentUser={currentUser}
          bgSettings={bgSettings}
          onUpdateBgSettings={onUpdateBgSettings}
          onSelectOfficerOnMap={handleFlyToOfficer}
          onSelectDeviceOnMap={handleFlyToDevice}
          onAllocateCaseToOfficer={onAllocateCaseToOfficer}
          onSimulateLocation={onSimulateLocation}
          onLogoutDevice={(device) => setDeviceToLogout(device)}
        />
      )}

      {/* 6. Confirmation Modal for Super Admin Device Logout */}
      <RemoteLogoutConfirmModal
        device={deviceToLogout}
        isOpen={Boolean(deviceToLogout)}
        onClose={() => setDeviceToLogout(null)}
        onConfirmLogout={handleConfirmLogoutDevice}
        isCurrentUserDevice={Boolean(
          deviceToLogout &&
            (deviceToLogout.deviceId === getOrCreateDeviceId() ||
              deviceToLogout.userId === currentUser?.id)
        )}
      />

      {/* 7. Success Toast Notification for Admin Actions */}
      {logoutSuccessMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-zinc-900 text-white p-3.5 rounded-2xl shadow-xl border border-zinc-700 flex items-center gap-2.5 animate-in slide-in-from-bottom-3 duration-200">
          <span className="text-emerald-400 font-bold text-sm">✓</span>
          <p className="text-xs text-zinc-200 flex-1">{logoutSuccessMessage}</p>
          <button
            onClick={() => setLogoutSuccessMessage(null)}
            className="text-zinc-400 hover:text-white text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

