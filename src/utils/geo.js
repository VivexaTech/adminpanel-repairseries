/** Haversine distance in kilometers between two WGS84 points. */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function parseCoord(value) {
  if (value == null || value === '') return null
  if (typeof value === 'object' && value.latitude != null) {
    const n = Number(value.latitude)
    return Number.isFinite(n) ? n : null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function parseCoordLng(value) {
  if (value == null || value === '') return null
  if (typeof value === 'object' && value.longitude != null) {
    const n = Number(value.longitude)
    return Number.isFinite(n) ? n : null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Supports `latitude` / `longitude` fields or a single Firestore-style GeoPoint on `location`. */
export function getBookingLatLng(bookingLike) {
  if (!bookingLike) return { lat: null, lng: null }
  let lat = parseCoord(bookingLike.latitude)
  let lng = parseCoordLng(bookingLike.longitude)
  if (lat != null && lng != null) return { lat, lng }
  const loc = bookingLike.location
  if (loc != null && typeof loc === 'object') {
    lat = parseCoord(loc)
    lng = parseCoordLng(loc)
    if (lat != null && lng != null) return { lat, lng }
  }
  return { lat: null, lng: null }
}
