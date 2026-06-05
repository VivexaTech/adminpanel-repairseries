/**
 * Delivers FCM notifications when the admin panel writes to `bookingNotificationOutbox`.
 *
 * Deploy: `firebase deploy --only functions`
 *
 * Prerequisite: user app stores device tokens on the customer document, e.g.
 *   customers/{customerId}.fcmTokens = ["<token>", ...]
 *
 * FCM works when the app is closed (data + notification payload).
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

initializeApp()
const db = getFirestore()
const messaging = getMessaging()

exports.deliverBookingNotification = onDocumentCreated(
  {
    document: 'bookingNotificationOutbox/{docId}',
    region: process.env.FUNCTION_REGION || 'us-central1',
  },
  async (event) => {
    const snap = event.data
    if (!snap?.exists) return
    const data = snap.data()
    if (data.processed === true) return

    const customerId = data.customerId
    if (!customerId) {
      await snap.ref.update({
        processed: true,
        error: 'no_customerId',
        deliveredAt: FieldValue.serverTimestamp(),
      })
      return
    }

    const custSnap = await db.doc(`customers/${customerId}`).get()
    if (!custSnap.exists) {
      await snap.ref.update({
        processed: true,
        error: 'customer_not_found',
        deliveredAt: FieldValue.serverTimestamp(),
      })
      return
    }

    const cust = custSnap.data() || {}
    const raw = cust.fcmTokens || cust.deviceTokens || []
    const tokens = (Array.isArray(raw) ? raw : [])
      .filter((t) => typeof t === 'string' && t.length > 8)

    if (!tokens.length) {
      await snap.ref.update({
        processed: true,
        error: 'no_tokens',
        deliveredAt: FieldValue.serverTimestamp(),
      })
      return
    }

    const title = data.title || 'Booking Update'
    const body = data.body || 'Your booking has been updated.'

    const messages = tokens.map((token) => ({
      token,
      notification: { title, body },
      data: {
        bookingId: String(data.bookingId || ''),
        eventType: String(data.eventType || ''),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: { priority: 'high' },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default' } },
      },
    }))

    let successCount = 0
    let failureCount = 0
    let sendError = null
    try {
      const batch = await messaging.sendEach(messages)
      successCount = batch.successCount
      failureCount = batch.failureCount
    } catch (err) {
      sendError = String(err?.message || err)
    }

    await snap.ref.update({
      processed: true,
      deliveredAt: FieldValue.serverTimestamp(),
      successCount,
      failureCount,
      ...(sendError ? { sendError } : {}),
    })
  },
)
