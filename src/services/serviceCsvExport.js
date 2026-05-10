import Papa from 'papaparse'
import { downloadCsv } from '../utils/helpers'

/** Stable column order for round-trip import/export. */
export const SERVICE_CSV_EXPORT_COLUMNS = [
  'id',
  'name',
  'categoryId',
  'category',
  'description',
  'hasVariations',
  'variations',
  'price',
  'visitingCharge',
  'duration',
  'status',
  'extraPoint',
  'homeImage',
  'listImage',
  'detailImage',
  'imageUrl',
  'keyPoints',
  'brands',
  'processSteps',
  'additionalServices',
  'createdAt',
  'updatedAt',
]

function timestampToCsv(value) {
  if (value == null || value === '') return ''
  try {
    if (typeof value.toDate === 'function') {
      const d = value.toDate()
      return Number.isNaN(d.getTime()) ? '' : d.toISOString()
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  } catch {
    return ''
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/**
 * Variations as JSON string for one CSV cell (id, title, price, image, status).
 */
export function serializeServiceVariationsJson(service) {
  const vars = Array.isArray(service?.variations) ? service.variations : []
  if (!vars.length) return '[]'
  const normalized = vars.map((v) => {
    if (!v || typeof v !== 'object') return null
    const id = String(v.id ?? '').trim()
    const title = String(v.title ?? v.name ?? '').trim()
    const price = Number(v.price)
    const image = String(v.image ?? '').trim()
    const status = String(v.status ?? 'Active').trim() || 'Active'
    if (!title || !Number.isFinite(price) || price < 0 || !image) return null
    return { id, title, price, image, status }
  })
  const kept = normalized.filter(Boolean)
  return JSON.stringify(kept.length ? kept : [])
}

function stringifyJsonArray(value) {
  if (!Array.isArray(value)) return '[]'
  try {
    return JSON.stringify(value)
  } catch {
    return '[]'
  }
}

/**
 * One flat row for CSV (nested data as JSON strings).
 * @param {object} service — Firestore service doc with id
 * @param {string} categoryLabel — category name for human column
 */
export function serviceToCsvRow(service, categoryLabel = '') {
  const hasVariations = Boolean(service.hasVariations)
  const variationsCell = serializeServiceVariationsJson(service)
  const price = hasVariations ? 0 : Number(service.price ?? 0)

  return {
    id: service.id ?? '',
    name: service.name ?? '',
    categoryId: service.categoryId ?? '',
    category: categoryLabel ?? '',
    description: service.description ?? '',
    hasVariations: hasVariations ? 'true' : 'false',
    variations: variationsCell,
    price: Number.isFinite(price) ? String(price) : '0',
    visitingCharge: String(service.visitingCharge ?? 0),
    duration: String(service.duration ?? 0),
    status: service.status ?? 'Active',
    extraPoint: service.extraPoint ?? '',
    homeImage: service.homeImage ?? '',
    listImage: service.listImage ?? '',
    detailImage: service.detailImage ?? '',
    imageUrl: service.imageUrl ?? '',
    keyPoints: stringifyJsonArray(service.keyPoints),
    brands: stringifyJsonArray(service.brands),
    processSteps: stringifyJsonArray(service.processSteps),
    additionalServices: stringifyJsonArray(service.additionalServices),
    createdAt: timestampToCsv(service.createdAt),
    updatedAt: timestampToCsv(service.updatedAt),
  }
}

export function buildServiceExportRows(services, categoryMap) {
  return services.map((s) => serviceToCsvRow(s, categoryMap[s.categoryId] ?? ''))
}

/**
 * Export services with correct escaping for JSON-in-CSV cells.
 */
export function exportServicesCsv(filename, services, categoryMap) {
  const rows = buildServiceExportRows(services, categoryMap)
  const csv = Papa.unparse(rows, { columns: SERVICE_CSV_EXPORT_COLUMNS })
  downloadCsv(filename, csv)
}
