/** Per-service revisit policy (admin-configurable). */

export const REVISIT_TYPES = [
  { value: 'fixed_count', label: 'Fixed Revisit Count' },
  { value: 'time_based', label: 'Time Based Revisit' },
]

export const REVISIT_TYPE_LABELS = Object.fromEntries(
  REVISIT_TYPES.map((t) => [t.value, t.label]),
)

export const REVISIT_VALIDITY_UNITS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
]

export const DEFAULT_REVISIT_POLICY = Object.freeze({
  enabled: false,
  type: 'fixed_count',
  freeRevisitCount: 2,
  /** For time_based: unlimited within window when null/0 means unlimited. */
  maxRevisitsInPeriod: 0,
  validityValue: 30,
  validityUnit: 'days',
})

export function normalizeRevisitPolicy(raw = {}) {
  const type =
    String(raw.type || '').trim() === 'time_based' ? 'time_based' : 'fixed_count'
  const validityUnit = ['days', 'weeks', 'months'].includes(String(raw.validityUnit))
    ? String(raw.validityUnit)
    : 'days'
  const freeRevisitCount = Math.max(0, Math.round(Number(raw.freeRevisitCount) || 0))
  const maxRevisitsInPeriod = Math.max(0, Math.round(Number(raw.maxRevisitsInPeriod) || 0))
  const validityValue = Math.max(1, Math.round(Number(raw.validityValue) || 30))
  return {
    enabled: raw.enabled === true,
    type,
    freeRevisitCount: type === 'fixed_count' ? freeRevisitCount || 2 : freeRevisitCount,
    maxRevisitsInPeriod,
    validityValue,
    validityUnit,
  }
}

export function validityToDays(value, unit) {
  const n = Math.max(1, Math.round(Number(value) || 1))
  if (unit === 'weeks') return n * 7
  if (unit === 'months') return n * 30
  return n
}
