import Papa from 'papaparse'
import { downloadCsv } from '../utils/helpers'

export const exportRows = (filename, rows) => {
  const csv = Papa.unparse(rows)
  downloadCsv(filename, csv)
}
