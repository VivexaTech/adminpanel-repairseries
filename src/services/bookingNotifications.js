import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase/config'

export const BOOKING_NOTIFICATION_TITLE = 'Booking Update'

/**
 * Maps admin booking lifecycle events to user-visible copy.
 * @param {'created' | 'assigned' | 'started' | 'completed'} eventType
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
    default:
      return 'Your booking has been updated.'
  }
}

/**
 * Queues a push for the Cloud Function `deliverBookingNotification` to send via FCM.
 * Customer doc should include `fcmTokens` (string[]) from the user app.
 */
export async function enqueueBookingNotification({
  customerId,
  bookingId = '',
  eventType,
  serviceName = '',
}) {
  if (!isFirebaseConfigured || !db) return
  if (!customerId || !eventType) return

  await addDoc(collection(db, 'bookingNotificationOutbox'), {
    customerId,
    bookingId: String(bookingId),
    eventType,
    title: BOOKING_NOTIFICATION_TITLE,
    body: bookingNotificationBody(eventType, serviceName),
    serviceName: String(serviceName || ''),
    processed: false,
    createdAt: serverTimestamp(),
  })
}
