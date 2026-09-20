import { deleteObject, ref } from 'firebase/storage'
import { isFirebaseConfigured, storage } from '../firebase/config'
import { deleteStoredFile, uploadMedia } from './storageUpload'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

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

export async function uploadGlobalPaymentQrImage(file) {
  return uploadMedia(file, { kind: 'payment-qr', slot: 'qr' })
}

export async function deleteStorageFileAtDownloadUrl(downloadUrl) {
  if (!downloadUrl || typeof downloadUrl !== 'string') return
  if (downloadUrl.includes('firebasestorage.googleapis.com') || downloadUrl.includes('firebasestorage.app')) {
    if (!isFirebaseConfigured || !storage) return
    try {
      const path = storagePathFromDownloadUrl(downloadUrl)
      if (!path) return
      await deleteObject(ref(storage, path))
    } catch (e) {
      console.warn('[storage] delete payment QR file', e)
    }
    return
  }
  await deleteStoredFile({ url: downloadUrl })
}
