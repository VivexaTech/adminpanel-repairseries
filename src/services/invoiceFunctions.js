/**
 * Admin invoice actions via Next.js API (Spark-safe — no Firebase callable functions).
 */
import { auth } from '../firebase/config'

function apiBaseUrl() {
  return String(import.meta.env.VITE_WEBSITE_API_URL || '')
    .trim()
    .replace(/\/$/, '')
}

async function authHeaders() {
  const user = auth?.currentUser
  if (!user) throw new Error('Please sign in as admin.')
  const token = await user.getIdToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/** Admin: regenerate Tax Invoice PDF for a booking. */
export async function regenerateInvoice({ bookingId, sendEmail = true }) {
  const base = apiBaseUrl()
  if (!base) {
    throw new Error(
      'Set VITE_WEBSITE_API_URL to your website origin (e.g. https://repairseries.in).',
    )
  }
  const headers = await authHeaders()
  const response = await fetch(`${base}/api/invoices/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ bookingId, force: true, sendEmail }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to regenerate invoice')
  }
  return payload
}

/** Admin: resend invoice email with existing Cloudinary PDF. */
export async function resendInvoiceEmail({ bookingId, invoiceId }) {
  const base = apiBaseUrl()
  if (!base) {
    throw new Error(
      'Set VITE_WEBSITE_API_URL to your website origin (e.g. https://repairseries.in).',
    )
  }
  const headers = await authHeaders()
  const response = await fetch(`${base}/api/invoices/resend-email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ bookingId, invoiceId }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to resend invoice email')
  }
  return payload
}
