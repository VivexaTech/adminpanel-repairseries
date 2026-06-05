/** @typedef {{ id: string, name: string }} CategoryLite */

import { normalizeCsvHeader, parseFirestoreTimestamp, resolveCategoryId } from './serviceCsvImport'

export const ADDITIONAL_SERVICE_CSV_FIELDS = ['id', 'title', 'price', 'categoryId', 'category', 'createdAt', 'updatedAt']

const ALLOWED = new Set(ADDITIONAL_SERVICE_CSV_FIELDS)

/**
 * @param {Record<string, string>} row
 */
export function pickAdditionalServiceRow(row) {
  const out = {}
  if (!row || typeof row !== 'object') return out
  for (const key of Object.keys(row)) {
    const k = normalizeCsvHeader(key)
    if (ALLOWED.has(k)) out[k] = row[key]
  }
  return out
}

function safeNonNegNumber(value) {
  if (value == null || String(value).trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/**
 * @param {Record<string, string>} row
 * @param {CategoryLite[]} categories
 * @returns {{ ok: true, id: string | null, payload: Record<string, unknown> } | { ok: false, error: string }}
 */
export function parseAdditionalServiceCsvRow(row, categories) {
  const r = pickAdditionalServiceRow(row)

  const idRaw = String(r.id ?? '').trim()
  const id = idRaw || null

  const title = String(r.title ?? '').trim()
  if (!title) return { ok: false, error: 'Missing title.' }

  const price = safeNonNegNumber(r.price)
  if (price == null) return { ok: false, error: 'Invalid price (use a non-negative number).' }

  let categoryId = String(r.categoryId ?? '').trim()
  if (!categoryId && r.category != null && String(r.category).trim() !== '') {
    categoryId = resolveCategoryId(r.category, categories) || ''
  }
  if (!categoryId) return { ok: false, error: 'Missing categoryId (or resolvable category name).' }

  const payload = {
    title,
    price,
    categoryId,
  }

  const createdAt = parseFirestoreTimestamp(r.createdAt)
  const updatedAt = parseFirestoreTimestamp(r.updatedAt)
  if (createdAt) payload.createdAt = createdAt
  if (updatedAt) payload.updatedAt = updatedAt

  return { ok: true, id, payload }
}

/** Re-export for CSV header transform */
export { normalizeCsvHeader }
