import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { isFirebaseConfigured, storage } from '../firebase/config'

const ensureStorage = () => {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Storage is not configured (check VITE_FIREBASE_STORAGE_BUCKET).')
  }
}

/** Path inside bucket from a Firebase download URL (v0 REST format). */
function storagePathFromDownloadUrl(downloadUrl) {
  try {
    const u = new URL(downloadUrl)
    const marker = '/o/'
    const i = u.pathname.indexOf(marker)
    if (i === -1) return null
    const encoded = u.pathname.slice(i + marker.length)
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

export function validatePaymentQrFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' }
  const t = (file.type || '').toLowerCase()
  if (!ALLOWED_TYPES.has(t)) {
    return { ok: false, error: 'Use JPG, JPEG, PNG, or WebP only.' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'Image must be 5 MB or smaller.' }
  }
  return { ok: true }
}

/**
 * Uploads a payment QR image for platform settings.
 * @returns {Promise<string>} download URL
 */
export async function uploadGlobalPaymentQrImage(file) {
  ensureStorage()
  const safeName = String(file.name || 'qr').replace(/[^\w.-]+/g, '_')
  const path = `platform-settings/payment-qr/${Date.now()}_${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/png' })
  return getDownloadURL(storageRef)
}

/** Deletes a file given its Firebase HTTPS download URL. Ignores invalid URLs. */
export async function deleteStorageFileAtDownloadUrl(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return
  if (!downloadUrl.includes('firebasestorage.googleapis.com')) return
  ensureStorage()
  try {
    const path = storagePathFromDownloadUrl(downloadUrl)
    if (!path) return
    await deleteObject(ref(storage, path))
  } catch (e) {
    console.warn('[storage] delete payment QR file', e)
  }
}
