import { subscribeDoc, upsertDoc } from './firestore'

export const DEFAULT_SCHEDULING_SETTINGS = Object.freeze({
  travelBufferMinutes: 30,
  slotIntervalMinutes: 60,
  maximumDailyBookings: 8,
  workingHours: Object.freeze({ startHour: 8, endHour: 18 }),
})

function positive(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export function normalizeSchedulingSettings(raw = {}) {
  const hours = raw.workingHours || {}
  const startHour = positive(hours.startHour, DEFAULT_SCHEDULING_SETTINGS.workingHours.startHour)
  const endHour = positive(hours.endHour, DEFAULT_SCHEDULING_SETTINGS.workingHours.endHour)
  return {
    travelBufferMinutes: Math.round(
      positive(raw.travelBufferMinutes, DEFAULT_SCHEDULING_SETTINGS.travelBufferMinutes),
    ),
    slotIntervalMinutes: Math.round(
      positive(raw.slotIntervalMinutes, DEFAULT_SCHEDULING_SETTINGS.slotIntervalMinutes),
    ),
    maximumDailyBookings: Math.round(
      positive(raw.maximumDailyBookings, DEFAULT_SCHEDULING_SETTINGS.maximumDailyBookings),
    ),
    workingHours: {
      startHour,
      endHour: endHour > startHour ? endHour : startHour + 10,
    },
  }
}

export function subscribeSchedulingSettings(onNext, onError) {
  return subscribeDoc(
    'settings',
    'scheduling',
    (row) => onNext(normalizeSchedulingSettings(row || {})),
    onError,
  )
}

export async function saveSchedulingSettings(settings) {
  const normalized = normalizeSchedulingSettings(settings)
  if (![15, 30, 60].includes(normalized.slotIntervalMinutes)) {
    throw new Error('Slot interval must be 15, 30, or 60 minutes.')
  }
  if (normalized.workingHours.endHour <= normalized.workingHours.startHour) {
    throw new Error('Working end time must be after start time.')
  }
  await upsertDoc('settings', 'scheduling', normalized)
  return normalized
}
