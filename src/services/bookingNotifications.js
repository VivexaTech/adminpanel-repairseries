import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase/config'
import { requestRemotePush } from './websiteApi'

export const BOOKING_NOTIFICATION_TITLE = 'Booking Update'

/**
 * Maps admin booking lifecycle events to user-visible copy.
 * @param {'created' | 'assigned' | 'started' | 'completed' | 'cancelled' | 'rescheduled' | 'add_on_approval_needed' | 'add_on_approved' | 'add_on_rejected'} eventType
 * @param {string} [serviceName]
 */
export function bookingNotificationBody(eventType, serviceName = '') {
  const s = (serviceName || 'your service').trim() || 'your service'
  switch (eventType) {
    case 'created':
      return `Your booking for ${s} is confirmed. We'll notify you when a technician is assigned.`
    case 'assigned':
      return `A technician has been assigned to your ${s} booking.`
    case 'started':
      return `Your ${s} service has started.`
    case 'completed':
      return `Your ${s} booking is complete. Thank you!`
    case 'cancelled':
      return `Your ${s} booking has been cancelled. Contact support if you need help.`
    case 'rescheduled':
      return `Your ${s} booking has been rescheduled. Open the app to see the new time.`
    case 'add_on_approval_needed':
      return `Your technician added extra items to ${s}. Open the app to review and approve the new total.`
    case 'add_on_approved':
      return `Add-on services for ${s} were approved. Your updated total is saved.`
    case 'add_on_rejected':
      return `Add-on services for ${s} were not approved. Your booking price is unchanged.`
    default:
      return 'Your booking has been updated.'
  }
}

/**
 * Deliver a remote push via the website Vercel API.
 * Falls back to `bookingNotificationOutbox` if the API is unavailable.
 */
export async function enqueueBookingNotification({
  customerId,
  bookingId = '',
  eventType,
  serviceName = '',
  technicianId = '',
  audience = 'both',
}) {
  if (!customerId || !eventType) return

  try {
    await requestRemotePush({
      eventType,
      bookingId: String(bookingId || ''),
      customerId: String(customerId),
      technicianId: String(technicianId || ''),
      serviceName: String(serviceName || ''),
      audience,
    })
    return
  } catch (err) {
    console.warn('[notify] Vercel send failed, queueing outbox', err?.message || err)
  }

  if (!isFirebaseConfigured || !db) return

  await addDoc(collection(db, 'bookingNotificationOutbox'), {
    customerId,
    technicianId: String(technicianId || ''),
    bookingId: String(bookingId),
    eventType,
    title: BOOKING_NOTIFICATION_TITLE,
    body: bookingNotificationBody(eventType, serviceName),
    serviceName: String(serviceName || ''),
    audience,
    processed: false,
    status: 'pending',
    attemptCount: 0,
    operationType: 'notification',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
