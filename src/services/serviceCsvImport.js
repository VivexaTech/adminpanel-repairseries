/** @typedef {{ id: string, name: string }} CategoryLite */

import { Timestamp } from 'firebase/firestore'

/** Only these CSV columns are read; all others are ignored. */
export const SERVICE_CSV_ALLOWED_FIELDS = [
  'id',
  'description',
  'visitingCharge',
  'detailImage',
  'homeImage',
  'updatedAt',
  'listImage',
  'duration',
  'name',
  'variations',
  'hasVariations',
  'categoryId',
  'createdAt',
  'extraPoint',
  'brands',
  'price',
  'status',
  'processSteps',
  'keyPoints',
  'imageUrl',
  'category',
  'additionalServices',
]

const ALLOWED = new Set(SERVICE_CSV_ALLOWED_FIELDS)

const newVariationId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `var-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export function normalizeCsvHeader(h) {
  return String(h || '')
    .trim()
    .replace(/^\ufeff/, '')
}

/**
 * Keep only approved columns (ignore title, tags, etc.).
 * @param {Record<string, string>} row
 */
export function pickWhitelistedRow(row) {
  const out = {}
  if (!row || typeof row !== 'object') return out
  for (const key of Object.keys(row)) {
    const k = normalizeCsvHeader(key)
    if (ALLOWED.has(k)) out[k] = row[key]
  }
  return out
}

export function parseBooleanCell(value) {
  if (value == null || value === '') return false
  const s = String(value).trim().toLowerCase()
  return s === 'true' || s === 'yes' || s === '1' || s === 'y'
}

export function resolveCategoryId(raw, categories) {
  const v = String(raw ?? '').trim()
  if (!v) return null
  const byId = categories.find((c) => c.id === v)
  if (byId) return byId.id
  const lower = v.toLowerCase()
  const byName = categories.find((c) => String(c.name || '').trim().toLowerCase() === lower)
  return byName ? byName.id : null
}

function safeNonNegNumber(value, fallback = 0) {
  if (value == null || String(value).trim() === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

/** Safe JSON array: invalid / null / non-array → []. Never throws. */
export function tryParseJsonArray(raw) {
  if (raw == null || String(raw).trim() === '') return []
  try {
    const v = JSON.parse(String(raw).trim())
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Firestore Timestamp or null (invalid / empty). */
export function parseFirestoreTimestamp(value) {
  if (value == null || String(value).trim() === '') return null
  const s = String(value).trim()
  const n = Number(s)
  if (Number.isFinite(n) && n > 0) {
    const ms = n < 1e12 ? Math.round(n * 1000) : Math.round(n)
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d)
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d)
  return null
}

/**
 * Parse variations JSON → array on service doc. Incomplete objects skipped.
 * Preserves id, title, price, image, status (default Active).
 */
export function normalizeVariationsLoose(raw) {
  const arr = tryParseJsonArray(raw)
  const out = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const id = String(item.id || '').trim() || newVariationId()
    const title = String(item.title || item.name || '').trim()
    const price = Number(item.price)
    const image = String(item.image || '').trim()
    const status = String(item.status || 'Active').trim() || 'Active'
    if (!title || !Number.isFinite(price) || price < 0 || !image) continue
    out.push({ id, title, price, image, status })
  }
  return out
}

function normalizeBrandsLoose(raw) {
  const arr = tryParseJsonArray(raw)
  const out = []
  for (const b of arr) {
    if (!b || typeof b !== 'object') continue
    const name = String(b.name || '').trim()
    const logoImage = String(b.logoImage || '').trim()
    if (name && logoImage) out.push({ name, logoImage })
  }
  return out
}

function normalizeProcessStepsLoose(raw) {
  const arr = tryParseJsonArray(raw)
  const out = []
  for (const s of arr) {
    if (!s || typeof s !== 'object') continue
    const title = String(s.title || '').trim()
    const description = String(s.description || '').trim()
    if (!title && !description) continue
    const rawImg = s.image
    const image =
      rawImg == null || String(rawImg).trim() === '' ? null : String(rawImg).trim()
    out.push({ title, description, image })
  }
  return out
}

function normalizeKeyPointsLoose(raw) {
  const arr = tryParseJsonArray(raw)
  const out = []
  for (const x of arr) {
    const s = String(x ?? '').trim()
    if (s) out.push(s)
  }
  return out
}

function normalizeAdditionalServicesLoose(raw) {
  const arr = tryParseJsonArray(raw)
  const out = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const name = String(item.serviceName ?? item.name ?? item.title ?? '').trim()
    const price = Number(item.price ?? item.amount ?? 0)
    if (!name) continue
    if (!Number.isFinite(price) || price < 0) continue
    const row = { serviceName: name, price }
    if (item.title != null && String(item.title).trim()) row.title = String(item.title).trim()
    if (item.approvalStatus != null) row.approvalStatus = String(item.approvalStatus)
    if (item.description != null && String(item.description).trim())
      row.description = String(item.description).trim()
    out.push(row)
  }
  return out
}

/**
 * Required: id, name, and categoryId (directly or via resolvable `category`).
 * All other supported fields optional with safe defaults.
 * Variations: if `hasVariations` is true, parsed array replaces the service `variations` field entirely (no merge / no duplicates).
 *
 * @param {Record<string, string>} row — raw CSV row (any columns; non-whitelisted ignored)
 * @param {CategoryLite[]} categories
 * @returns {{ ok: true, id: string, payload: Record<string, unknown>, variationCount: number } | { ok: false, error: string }}
 */
export function parseServiceCsvRow(row, categories) {
  const r = pickWhitelistedRow(row)

  const id = String(r.id ?? '').trim()
  if (!id) return { ok: false, error: 'Missing id.' }

  const name = String(r.name ?? '').trim()
  if (!name) return { ok: false, error: 'Missing name.' }

  let categoryId = String(r.categoryId ?? '').trim()
  if (!categoryId && r.category != null && String(r.category).trim() !== '') {
    categoryId = resolveCategoryId(r.category, categories) || ''
  }
  if (!categoryId) return { ok: false, error: 'Missing categoryId (or category id/name).' }

  let hasVariations = parseBooleanCell(r.hasVariations)
  let variations = normalizeVariationsLoose(r.variations)
  if (!hasVariations && variations.length > 0) {
    hasVariations = true
  }

  const price = hasVariations ? 0 : safeNonNegNumber(r.price, 0)
  const visitingCharge = safeNonNegNumber(r.visitingCharge, 0)
  const duration = safeNonNegNumber(r.duration, 0)

  const homeImage = String(r.homeImage ?? '').trim() || String(r.imageUrl ?? '').trim()
  const imageUrl = String(r.imageUrl ?? '').trim() || homeImage
  const listImage = String(r.listImage ?? '').trim() || homeImage
  const detailImage = String(r.detailImage ?? '').trim() || homeImage

  const description = String(r.description ?? '').trim()
  const extraPoint = String(r.extraPoint ?? '').trim()
  const statusRaw = String(r.status ?? '').trim()
  const status = statusRaw || 'Active'

  const brands = normalizeBrandsLoose(r.brands)
  const processSteps = normalizeProcessStepsLoose(r.processSteps)
  const keyPoints = normalizeKeyPointsLoose(r.keyPoints)
  const additionalServices = normalizeAdditionalServicesLoose(r.additionalServices)

  const payload = {
    name,
    description,
    keyPoints,
    hasVariations,
    variations: hasVariations ? variations : [],
    price,
    visitingCharge,
    duration,
    categoryId,
    extraPoint,
    imageUrl,
    homeImage,
    listImage,
    detailImage,
    brands,
    processSteps,
    status,
    additionalServices,
  }

  const createdAt = parseFirestoreTimestamp(r.createdAt)
  const updatedAt = parseFirestoreTimestamp(r.updatedAt)
  if (createdAt) payload.createdAt = createdAt
  if (updatedAt) payload.updatedAt = updatedAt

  const variationCount = hasVariations ? variations.length : 0

  return { ok: true, id, payload, variationCount }
}
