/**
 * Hourly schedule grid in Asia/Kolkata (matches typical Repair Series field ops).
 * Slot index 1 = 08:00–09:00, … up to last hour before SCHED_DAY_END_EXCL.
 */

export const TIMEZONE = 'Asia/Kolkata'
export const SCHED_DAY_START_HOUR = 8
export const SCHED_DAY_END_EXCL = 22

/** @typedef {{ dateKey: string, slotIndex: number, slotDocId: string, slotLabel: string }} SlotDescriptor */

function partsFromDateInTz(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  )
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    min: Number(parts.minute),
    sec: Number(parts.second),
  }
}

export function dateKeyFromIndiaParts(p) {
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

/** @param {Date} date */
export function getIndiaDateKeyForDate(date) {
  const p = partsFromDateInTz(date, TIMEZONE)
  return dateKeyFromIndiaParts(p)
}

export function hourToSlotIndex(hour) {
  if (hour < SCHED_DAY_START_HOUR || hour >= SCHED_DAY_END_EXCL) return null
  return hour - SCHED_DAY_START_HOUR + 1
}

export function slotLabelFromIndex(slotIndex) {
  const startH = SCHED_DAY_START_HOUR + slotIndex - 1
  const endH = startH + 1
  return `${String(startH).padStart(2, '0')}:00 - ${String(endH).padStart(2, '0')}:00`
}

export function buildSlotDocId(dateKey, slotIndex) {
  return `${dateKey}_${slotIndex}`
}

/**
 * Next ISO wall-clock instant in IST on/after `ms` at the start of the next full hour in IST.
 * @param {number} ms
 */
function nextIndiaHourStartAfterMs(ms) {
  const p = partsFromDateInTz(new Date(ms), TIMEZONE)
  const offsetInHour = p.min * 60_000 + p.sec * 1000
  return ms - offsetInHour + 3_600_000
}

/**
 * All hourly slots a booking occupies (IST wall time).
 * @param {Date} startDate
 * @param {number} durationMinutes
 * @returns {SlotDescriptor[]}
 */
export function getSlotDescriptorsForBookingWindow(startDate, durationMinutes) {
  const duration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 60
  const startMs = startDate.getTime()
  const endMs = startMs + duration * 60_000
  const seen = new Set()
  /** @type {SlotDescriptor[]} */
  const out = []
  let curMs = startMs
  while (curMs < endMs) {
    const p = partsFromDateInTz(new Date(curMs), TIMEZONE)
    const idx = hourToSlotIndex(p.h)
    if (idx != null) {
      const dateKey = dateKeyFromIndiaParts(p)
      const slotDocId = buildSlotDocId(dateKey, idx)
      if (!seen.has(slotDocId)) {
        seen.add(slotDocId)
        out.push({
          dateKey,
          slotIndex: idx,
          slotDocId,
          slotLabel: slotLabelFromIndex(idx),
        })
      }
    }
    curMs = nextIndiaHourStartAfterMs(curMs)
  }
  return out
}

/**
 * Human-readable slot state for calendars.
 * @param {'booking' | 'manual' | string | undefined} reason
 * @param {'busy' | string | undefined} status
 */
export function slotDisplayKind(reason, status) {
  if (String(status || '').toLowerCase() !== 'busy') return 'free'
  const r = String(reason || '').toLowerCase()
  if (r === 'manual') return 'manual'
  if (r === 'booking') return 'booking'
  return 'booking'
}
