/**
 * Geocode a postal address to WGS84 lat/lng.
 * - Set VITE_GOOGLE_GEOCODING_API_KEY for production-friendly browser geocoding.
 * - Without Google: uses OpenStreetMap Nominatim. In dev, Vite proxies /nominatim → nominatim.openstreetmap.org (CORS).
 * - Optional VITE_NOMINATIM_API_BASE=https://your-server.com/nominatim for production without Google.
 *
 * Nominatim usage policy: max ~1 req/s; we cache and throttle batch backfill in AppContext.
 */

const memoryCache = new Map()

function cacheKey(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function nominatimFetchUrl(pathWithLeadingSlash) {
  const custom = import.meta.env.VITE_NOMINATIM_API_BASE?.replace(/\/$/, '')
  if (custom) return `${custom}${pathWithLeadingSlash}`
  if (import.meta.env.DEV) return `/nominatim${pathWithLeadingSlash}`
  return `https://nominatim.openstreetmap.org${pathWithLeadingSlash}`
}

async function geocodeGoogle(address, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || `Google Geocoding: ${data.status || 'error'}`)
  }
  if (!data.results?.length) throw new Error('Address not found (Google).')
  const loc = data.results[0].geometry.location
  const lat = Number(loc.lat)
  const lng = Number(loc.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid coordinates from Google.')
  return { lat, lng }
}

async function geocodeNominatim(address) {
  const path = `/search?format=json&q=${encodeURIComponent(address)}&limit=1`
  const url = nominatimFetchUrl(path)
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
    },
  })
  if (!res.ok) {
    throw new Error(
      `Geocoding failed (${res.status}). For production, set VITE_GOOGLE_GEOCODING_API_KEY or VITE_NOMINATIM_API_BASE (your proxy).`,
    )
  }
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) throw new Error('Address not found (OpenStreetMap).')
  const lat = Number.parseFloat(data[0].lat)
  const lng = Number.parseFloat(data[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid coordinates from geocoder.')
  return { lat, lng }
}

/**
 * @param {string} addressText - Single-line search string (e.g. from formatBookingAddressForDisplay)
 * @returns {Promise<{ lat: number, lng: number }>}
 */
export async function geocodeAddressString(addressText) {
  const q = addressText.trim()
  if (!q) throw new Error('Cannot geocode an empty address.')

  const key = cacheKey(q)
  if (memoryCache.has(key)) {
    return memoryCache.get(key)
  }

  const googleKey = import.meta.env.VITE_GOOGLE_GEOCODING_API_KEY
  const result = googleKey
    ? await geocodeGoogle(q, googleKey)
    : await geocodeNominatim(q)

  memoryCache.set(key, result)
  return result
}

export function clearGeocodeCache() {
  memoryCache.clear()
}
