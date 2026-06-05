/**
 * Read-only accessors for amounts persisted on the booking document.
 * Admin Panel display uses these only — no fee math in UI.
 */

const safeMoney = (value) => {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(typeof value === 'string' ? value.trim() : value)
  return Number.isFinite(n) ? n : 0
}

/** Customer / booking total from Firestore (`totalAmount` primary). */
export const getStoredBookingTotalAmount = (booking) => {
  if (booking?.totalAmount != null && booking?.totalAmount !== '') return safeMoney(booking.totalAmount)
  return safeMoney(booking?.finalAmount)
}

/** Deduction total as written on the doc. */
export const getStoredBookingTotalDeduction = (booking) => safeMoney(booking?.totalDeduction)

/**
 * Technician payout: `technicianFinalEarning` when present, else `technicianEarning`.
 */
export const getStoredTechnicianPayout = (booking) => {
  if (booking?.technicianFinalEarning == null || booking?.technicianFinalEarning === '') {
    return safeMoney(booking?.technicianEarning)
  }
  return safeMoney(booking.technicianFinalEarning)
}
