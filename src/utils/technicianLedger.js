/** @param {Array<{ type?: string, amount?: number, createdAt?: unknown }>} rows */

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
