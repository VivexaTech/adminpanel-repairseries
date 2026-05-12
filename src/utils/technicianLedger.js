<<<<<<< HEAD
import { TIMEZONE } from './technicianSlots'

/** @param {Array<{ type?: string, amount?: number, createdAt?: unknown }>} rows */

/** Sum earning-type transactions for “today” and “this calendar month” in `TIMEZONE` (IST). */
export function ledgerEarningTotalsIST(rows) {
  let today = 0
  let month = 0
  const now = new Date()
  const fmtDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const fmtMonth = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  })
  const keyDay = fmtDay.format(now)
  const keyMonth = fmtMonth.format(now)

  for (const r of rows) {
    if (String(r.type || '').toLowerCase() !== 'earning') continue
    const amt = Number(r.amount)
    if (!Number.isFinite(amt) || amt < 0) continue
    const d = createdAtToDate(r.createdAt)
    if (!d) continue
    if (fmtDay.format(d) === keyDay) today += amt
    if (fmtMonth.format(d) === keyMonth) month += amt
  }
  return { today, month }
}

=======
/** @param {Array<{ type?: string, amount?: number, createdAt?: unknown }>} rows */

>>>>>>> 4a4f0d8c0be02f36b3ee800b83c8d3ef82c5f535
export function summarizeTechnicianTransactions(rows) {
  let totalEarned = 0
  let totalPaid = 0
  /** @type {Date | null} */
  let lastPayoutAt = null
  for (const r of rows) {
    const t = String(r.type || '').toLowerCase()
    const amt = Number(r.amount)
    if (!Number.isFinite(amt) || amt < 0) continue
    if (t === 'earning') totalEarned += amt
    else if (t === 'payout') {
      totalPaid += amt
      const d = createdAtToDate(r.createdAt)
      if (d && (!lastPayoutAt || d.getTime() > lastPayoutAt.getTime())) lastPayoutAt = d
    }
  }
  const remaining = totalEarned - totalPaid
  return {
    totalEarned,
    totalPaid,
    remaining,
    lastPayoutAt,
    isOverpaid: remaining < -0.005,
  }
}

export function sortTransactionsNewestFirst(rows) {
  return [...rows].sort((a, b) => transactionTimeMs(b) - transactionTimeMs(a))
}

export function transactionTimeMs(row) {
  return createdAtToDate(row?.createdAt)?.getTime() ?? 0
}

/** @returns {Date | null} */
export function createdAtToDate(raw) {
  if (raw == null) return null
  if (typeof raw.toDate === 'function') {
    const d = raw.toDate()
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
  }
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  return null
}
