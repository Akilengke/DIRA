import React, { useState } from 'react';
import { 
  X, Download, HardDrive, Wifi, WifiOff, Trash2, CheckCircle2, 
  MapPin, Shield, RefreshCw, AlertCircle 
} from 'lucide-react';
import { 
  CRITICAL_KITUI_WELFARE_ZONES, 
  precacheKituiWelfareZones, 
  clearOfflineTileCache,
  getOfflineTileStats
} from '../services/offlineMapCacheService';

interface OfflineMapCacheModalProps {
  isOpen: boolean;
  onClose: () => void;
  offlineStats: { count: number; estimatedSizeMb: number };
  onStatsUpdate: (stats: { count: number; estimatedSizeMb: number }) => void;
  isOnline: boolean;
}

export const OfflineMapCacheModal: React.FC<OfflineMapCacheModalProps> = ({
  isOpen,
  onClose,
  offlineStats,
  onStatsUpdate,
  isOnline,
}) => {
  const [isPreCaching, setIsPreCaching] = useState(false);
  const [precacheProgress, setPrecacheProgress] = useState<{
    current: number;
    total: number;
    areaName: string;
    percent: number;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartPrecache = async () => {
    if (isPreCaching) return;
    setIsPreCaching(true);
    setStatusMessage(null);
    setPrecacheProgress({
      current: 0,
      total: 100,
      areaName: 'Connecting to OpenStreetMap tile servers...',
      percent: 0,
    });

    try {
      await precacheKituiWelfareZones((progress) => {
        setPrecacheProgress(progress);
      });
      const freshStats = await getOfflineTileStats();
      onStatsUpdate(freshStats);
      setStatusMessage(`Successfully cached ${freshStats.count} tiles across Kitui County welfare zones!`);
    } catch (err: any) {
      console.warn('Pre-cache error:', err);
      setStatusMessage(`Notice: ${err?.message || 'Download was interrupted. Try again when connectivity stabilizes.'}`);
    } finally {
      setIsPreCaching(false);
    }
  };

  const handleClear = async () => {
    try {
      await clearOfflineTileCache();
      const freshStats = await getOfflineTileStats();
      onStatsUpdate(freshStats);
      setStatusMessage('Offline tile cache has been cleared.');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-zinc-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-zinc-950 text-white p-4 sm:p-5 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">Kitui Offline Map Cache</h3>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    isOnline
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {isOnline ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-400" /> Online
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-amber-400" /> Offline Mode
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Leaflet tile layers cached for intermittent rural connectivity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Status Message */}
          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2 text-xs text-emerald-900 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{statusMessage}</div>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-emerald-700 hover:text-emerald-950 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Storage Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Stored Map Tiles
              </div>
              <div className="text-2xl font-black text-zinc-900 flex items-baseline gap-1">
                {offlineStats.count}
                <span className="text-xs font-semibold text-zinc-500">tiles</span>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Rendered directly from browser cache
              </div>
            </div>

            <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Offline Footprint
              </div>
              <div className="text-2xl font-black text-zinc-900 flex items-baseline gap-1">
                {offlineStats.estimatedSizeMb}
                <span className="text-xs font-semibold text-zinc-500">MB</span>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Zero cellular data required offline
              </div>
            </div>
          </div>

          {/* Pre-cache Action Section */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-200">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-black text-cyan-950 flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-cyan-700" />
                  Pre-Cache Kitui Rural Welfare Corridors
                </h4>
                <p className="text-xs text-cyan-800 mt-0.5 leading-relaxed">
                  Downloads high-resolution patrol corridor tiles (Zoom 8–12) for offline donkey welfare monitoring across all sub-counties.
                </p>
              </div>
            </div>

            {/* Progress Bar if active */}
            {isPreCaching && precacheProgress && (
              <div className="my-3 p-3 bg-white/90 rounded-xl border border-cyan-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-cyan-950">
                  <span className="truncate max-w-[240px] flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 text-cyan-600 animate-spin" />
                    {precacheProgress.areaName}
                  </span>
                  <span>{precacheProgress.percent}%</span>
                </div>
                <div className="w-full bg-cyan-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-cyan-600 h-full transition-all duration-150 rounded-full"
                    style={{ width: `${precacheProgress.percent}%` }}
                  />
                </div>
                <div className="text-[10px] text-cyan-700 text-right">
                  Tile {precacheProgress.current} of {precacheProgress.total}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleStartPrecache}
                disabled={isPreCaching || !isOnline}
                className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isPreCaching ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Caching Kitui Corridors...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Pre-Cache Welfare Zones Now
                  </>
                )}
              </button>

              {offlineStats.count > 0 && (
                <button
                  onClick={handleClear}
                  disabled={isPreCaching}
                  className="px-3 py-2.5 rounded-xl bg-white hover:bg-red-50 border border-zinc-200 hover:border-red-300 text-zinc-700 hover:text-red-700 text-xs font-bold transition-colors flex items-center gap-1"
                  title="Clear offline map tile cache"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
            {!isOnline && (
              <p className="text-[10px] text-amber-800 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> Connect to the internet to pre-cache new corridors.
              </p>
            )}
          </div>

          {/* Covered Critical Welfare Zones */}
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
              Covered Rural Kitui Welfare Corridors
            </div>
            <div className="space-y-1.5">
              {CRITICAL_KITUI_WELFARE_ZONES.map((zone) => (
                <div
                  key={zone.id}
                  className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-start justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-zinc-900">{zone.name}</div>
                    <div className="text-[11px] text-zinc-500">{zone.description}</div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-700 shrink-0">
                    {zone.subCounty}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Rural Kitui Connectivity Guide */}
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs text-zinc-600 space-y-1">
            <div className="font-bold text-zinc-900 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              Zero-Network Field Continuity
            </div>
            <p className="text-[11px] leading-relaxed">
              When patrolling in remote valleys without cellular coverage, cached Leaflet tiles render seamlessly. Case reports, coordinates, and notes remain securely queued locally and automatically synchronize once you reconnect.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-950 text-white text-xs font-bold transition-all shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
