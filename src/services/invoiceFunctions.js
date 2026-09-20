/**
 * Admin invoice actions via Next.js / Vercel API (no Firebase Cloud Functions).
 */
import { auth } from '../firebase/config'
import { websiteApiOrigin, websiteApiUrl } from './websiteOrigin'

async function authHeaders() {
  const user = auth?.currentUser
  if (!user) throw new Error('Please sign in as admin.')
  const token = await user.getIdToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/** Admin: download Tax Invoice PDF after server-side ownership checks. */
export async function downloadInvoicePdf({ bookingId, fileName }) {
  if (!websiteApiOrigin()) {
    throw new Error(
      'Set VITE_WEBSITE_API_URL to your website origin (e.g. https://repairseries.in).',
    )
  }
  const user = auth?.currentUser
  if (!user) throw new Error('Please sign in as admin.')
  const token = await user.getIdToken()
  const response = await fetch(
    websiteApiUrl(`api/invoices/file?bookingId=${encodeURIComponent(bookingId)}`),
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'Could not download invoice')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName || `invoice-${bookingId}.pdf`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Admin: regenerate Tax Invoice PDF for a booking. */
export async function regenerateInvoice({ bookingId, sendEmail = true }) {
  if (!websiteApiOrigin()) {
    throw new Error(
      'Set VITE_WEBSITE_API_URL to your website origin (e.g. https://repairseries.in).',
    )
  }
  const headers = await authHeaders()
  const response = await fetch(websiteApiUrl('api/invoices/generate'), {
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

/** Admin: resend invoice email with the stored PDF. */
export async function resendInvoiceEmail({ bookingId, invoiceId }) {
  if (!websiteApiOrigin()) {
    throw new Error(
      'Set VITE_WEBSITE_API_URL to your website origin (e.g. https://repairseries.in).',
    )
  }
  const headers = await authHeaders()
  const response = await fetch(websiteApiUrl('api/invoices/resend-email'), {
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
