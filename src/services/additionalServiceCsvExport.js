import Papa from 'papaparse'
import { downloadCsv } from '../utils/helpers'

export const ADDITIONAL_SERVICE_CSV_COLUMNS = ['id', 'title', 'price', 'categoryId']

/**
 * @param {object} row — doc with id, title, price, categoryId
 */
export function additionalServiceToCsvRow(row) {
  const price = Number(row?.price ?? 0)
  return {
    id: row?.id ?? '',
    title: String(row?.title ?? '').trim(),
    price: Number.isFinite(price) ? String(price) : '0',
    categoryId: String(row?.categoryId ?? '').trim(),
  }
}

export function buildAdditionalServiceExportRows(rows) {
  return rows.map((r) => additionalServiceToCsvRow(r))
}

export function exportAdditionalServicesCsv(filename, rows) {
  const data = buildAdditionalServiceExportRows(rows)
  const csv = Papa.unparse(data, { columns: ADDITIONAL_SERVICE_CSV_COLUMNS })
  downloadCsv(filename, csv)
}
