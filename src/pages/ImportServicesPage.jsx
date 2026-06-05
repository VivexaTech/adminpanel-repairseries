import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { Badge, Button, Card, PageHeader } from '../components/ui'
import { useApp } from '../context/useApp'
import {
  SERVICE_CSV_ALLOWED_FIELDS,
  normalizeCsvHeader,
  parseServiceCsvRow,
} from '../services/serviceCsvImport'

/** Minimum: id, name, and either categoryId or category. */
function validateFileHeaders(headers) {
  const missing = ['id', 'name'].filter((h) => !headers.includes(h))
  if (missing.length) {
    return `Missing required column(s): ${missing.join(', ')}`
  }
  if (!headers.includes('categoryId') && !headers.includes('category')) {
    return 'Missing required column: use categoryId or category (id or name).'
  }
  return null
}

export function ImportServicesPage() {
  const { services, categories, importServicesFromCsv, mutating, loading } = useApp()
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [rows, setRows] = useState([])
  const [lastRun, setLastRun] = useState(null)
  const [importProgress, setImportProgress] = useState(null)

  const existingIds = useMemo(() => new Set(services.map((s) => s.id)), [services])

  const preview = useMemo(() => {
    const next = []
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      const parsed = parseServiceCsvRow(row, categories)
      if (!parsed.ok) {
        next.push({
          rowIndex: i + 2,
          status: 'skipped',
          id: row?.id ?? '',
          reason: parsed.error,
          variationCount: 0,
        })
        continue
      }
      const status = existingIds.has(parsed.id) ? 'update' : 'create'
      next.push({
        rowIndex: i + 2,
        status,
        id: parsed.id,
        name: parsed.payload.name,
        variationCount: parsed.variationCount,
      })
    }
    return next
  }, [rows, categories, existingIds])

  const previewVariationTotal = useMemo(
    () => preview.reduce((sum, p) => sum + (p.variationCount || 0), 0),
    [preview],
  )

  const counts = useMemo(() => {
    let create = 0
    let update = 0
    let skipped = 0
    for (const p of preview) {
      if (p.status === 'create') create += 1
      else if (p.status === 'update') update += 1
      else skipped += 1
    }
    return { create, update, skipped }
  }, [preview])

  const onFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.csv$/i.test(file.name) && file.type && !String(file.type).includes('csv')) {
      toast.error('Please upload a .csv file.')
      return
    }
    setParseError('')
    setFileName(file.name)
    setLastRun(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: normalizeCsvHeader,
      complete: (results) => {
        if (results.errors?.length) {
          const msg = results.errors.map((e) => e.message).join('; ')
          setParseError(msg)
          setRows([])
          toast.error('Could not parse CSV.', { description: msg })
          return
        }
        const data = results.data.filter((r) => r && Object.values(r).some((v) => String(v ?? '').trim() !== ''))
        if (!data.length) {
          setRows([])
          setParseError('No data rows found.')
          toast.error('CSV has no data rows.')
          return
        }
        const headers = results.meta.fields?.map(normalizeCsvHeader) ?? []
        const headerErr = validateFileHeaders(headers)
        if (headerErr) {
          setRows([])
          setParseError(headerErr)
          toast.error('Invalid CSV headers.', { description: headerErr })
          return
        }
        setRows(data)
        toast.success('CSV loaded — review preview below.')
      },
      error: (err) => {
        setRows([])
        setParseError(err.message)
        toast.error('Failed to read file.')
      },
    })
  }

  const runImport = async () => {
    if (!rows.length) {
      toast.error('Upload a valid CSV first.')
      return
    }
    if (counts.create + counts.update === 0) {
      toast.error('Nothing valid to import — fix skipped rows first.')
      return
    }
    setImportProgress({ current: 0, total: rows.length })
    try {
      const result = await importServicesFromCsv(rows, {
        onProgress: (p) => setImportProgress(p),
      })
      setLastRun(result)
      setRows([])
      setFileName('')
      setParseError('')
    } catch (e) {
      toast.error(e?.message || 'Import failed.')
    } finally {
      setImportProgress(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Import Services"
        description="Bulk create or replace services. Only approved columns are read; extra columns are ignored. Same document id performs a full replace."
        actions={
          <Link
            to="/services"
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-lowest)] px-4 py-2.5 text-sm font-medium text-[var(--on-surface)] transition hover:bg-[var(--surface-low)]"
          >
            ← Back to Services
          </Link>
        }
      />

      {lastRun ? (
        <Card className="space-y-2">
          <p className="text-sm font-semibold text-[var(--on-surface)]">Last import</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">Imported: {lastRun.imported ?? 0}</Badge>
            <Badge tone="info">Updated: {lastRun.updated ?? 0}</Badge>
            <Badge tone="neutral">Variations: {lastRun.variationCount ?? 0}</Badge>
            <Badge tone={lastRun.failedRows ? 'warning' : 'neutral'}>
              Failed rows: {lastRun.failedRows ?? lastRun.skipped ?? 0}
            </Badge>
          </div>
          {(lastRun.errors?.length ?? 0) > 0 ? (
            <div className="max-h-40 overflow-auto rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-low)]/40 p-3 text-xs text-[var(--on-surface-variant)]">
              <p className="mb-2 font-medium text-[var(--on-surface)]">Validation / write errors</p>
              <ul className="space-y-1">
                {lastRun.errors.map((err, idx) => (
                  <li key={`${err.row}-${idx}`}>
                    Row {err.row}: {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--on-surface)]">
              <span className="flex items-center gap-2">
                <FileUp className="size-4" aria-hidden />
                Upload CSV
              </span>
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-2 block w-full max-w-md text-sm"
              disabled={Boolean(mutating.serviceCsvImport)}
              onChange={onFile}
            />
            {fileName ? <p className="mt-1 text-xs text-[var(--on-surface-variant)]">Selected: {fileName}</p> : null}
          </div>
          <Button
            onClick={runImport}
            disabled={
              Boolean(mutating.serviceCsvImport) ||
              !rows.length ||
              counts.create + counts.update === 0 ||
              loading.services
            }
          >
            {mutating.serviceCsvImport ? 'Importing…' : 'Import to Firestore'}
          </Button>
        </div>

        <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-low)]/30 p-4 text-sm text-[var(--on-surface-variant)]">
          <p className="font-medium text-[var(--on-surface)]">Approved columns only</p>
          <p className="mt-2">
            <span className="font-medium text-[var(--on-surface)]">Required:</span>{' '}
            <code className="text-xs">id</code>, <code className="text-xs">name</code>, and either{' '}
            <code className="text-xs">categoryId</code> or <code className="text-xs">category</code> (matches your
            categories collection).
          </p>
          <p className="mt-2">
            <span className="font-medium text-[var(--on-surface)]">Optional (safe defaults if empty):</span>{' '}
            <span className="break-words font-mono text-[11px] leading-relaxed">
              {SERVICE_CSV_ALLOWED_FIELDS.filter((f) => !['id', 'name', 'categoryId', 'category'].includes(f)).join(
                ', ',
              )}
            </span>
          </p>
          <p className="mt-2 text-xs">
            JSON arrays: <code>variations</code> (objects with <code>id</code>, <code>title</code>, <code>price</code>,{' '}
            <code>image</code>, <code>status</code>), <code>brands</code>, <code>processSteps</code>,{' '}
            <code>keyPoints</code>, <code>additionalServices</code> — invalid or empty JSON safely becomes{' '}
            <code>[]</code>. <code>processSteps</code> entries need a title and/or description; <code>image</code> is optional
            (<code>null</code> when missing). With <code>hasVariations=true</code>, parsed variations fully replace the stored array on
            each upsert (no merging).
          </p>
          <p className="mt-2 text-xs">
            <code>hasVariations</code> can be inferred from a non-empty <code>variations</code> column. Dates:{' '}
            <code>createdAt</code>, <code>updatedAt</code> as ISO strings or epoch ms.
          </p>
          <p className="mt-2 text-xs">
            Columns not in this list (e.g. title, tags, rating) are ignored so imports do not fail.
          </p>
        </div>

        {parseError ? (
          <p className="text-sm text-[var(--error)]" role="alert">
            {parseError}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{counts.create} new</Badge>
              <Badge tone="info">{counts.update} updated</Badge>
              <Badge tone="neutral">{previewVariationTotal} variations (preview)</Badge>
              <Badge tone={counts.skipped ? 'warning' : 'neutral'}>{counts.skipped} skipped (preview)</Badge>
            </div>
            <div className="max-h-[420px] overflow-auto rounded-2xl border border-[var(--outline-variant)]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-[var(--surface-lowest)]">
                  <tr className="border-b border-[var(--outline-variant)]">
                    <th className="p-3 font-semibold">Row</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Id</th>
                    <th className="p-3 font-semibold">Name / note</th>
                    <th className="p-3 font-semibold">Vars</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, idx) => (
                    <tr key={`preview-${p.rowIndex}-${idx}`} className="border-b border-[var(--outline-variant)]/60">
                      <td className="p-3 tabular-nums text-[var(--on-surface-variant)]">{p.rowIndex}</td>
                      <td className="p-3">
                        {p.status === 'create' ? (
                          <Badge tone="success">New</Badge>
                        ) : p.status === 'update' ? (
                          <Badge tone="info">Update</Badge>
                        ) : (
                          <Badge tone="warning">Skipped</Badge>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">{p.id || '—'}</td>
                      <td className="p-3 text-[var(--on-surface)]">
                        {p.status === 'skipped' ? (
                          <span className="text-[var(--error)]">{p.reason}</span>
                        ) : (
                          p.name
                        )}
                      </td>
                      <td className="p-3 tabular-nums text-[var(--on-surface-variant)]">
                        {p.variationCount != null ? p.variationCount : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
          {importProgress && importProgress.total > 0 ? (
            <div className="mt-3 space-y-1">
              <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-[var(--surface-high)]">
                <div
                  className="h-full bg-[var(--primary)] transition-all duration-150"
                  style={{
                    width: `${Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-xs text-[var(--on-surface-variant)]">
                Writing {importProgress.current} / {importProgress.total}…
              </p>
            </div>
          ) : null}
        </div>
        ) : (
          <p className="text-sm text-[var(--on-surface-variant)]">No CSV loaded yet.</p>
        )}
      </Card>
    </div>
  )
}
