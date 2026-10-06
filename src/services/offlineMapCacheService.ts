/**
 * Offline Map Tile Caching Service for Leaflet in Rural Kitui
 * 
 * Provides resilient tile caching using CacheStorage API with an in-memory & canvas fallback.
 * Allows donkey welfare officers and community responders to navigate Kitui Central,
 * Mwingi, Migwani, Mutomo, and Ikutha even during intermittent network connectivity.
 */

const CACHE_NAME = 'dira-kitui-offline-tiles-v1';

// Critical Donkey Welfare Focus Zones in Kitui County
export interface WelfareZoneCoordinates {
  id: string;
  name: string;
  subCounty: string;
  lat: number;
  lng: number;
  description: string;
}

export const CRITICAL_KITUI_WELFARE_ZONES: WelfareZoneCoordinates[] = [
  {
    id: 'kitui-central',
    name: 'Kitui Central & Kalundu Market',
    subCounty: 'Kitui Central',
    lat: -1.3688,
    lng: 38.0108,
    description: 'High-volume donkey trading and transit market hub',
  },
  {
    id: 'mwingi-west',
    name: 'Migwani & Ngutani Corridors',
    subCounty: 'Mwingi West',
    lat: -1.0500,
    lng: 38.0108,
    description: 'Frequent cross-sub-county transport & slaughter risk corridor',
  },
  {
    id: 'mwingi-central',
    name: 'Mwingi Town & Mbondoni',
    subCounty: 'Mwingi Central',
    lat: -0.9344,
    lng: 38.0583,
    description: 'Northern Kitui market hub & highway transport check-point',
  },
  {
    id: 'kitui-south',
    name: 'Mutomo & Ikutha Border Belt',
    subCounty: 'Kitui South',
    lat: -1.8415,
    lng: 38.2148,
    description: 'Southern border corridor with heavy donkey draught usage',
  },
  {
    id: 'kitui-rural',
    name: 'Kanyangi & Miambani',
    subCounty: 'Kitui Rural',
    lat: -1.4500,
    lng: 37.9500,
    description: 'Water-fetching routes and rural donkey working communities',
  },
  {
    id: 'kitui-east',
    name: 'Mutito & Zombe',
    subCounty: 'Kitui East',
    lat: -1.4333,
    lng: 38.3000,
    description: 'Eastern pastoral and agricultural transport corridor',
  },
];

// Slippy map tile calculations
function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

/**
 * Check if the browser supports the Cache Storage API
 */
export function isCacheStorageSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

/**
 * Get the total number of cached map tiles and estimated storage size
 */
export async function getOfflineTileStats(): Promise<{ count: number; estimatedSizeMb: number }> {
  if (!isCacheStorageSupported()) {
    return { count: 0, estimatedSizeMb: 0 };
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    // Typical OSM tile is ~20KB - 25KB
    const estimatedSizeMb = Number(((keys.length * 22) / 1024).toFixed(2));
    return {
      count: keys.length,
      estimatedSizeMb,
    };
  } catch (err) {
    console.warn('Could not read offline tile stats:', err);
    return { count: 0, estimatedSizeMb: 0 };
  }
}

/**
 * Clear the offline map tiles cache
 */
export async function clearOfflineTileCache(): Promise<boolean> {
  if (!isCacheStorageSupported()) return false;
  try {
    const deleted = await caches.delete(CACHE_NAME);
    return deleted;
  } catch (err) {
    console.warn('Failed to clear offline map cache:', err);
    return false;
  }
}

/**
 * Generate a clean offline placeholder tile data URL when network is unavailable
 * and a specific tile is not in the cache.
 */
export function generateOfflinePlaceholderTile(x: number, y: number, z: number): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Earthy-neutral Kitui field background
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle grid lines
  ctx.strokeStyle = '#e2ded5';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 256, 256);

  // Diagonal faint grid for topographic feel
  ctx.beginPath();
  ctx.strokeStyle = '#eae6dc';
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.stroke();

  // Subtle offline badge watermark
  ctx.fillStyle = '#a8a29e';
  ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Kitui Offline Zone', 128, 120);

  ctx.fillStyle = '#d6d3d1';
  ctx.font = '8px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Tile ${z}/${x}/${y}`, 128, 138);

  return canvas.toDataURL('image/png');
}

/**
 * Pre-cache critical Donkey Welfare Zones across Kitui County
 * Loops through zoom levels 8 to 13 around welfare hotspots so officers can
 * use the map offline in remote areas with zero cell reception.
 */
export async function precacheKituiWelfareZones(
  onProgress?: (progress: {
    current: number;
    total: number;
    areaName: string;
    percent: number;
  }) => void
): Promise<{ success: boolean; totalCached: number }> {
  if (!isCacheStorageSupported()) {
    throw new Error('CacheStorage is not supported on this browser.');
  }

  const cache = await caches.open(CACHE_NAME);
  const zoomLevels = [8, 9, 10, 11, 12];
  const uniqueUrls = new Set<string>();

  // Compute tile URLs for each critical welfare zone
  CRITICAL_KITUI_WELFARE_ZONES.forEach((zone) => {
    zoomLevels.forEach((zoom) => {
      const tileX = lon2tile(zone.lng, zoom);
      const tileY = lat2tile(zone.lat, zoom);

      // Cache a 3x3 grid around each zone's center point
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = tileX + dx;
          const y = tileY + dy;
          const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
          uniqueUrls.add(url);
        }
      }
    });
  });

  const urlsToFetch = Array.from(uniqueUrls);
  const total = urlsToFetch.length;
  let current = 0;

  // Process in small concurrent batches of 4 to prevent network congestion
  const BATCH_SIZE = 4;
  for (let i = 0; i < urlsToFetch.length; i += BATCH_SIZE) {
    const batch = urlsToFetch.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (url) => {
        try {
          // Check if already in cache
          const existing = await cache.match(url);
          if (!existing) {
            const resp = await fetch(url, {
              mode: 'cors',
              headers: { Accept: 'image/png,image/*;q=0.8' },
            });
            if (resp && resp.ok) {
              await cache.put(url, resp);
            }
          }
        } catch (err) {
          // Skip individual tile errors gracefully
        } finally {
          current++;
          if (onProgress) {
            const areaIndex = Math.min(
              Math.floor((current / total) * CRITICAL_KITUI_WELFARE_ZONES.length),
              CRITICAL_KITUI_WELFARE_ZONES.length - 1
            );
            const areaName = CRITICAL_KITUI_WELFARE_ZONES[areaIndex]?.name || 'Kitui County Corridor';
            const percent = Math.round((current / total) * 100);
            onProgress({ current, total, areaName, percent });
          }
        }
      })
    );
  }

  const finalStats = await getOfflineTileStats();
  return {
    success: true,
    totalCached: finalStats.count,
  };
}

/**
 * Creates an offline-cached Leaflet TileLayer subclass using Leaflet's standard plugin architecture.
 * If online: serves from cache first; if missing, fetches and stores in cache.
 * If offline: serves from cache; if missing, generates an offline vector grid tile.
 */
export function createCachedTileLayer(
  L: any,
  urlTemplate: string = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: any = {}
): any {
  if (!L || !L.TileLayer) {
    throw new Error('Leaflet L.TileLayer is not defined');
  }

  // Extend Leaflet's TileLayer
  const CachedTileLayer = L.TileLayer.extend({
    createTile: function (coords: { x: number; y: number; z: number }, done: (err: any, tile: HTMLImageElement) => void) {
      const tile = document.createElement('img');
      tile.setAttribute('role', 'presentation');

      const originalUrl = this.getTileUrl(coords);
      let isDoneCalled = false;

      const finishSuccess = () => {
        if (!isDoneCalled) {
          isDoneCalled = true;
          done(null, tile);
        }
      };

      const finishFallback = () => {
        if (!isDoneCalled) {
          isDoneCalled = true;
          tile.src = generateOfflinePlaceholderTile(coords.x, coords.y, coords.z);
          done(null, tile);
        }
      };

      tile.onload = finishSuccess;
      tile.onerror = finishFallback;

      if (!isCacheStorageSupported()) {
        // Fallback to standard network load if Cache API is unavailable
        tile.src = originalUrl;
        return tile;
      }

      // 1. Check local CacheStorage first for fastest offline performance
      caches
        .open(CACHE_NAME)
        .then((cache) => {
          return cache.match(originalUrl).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse.blob().then((blob) => {
                const objectUrl = URL.createObjectURL(blob);
                tile.onload = () => {
                  URL.revokeObjectURL(objectUrl);
                  finishSuccess();
                };
                tile.src = objectUrl;
              });
            }

            // 2. Not in cache: if online, fetch and save to cache
            if (typeof navigator !== 'undefined' && navigator.onLine) {
              fetch(originalUrl, { mode: 'cors' })
                .then((networkResponse) => {
                  if (networkResponse && networkResponse.ok) {
                    // Clone before consuming response
                    cache.put(originalUrl, networkResponse.clone()).catch(() => {});
                    return networkResponse.blob().then((blob) => {
                      const objectUrl = URL.createObjectURL(blob);
                      tile.onload = () => {
                        URL.revokeObjectURL(objectUrl);
                        finishSuccess();
                      };
                      tile.src = objectUrl;
                    });
                  } else {
                    finishFallback();
                  }
                })
                .catch(() => {
                  finishFallback();
                });
            } else {
              // Offline and not in cache
              finishFallback();
            }
          });
        })
        .catch(() => {
          // If cache error, attempt normal direct src
          tile.src = originalUrl;
        });

      return tile;
    },
  });

  return new CachedTileLayer(urlTemplate, {
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Caritas Kitui (Offline Cache Active)',
    ...options,
  });
}
