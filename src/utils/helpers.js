import { format } from 'date-fns'
import clsx from 'clsx'

export const cn = (...inputs) => clsx(inputs)

const safeMoney = (value) => {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(typeof value === 'string' ? value.trim() : value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Normalized add-ons from `booking.addOnServices` (technician app).
 * Each item: { serviceName, price }
 */
export const normalizeBookingAddOnServices = (booking) => {
  const raw = booking?.addOnServices
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const serviceName = String(item.serviceName ?? item.name ?? item.title ?? '').trim()
    const price = safeMoney(item.price ?? item.amount ?? item.cost ?? item.servicePrice)
    if (!serviceName && price === 0) continue
    out.push({
      serviceName: serviceName || 'Additional service',
      price,
    })
  }
  return out
}

export const getBookingAddOnsSubtotal = (booking) =>
  normalizeBookingAddOnServices(booking).reduce((sum, item) => sum + item.price, 0)

/**
 * Base service price only (excludes add-ons). When there are no add-ons, same as legacy single total.
 */
export const getBookingBaseAmount = (booking) => {
  if (!booking || typeof booking !== 'object') return 0
  const addOnTotal = getBookingAddOnsSubtotal(booking)
  if (addOnTotal === 0) {
    const raw =
      booking.amount ?? booking.totalAmount ?? booking.total ?? booking.price ?? booking.servicePrice
    return safeMoney(raw)
  }

  const explicitBase = safeMoney(
    booking.baseAmount ?? booking.amount ?? booking.servicePrice ?? booking.price,
  )
  const docTotal = safeMoney(booking.totalAmount ?? booking.total)

  if (docTotal > 0) {
    const impliedBase = docTotal - addOnTotal
    if (impliedBase >= 0) {
      if (explicitBase > 0 && Math.abs(explicitBase + addOnTotal - docTotal) <= 1) {
        return explicitBase
      }
      return impliedBase
    }
  }

  return explicitBase
}

/** Gross total: base + add-ons; prefers `totalAmount` when higher (app-synced). */
export const getBookingAmount = (booking) => {
  if (!booking || typeof booking !== 'object') return 0
  const addOnTotal = getBookingAddOnsSubtotal(booking)
  const base = getBookingBaseAmount(booking)
  if (addOnTotal === 0) {
    return base
  }
  const combined = base + addOnTotal
  const docTotal = safeMoney(booking.totalAmount ?? booking.total)
  return Math.max(combined, docTotal)
}

export const isBookingCompleted = (booking) =>
  String(booking?.status ?? '')
    .trim()
    .toLowerCase() === 'completed'

export const isBookingPaid = (booking) =>
  String(booking?.paymentStatus ?? '')
    .trim()
    .toLowerCase() === 'paid'

/** Completed + paid: used for platform 30% and technician 70% totals (matches technician app). */
export const isBookingRevenueCounted = (booking) =>
  isBookingCompleted(booking) && isBookingPaid(booking)

export const PLATFORM_COMMISSION_RATE = 0.3

/**
 * 30% platform / 70% technician split from booking total (same formula as technician app).
 * Uses integer rupees: platform rounded, technician gets remainder so amounts sum to total.
 */
export const getBookingEarningSplit = (booking) => {
  const totalAmount = getBookingAmount(booking)
  const platformCut = Math.round(totalAmount * PLATFORM_COMMISSION_RATE)
  const technicianEarning = totalAmount - platformCut
  return { totalAmount, platformCut, technicianEarning }
}

export const currency = (value) => {
  const n = Number(value)
  const safe = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safe)
}

export const compactNumber = (value) =>
  new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0)

export const formatDateTime = (value, pattern = 'dd MMM yyyy, hh:mm a') => {
  if (!value) return '--'
  return format(new Date(value), pattern)
}

export const downloadCsv = (filename, csvText) => {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
