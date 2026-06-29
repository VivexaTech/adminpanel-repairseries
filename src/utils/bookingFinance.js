/**
 * Per-booking fee snapshot and split earnings (platform fee on original amount,
 * separate add-on fee on approved add-ons). Technician / user apps should import this module.
 */

const normalizeApprovalStatus = (item) => {
  const s = String(item?.approvalStatus ?? item?.addonApprovalStatus ?? item?.status ?? 'approved')
    .trim()
    .toLowerCase()
  if (s === 'pending' || s === 'rejected' || s === 'denied' || s === 'declined') {
    if (s === 'denied' || s === 'declined') return 'rejected'
    return s === 'pending' ? 'pending' : 'rejected'
  }
  return 'approved'
}

const safeMoney = (value) => {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(typeof value === 'string' ? value.trim() : value)
  return Number.isFinite(n) ? n : 0
}

export const DEFAULT_ADDON_FEE_PERCENT = 10

const clampPct = (value, fallback) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, n))
}

/**
 * Sum of approved add-on line prices only (excludes pending/rejected).
 * @param {object} booking
 */
export const sumApprovedAddOnPrices = (booking) => {
  const raw = booking?.addOnServices
  if (!Array.isArray(raw)) return 0
  let s = 0
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    if (normalizeApprovalStatus(item) !== 'approved') continue
    s += safeMoney(item.price ?? item.amount ?? item.cost ?? item.servicePrice)
  }
  return s
}

/** Service price only — platform fee base (excludes visiting charge). */
export const getServicePriceAmount = (booking) => {
  if (!booking || typeof booking !== 'object') return 0
  const snap = safeMoney(booking.servicePrice)
  if (snap > 0) return snap
  const orig = safeMoney(booking.originalBookingAmount)
  if (orig > 0) return orig
  return safeMoney(booking.amount ?? booking.baseAmount ?? booking.servicePrice ?? booking.price)
}

/** Customer base total (service + visiting) before add-ons. */
export const getCustomerBaseTotal = (booking) => {
  if (!booking || typeof booking !== 'object') return 0
  const snap = safeMoney(booking.customerBaseTotal)
  if (snap > 0) return snap
  const svc = getServicePriceAmount(booking)
  const visiting = safeMoney(booking.visitingCharge)
  return svc + visiting
}

/**
 * @deprecated Use getServicePriceAmount for platform fee base.
 * Frozen original booking total (service + visiting) before add-ons.
 */
export const getFrozenOriginalBookingAmount = (booking) => getCustomerBaseTotal(booking)

/**
 * Percentages stored on the booking at creation time (never use live settings for math).
 * Legacy docs without snapshot: use built-in defaults only (not live admin settings).
 * @param {object} booking
 */
export const getBookingFeePercents = (booking) => {
  const DEFAULT_PLATFORM = 30
  const pRaw = booking?.platformFeePercent
  const aRaw = booking?.addonFeePercent
  if (pRaw != null && pRaw !== '' && aRaw != null && aRaw !== '') {
    return {
      platformFeePercent: clampPct(pRaw, DEFAULT_PLATFORM),
      addonFeePercent: clampPct(aRaw, DEFAULT_ADDON_FEE_PERCENT),
    }
  }
  return {
    platformFeePercent: DEFAULT_PLATFORM,
    addonFeePercent: DEFAULT_ADDON_FEE_PERCENT,
  }
}

/**
 * Full fee breakdown from current booking fields (approved add-ons only).
 * @param {object} booking
 */
export const computeFinanceBreakdown = (booking) => {
  const { platformFeePercent, addonFeePercent } = getBookingFeePercents(booking)
  const servicePrice = getServicePriceAmount(booking)
  const visitingCharge = safeMoney(booking.visitingCharge)
  const customerBaseTotal = servicePrice + visitingCharge
  const addedServicesAmount = sumApprovedAddOnPrices(booking)
  const finalBookingAmount = customerBaseTotal + addedServicesAmount
  const platformFeeAmount = Math.round(servicePrice * (platformFeePercent / 100))
  const addonFeeAmount = Math.round(addedServicesAmount * (addonFeePercent / 100))
  const technicianFinalEarning =
    servicePrice - platformFeeAmount + addedServicesAmount - addonFeeAmount
  const companyEarnings = platformFeeAmount + visitingCharge + addonFeeAmount
  const totalDeduction = finalBookingAmount - technicianFinalEarning

  return {
    servicePrice,
    visitingCharge,
    originalBookingAmount: servicePrice,
    customerBaseTotal,
    addedServicesAmount,
    finalBookingAmount,
    platformFeePercent,
    addonFeePercent,
    platformFeeAmount,
    addonFeeAmount,
    totalDeduction,
    technicianFinalEarning,
    companyEarnings,
  }
}

/**
 * Firestore write fields for earnings / customer totals (same booking doc).
 * @param {object} booking — booking-shaped object including latest `addOnServices`
 */
export const buildFinanceWritePatch = (booking) => {
  const b = computeFinanceBreakdown(booking)
  return {
    servicePrice: b.servicePrice,
    visitingCharge: b.visitingCharge,
    originalBookingAmount: b.originalBookingAmount,
    customerBaseTotal: b.customerBaseTotal,
    addedServicesAmount: b.addedServicesAmount,
    finalBookingAmount: b.finalBookingAmount,
    platformFeeAmount: b.platformFeeAmount,
    addonFeeAmount: b.addonFeeAmount,
    totalDeduction: b.totalDeduction,
    technicianFinalEarning: b.technicianFinalEarning,
    companyEarnings: b.companyEarnings,
    totalAmount: b.finalBookingAmount,
    finalAmount: b.finalBookingAmount,
    technicianEarning: b.technicianFinalEarning,
    platformCommission: b.platformFeeAmount,
    platformFinalEarning: b.companyEarnings,
  }
}

/**
 * Snapshot percents + original amount on new booking creation.
 * @param {number} platformFeePercent
 * @param {number} addonFeePercent
 * @param {number} servicePrice
 * @param {number} visitingCharge
 */
export const buildInitialBookingFinanceFields = (platformFeePercent, addonFeePercent, servicePrice, visitingCharge) => {
  const svc = safeMoney(servicePrice)
  const visit = safeMoney(visitingCharge)
  const p = clampPct(platformFeePercent, 30)
  const a = clampPct(addonFeePercent, DEFAULT_ADDON_FEE_PERCENT)
  const customerBaseTotal = svc + visit
  const platformFeeAmount = Math.round(svc * (p / 100))
  const addonFeeAmount = 0
  const addedServicesAmount = 0
  const finalBookingAmount = customerBaseTotal
  const technicianFinalEarning = svc - platformFeeAmount
  const companyEarnings = platformFeeAmount + visit
  const totalDeduction = finalBookingAmount - technicianFinalEarning

  return {
    platformFeePercent: p,
    addonFeePercent: a,
    servicePrice: svc,
    visitingCharge: visit,
    originalBookingAmount: svc,
    customerBaseTotal,
    addedServicesAmount,
    finalBookingAmount,
    platformFeeAmount,
    addonFeeAmount,
    totalDeduction,
    technicianFinalEarning,
    companyEarnings,
    totalAmount: finalBookingAmount,
    finalAmount: finalBookingAmount,
    technicianEarning: technicianFinalEarning,
    platformCommission: platformFeeAmount,
    platformFinalEarning: companyEarnings,
  }
}

/**
 * Compatible with previous helper API. Ignores live settings percent — uses booking snapshot only.
 * @param {object} booking
 */
export const getBookingEarningSplit = (booking) => {
  const b = computeFinanceBreakdown(booking)
  return {
    totalAmount: b.finalBookingAmount,
    platformCut: b.companyEarnings,
    companyEarnings: b.companyEarnings,
    technicianEarning: b.technicianFinalEarning,
    platformCommissionPercent: b.platformFeePercent,
    addonFeePercent: b.addonFeePercent,
    platformFeeAmount: b.platformFeeAmount,
    addonFeeAmount: b.addonFeeAmount,
    visitingCharge: b.visitingCharge,
    servicePrice: b.servicePrice,
  }
}

/**
 * Map approval-request lines to persisted add-on rows.
 * @param {object[]} lines
 */
export const approvalLinesToAddOnRows = (lines) => {
  if (!Array.isArray(lines)) return []
  const out = []
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue
    const serviceName = String(line.serviceName ?? line.title ?? '').trim()
    const price = safeMoney(line.price)
    const serviceType = String(line.serviceType || 'extra').toLowerCase() === 'additional' ? 'additional' : 'extra'
    if (!serviceName && price === 0) continue
    const row = {
      serviceName: serviceName || 'Add-on',
      price,
      approvalStatus: 'approved',
      serviceType,
    }
    const aid = String(line.additionalServiceId ?? '').trim()
    if (aid) row.additionalServiceId = aid
    out.push(row)
  }
  return out
}

/**
 * Technician app: payload for `addOnApprovalRequest` (Firestore update).
 * @param {object[]} lines — { serviceType, serviceName, price, additionalServiceId? }[]
 * @param {object} booking
 */
export const buildTechnicianApprovalRequestPayload = (lines, booking) => {
  const original = getFrozenOriginalBookingAmount(booking)
  let added = 0
  const normalized = []
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line !== 'object') continue
    const serviceName = String(line.serviceName ?? line.title ?? '').trim()
    const price = safeMoney(line.price)
    const serviceType = String(line.serviceType || 'extra').toLowerCase() === 'additional' ? 'additional' : 'extra'
    if (!serviceName && price === 0) continue
    added += price
    const row = { serviceName: serviceName || 'Add-on', price, serviceType }
    const aid = String(line.additionalServiceId ?? '').trim()
    if (aid) row.additionalServiceId = aid
    normalized.push(row)
  }
  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    requestId,
    status: 'pending',
    lines: normalized,
    proposedAddedTotal: added,
    proposedFinalAmount: original + added,
  }
}
