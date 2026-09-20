/**
 * Website origin that hosts Vercel APIs. Never append /api here.
 */
export function websiteApiOrigin(raw = import.meta.env.VITE_WEBSITE_API_URL) {
  return String(raw || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\/api$/i, '')
}

export function websiteApiUrl(path) {
  const origin = websiteApiOrigin()
  if (!origin) return ''
  const suffix = String(path || '').replace(/^\/+/, '')
  return `${origin}/${suffix}`
}
