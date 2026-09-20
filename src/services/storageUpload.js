import { auth } from '../firebase/config'

const MAX_EDGE = 1920
const QUALITY = 0.82
const MAX_BYTES = 4 * 1024 * 1024

function cloudinaryConfig() {
  return {
    cloudName: String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim(),
    uploadPreset: String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim(),
  }
}

export function isStorageConfigured() {
  const { cloudName, uploadPreset } = cloudinaryConfig()
  return Boolean(cloudName && uploadPreset)
}

export function getOptimizedImageUrl(url) {
  if (!url?.includes('/upload/')) return url
  return url.replace('/upload/', '/upload/f_auto,q_auto/')
}

async function compressImageFile(file) {
  if (typeof createImageBitmap !== 'function') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY))
  if (!blob) return file
  const name = String(file.name || 'image').replace(/\.[a-z0-9]+$/i, '.webp')
  return new File([blob], name, { type: 'image/webp' })
}

export async function uploadMedia(file) {
  if (!file) return ''
  const { cloudName, uploadPreset } = cloudinaryConfig()
  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET for image upload.',
    )
  }
  if (!auth?.currentUser) throw new Error('Please sign in as admin.')
  const prepared = await compressImageFile(file)
  if (prepared.size > MAX_BYTES) {
    throw new Error('Image must be 4 MB or smaller after compression.')
  }

  const form = new FormData()
  form.append('file', prepared)
  form.append('upload_preset', uploadPreset)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      `Cloudinary upload failed (${response.status}).`
    throw new Error(message)
  }
  const url = String(payload.secure_url || '').trim()
  if (!url) throw new Error('Cloudinary did not return an image URL.')
  return url
}

export async function deleteStoredFile() {
  // Direct Cloudinary unsigned uploads are not deleted through our backend.
}

export const uploadToCloudinary = uploadMedia
export const isCloudinaryConfigured = isStorageConfigured
