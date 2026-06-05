/**
 * Firestore `bookings.address` may be a string, structured object, or missing.
 * Never call .trim() without checking typeof === 'string'.
 */

/** Single-line address for list rows (never throws). */
export function formatBookingAddressShort(address, maxLen = 44) {
  const full = formatBookingAddressForDisplay(address)
  if (full === '—') return '—'
  if (full.length <= maxLen) return full
  return `${full.slice(0, Math.max(1, maxLen - 3))}...`
}

export function formatBookingAddressForDisplay(address) {
  if (address == null || address === '') return '—'
  if (typeof address === 'string') {
    const t = address.trim()
    return t || '—'
  }
  if (typeof address === 'object' && !Array.isArray(address)) {
    if (typeof address.fullAddress === 'string' && address.fullAddress.trim()) {
      return address.fullAddress.trim()
    }
    if (typeof address.line === 'string' && address.line.trim()) {
      return address.line.trim()
    }
    const parts = [
      address.houseNo,
      address.line1,
      address.line2,
      address.street,
      address.area,
      address.landmark,
      address.city,
      address.state,
      address.pincode,
    ]
      .filter((p) => typeof p === 'string' && p.trim())
      .map((p) => p.trim())
    if (parts.length) return parts.join(', ')
    try {
      const s = JSON.stringify(address)
      return s === '{}' ? '—' : s
    } catch {
      return '—'
    }
  }
  const s = String(address).trim()
  return s || '—'
}

/** Lowercase text for search / filtering. */
export function bookingAddressSearchText(address) {
  const t = formatBookingAddressForDisplay(address)
  return t === '—' ? '' : t.toLowerCase()
}

/**
 * Normalize before writing to Firestore from the admin panel.
 * Prefers a plain string; preserves a minimal object only when structured fields exist.
 */
/** Flatten any address shape into a single-line string for controlled inputs. */
export function addressToFormString(address) {
  if (address == null || address === '') return ''
  if (typeof address === 'string') return address
  const d = formatBookingAddressForDisplay(address)
  return d === '—' ? '' : d
}

export function normalizeBookingAddressForStorage(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object' && !Array.isArray(value)) {
    const fullAddress =
      typeof value.fullAddress === 'string' ? value.fullAddress.trim() : ''
    const houseNo = typeof value.houseNo === 'string' ? value.houseNo.trim() : ''
    const landmark = typeof value.landmark === 'string' ? value.landmark.trim() : ''
    if (houseNo || landmark) {
      const base = fullAddress || formatBookingAddressForDisplay(value)
      if (base === '—') return ''
      return {
        fullAddress: base,
        ...(houseNo ? { houseNo } : {}),
        ...(landmark ? { landmark } : {}),
      }
    }
    const flat = formatBookingAddressForDisplay(value)
    return flat === '—' ? '' : flat
  }
  return String(value).trim()
}
