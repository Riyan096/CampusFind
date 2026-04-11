/**
 * FREE Geocoding Service (Zero API Keys)
 * - Nominatim (OpenStreetMap): Address → lat/lng
 * - Browser Geolocation API: GPS coords 
 * - localStorage cache (offline/performance)
 */

interface GeocodeCache {
  [address: string]: [number, number];
}

const GEOCODE_CACHE_KEY = 'campusfind_geocode_cache_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Get cache from localStorage
const getCache = (): GeocodeCache => {
  try {
    const cached = localStorage.getItem(GEOCODE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Clean expired entries
      const now = Date.now();
      return Object.fromEntries(
        Object.entries(parsed).filter(([_, value]: [string, any]) => {
          return now - value.timestamp < CACHE_TTL_MS;
        })
      ) as GeocodeCache;
    }
  } catch {
    // Invalid cache, ignore
  }
  return {};
};

// Save to cache
const saveToCache = (address: string, coords: [number, number]) => {
  try {
    const cache = getCache();
    cache[address] = coords;
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify({
      ...cache,
      [address]: { coords, timestamp: Date.now() }
    }));
  } catch {
    // Ignore cache errors
  }
};

/**
 * Geocode address → [lat, lng] (FREE Nominatim API)
 * Cache: 7 days, rate-limited to 1/sec
 */
export const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
  if (!address || address.length < 2) return null;

  // Check cache first
  const cache = getCache();
  if (cache[address]) {
    console.log(`📍 Cache hit: ${address}`);
    return cache[address];
  }

  try {
    // Nominatim API (FREE, no key, 1 req/sec)
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      'accept-language': 'en',
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { 
        headers: { 'User-Agent': 'CampusFind/1.0 (contact@campusfind.com)' } 
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const results = await response.json() as any[];
    
    if (results.length === 0) {
      console.warn(`No geocoding results for: ${address}`);
      return null;
    }

    const coords: [number, number] = [
      parseFloat(results[0].lat),
      parseFloat(results[0].lon)
    ];

    // Cache result
    saveToCache(address, coords);
    console.log(`📍 Geocoded "${address}" →`, coords);
    
    return coords;
  } catch (error) {
    console.error(`Geocoding failed for ${address}:`, error);
    return null;
  }
};

/**
 * Get current GPS location
 */
export const getCurrentLocation = (): Promise<[number, number]> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [
          position.coords.latitude,
          position.coords.longitude
        ];
        console.log('📱 GPS location:', coords);
        resolve(coords);
      },
      (error) => {
        console.error('GPS error:', error);
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000 // 5 min
      }
    );
  });
};

/**
 * Reverse geocode: [lat,lng] → address (Nominatim)
 */
export const reverseGeocode = async (latlng: [number, number]): Promise<string> => {
  const [lat, lng] = latlng;
    // Separate string cache for reverse geocoding
    const revCacheKey = `rev_${lat.toFixed(5)}_${lng.toFixed(5)}`;
    const revCache = JSON.parse(localStorage.getItem('campusfind_rev_cache_v1') || '{}');
    
    if (revCache[revCacheKey]) return revCache[revCacheKey];

    try {
      const params = new URLSearchParams({
        format: 'json',
        limit: '1',
        lat: lat.toString(),
        lon: lng.toString(),
        zoom: '18',
        'accept-language': 'en'
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${params}`,
        { 
          headers: { 'User-Agent': 'CampusFind/1.0 (contact@campusfind.com)' } 
        }
      );

      const result = await response.json() as any;
      const address = result.display_name || `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
      
      // Cache reverse result
      localStorage.setItem('campusfind_rev_cache_v1', JSON.stringify({
        ...revCache,
        [revCacheKey]: address
      }));
      
      return address;
    } catch {
      return `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
    }
  };


/**
 * Ensure item has latlng (geocode if missing)
 */
export const ensureItemLocation = async (item: any): Promise<[number, number] | null> => {
  if (item.latlng) return item.latlng;
  
  const coords = await geocodeAddress(item.location);
  if (coords) {
    item.latlng = coords; // Mutate for convenience
  }
  
  return coords;
};

