const crypto = require('crypto')
const FormData = require('form-data')

function requireEnv(name, value) {
  const text = value != null ? String(value).trim() : ''
  if (!text) throw new Error(`Missing required secret/config: ${name}`)
  return text
}

/**
 * Upload invoice PDF to Cloudinary as a raw file.
 * Folder: repair-series/invoices/YYYY/MM/
 * Filename: INV-YYYYMMDD-BOOKINGID.pdf
 *
 * Access control: PDF URL is only exposed via Firestore invoice/booking docs,
 * which customers/admins can read under security rules. Public ID paths are
 * non-enumerable (include booking id + date).
 */
async function uploadInvoicePdfToCloudinary(pdfBuffer, { folder, publicId, fileName, config }) {
  const cloudName = requireEnv('CLOUDINARY_CLOUD_NAME', config.cloudName)
  const apiKey = requireEnv('CLOUDINARY_API_KEY', config.apiKey)
  const apiSecret = requireEnv('CLOUDINARY_API_SECRET', config.apiSecret)

  const timestamp = Math.floor(Date.now() / 1000)
  const barePublicId = String(publicId || fileName || 'invoice')
    .replace(/^\/+/, '')
    .replace(/\.pdf$/i, '')
  const shortPublicId = barePublicId.includes('/')
    ? barePublicId.split('/').pop()
    : barePublicId

  const paramsToSign = {
    folder: folder || undefined,
    public_id: shortPublicId,
    timestamp,
    overwrite: 'true',
  }

  const toSign = Object.keys(paramsToSign)
    .filter((key) => paramsToSign[key] != null && paramsToSign[key] !== '')
    .sort()
    .map((key) => `${key}=${paramsToSign[key]}`)
    .join('&')
  const signature = crypto
    .createHash('sha1')
    .update(`${toSign}${apiSecret}`)
    .digest('hex')

  const form = new FormData()
  form.append('file', pdfBuffer, {
    filename: fileName || 'invoice.pdf',
    contentType: 'application/pdf',
  })
  form.append('api_key', apiKey)
  form.append('timestamp', String(timestamp))
  form.append('signature', signature)
  form.append('overwrite', 'true')
  if (folder) form.append('folder', folder)
  form.append('public_id', shortPublicId)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
    {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    },
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Cloudinary upload failed (${response.status})`,
    )
  }

  const secureUrl = String(payload.secure_url || payload.url || '').trim()
  if (!secureUrl) throw new Error('Cloudinary upload returned no URL')

  return {
    url: secureUrl,
    secureUrl,
    publicId: String(payload.public_id || `${folder}/${shortPublicId}`),
    bytes: Number(payload.bytes) || pdfBuffer.length,
    resourceType: payload.resource_type || 'raw',
    folder: payload.folder || folder,
  }
}

module.exports = { uploadInvoicePdfToCloudinary }
