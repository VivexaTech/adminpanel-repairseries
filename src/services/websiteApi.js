/**
 * Website Vercel APIs (notifications, freeze). Auth is Firebase ID token.
 */
import { auth } from '../firebase/config'
import { websiteApiUrl } from './websiteOrigin'

async function authHeaders() {
  const user = auth?.currentUser
  if (!user) throw new Error('Please sign in as admin.')
  const token = await user.getIdToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export async function postWebsiteApi(path, body) {
  const url = websiteApiUrl(path)
  if (!url) {
    throw new Error('Set VITE_WEBSITE_API_URL to your website origin.')
  }
  const headers = await authHeaders()
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`)
  }
  return payload
}

export async function requestRemotePush(payload) {
  return postWebsiteApi('/api/notifications/send', payload)
}

export async function processNotificationOutbox() {
  return postWebsiteApi('/api/notifications/process-outbox', {})
}

export async function freezeBookingEconomics(bookingId) {
  if (!bookingId) return null
  return postWebsiteApi('/api/bookings/freeze-economics', { bookingId })
}

export async function assignPartner(body) {
  return postWebsiteApi('/api/bookings/assign', body)
}
