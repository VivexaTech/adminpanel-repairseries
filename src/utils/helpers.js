import { format } from 'date-fns'
import clsx from 'clsx'

export const cn = (...inputs) => clsx(inputs)

/** Sum-safe numeric amount from a booking (Firestore often stores numbers as strings). */
export const getBookingAmount = (booking) => {
  if (!booking || typeof booking !== 'object') return 0
  const raw =
    booking.amount ?? booking.totalAmount ?? booking.total ?? booking.price ?? booking.servicePrice
  if (raw == null || raw === '') return 0
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const n = Number(typeof raw === 'string' ? raw.trim() : raw)
  return Number.isFinite(n) ? n : 0
}

export const isBookingCompleted = (booking) =>
  String(booking?.status ?? '')
    .trim()
    .toLowerCase() === 'completed'

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
