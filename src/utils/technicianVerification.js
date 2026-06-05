/**
 * Account verification uses `technicians.status` values: pending | active | rejected.
 * Operational shift (Available / Busy / Offline) is stored in `shiftStatus`, with legacy fallback
 * when `status` is still the old shift value.
 */

export function normalizeVerificationStatus(technician) {
  if (!technician) return 'active'
  const alt = technician.verificationStatus ?? technician.accountStatus
  if (alt != null && String(alt).trim() !== '') {
    return String(alt).trim().toLowerCase()
  }
  const st = String(technician.status ?? '').trim().toLowerCase()
  if (st === 'pending' || st === 'active' || st === 'rejected') return st
  return 'active'
}

export function normalizeShiftStatus(technician) {
  if (!technician) return 'Available'
  const sh = technician.shiftStatus
  if (sh === 'Available' || sh === 'Busy' || sh === 'Offline') return sh
  const legacy = technician.status
  if (legacy === 'Available' || legacy === 'Busy' || legacy === 'Offline') return legacy
  return 'Available'
}

export function isTechnicianAssignable(technician) {
  if (!technician) return false
  if (technician.suspended === true) return false
  const v = normalizeVerificationStatus(technician)
  return v === 'active'
}

export function verificationAccountBadge(technician) {
  const v = normalizeVerificationStatus(technician)
  if (v === 'pending') return { label: 'Pending Approval', tone: 'warning', dot: '🟡' }
  if (v === 'rejected') return { label: 'Rejected', tone: 'danger', dot: '🔴' }
  return { label: 'Active', tone: 'success', dot: '🟢' }
}

export function kycStatusBadge(technician) {
  const k = technician?.kyc
  const s = k && typeof k === 'object' ? String(k.status ?? '').trim().toLowerCase() : ''
  if (!s) return { label: 'KYC: —', tone: 'neutral' }
  if (s === 'approved') return { label: 'KYC: Approved', tone: 'success' }
  if (s === 'rejected') return { label: 'KYC: Rejected', tone: 'danger' }
  return { label: 'KYC: Pending', tone: 'warning' }
}

export function maskAccountNumber(value) {
  const s = String(value ?? '').replace(/\s/g, '')
  if (!s) return '—'
  if (s.length <= 4) return '••••'
  return `XXXXXX${s.slice(-4)}`
}

export function pickAadhaarImageUrl(doc, side /* 'front' | 'back' */) {
  if (!doc || typeof doc !== 'object') return ''
  const lower = String(side).toLowerCase()
  const fromNested = (v) => {
    if (!v) return ''
    if (typeof v === 'string') return v.trim()
    if (typeof v === 'object' && typeof v.url === 'string') return v.url.trim()
    return ''
  }

  const tryKeys =
    lower === 'front'
      ? ['front', 'Front', 'frontImage', 'aadhaarFront', 'aadhaarFrontUrl', 'imageFront']
      : ['back', 'Back', 'backImage', 'aadhaarBack', 'aadhaarBackUrl', 'imageBack']

  for (const k of tryKeys) {
    const raw = doc[k]
    const u = fromNested(raw)
    if (u) return u
  }

  const urlMap = typeof doc.urls === 'object' && doc.urls !== null ? doc.urls : null
  if (urlMap) {
    const u = fromNested(urlMap[lower] || urlMap[side])
    if (u) return u
  }

  const alt =
    lower === 'front'
      ? doc.frontUrl || doc.frontImageUrl || doc.imageFrontUrl
      : doc.backUrl || doc.backImageUrl || doc.imageBackUrl
  const u2 = fromNested(alt)
  return typeof u2 === 'string' && u2 ? u2 : ''
}
