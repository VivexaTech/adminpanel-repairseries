import { useMemo, useState } from 'react'
import { Download, FileUp, Pencil, Plus, Trash2 } from 'lucide-react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
} from '../components/ui'
import { useApp } from '../context/useApp'
import { parseAdditionalServiceCsvRow, normalizeCsvHeader } from '../services/additionalServiceCsvImport'
import { exportAdditionalServicesCsv } from '../services/additionalServiceCsvExport'
import { currency } from '../utils/helpers'

const emptyForm = () => ({ id: '', title: '', price: '', categoryId: '' })

function validateCsvHeaders(headers) {
  const missing = ['title', 'price'].filter((h) => !headers.includes(h))
  if (missing.length) return `Missing required column(s): ${missing.join(', ')}`
  if (!headers.includes('categoryId') && !headers.includes('category')) {
    return 'Missing categoryId or category (name).'
  }
  return null
}

export function AdditionalServicesPage() {
  const {
    additionalServices,
    categories,
    upsertAdditionalService,
    deleteAdditionalService,
    importAdditionalServicesFromCsv,
    loading,
    mutating,
  } = useApp()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [modalOpen, setModalOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [csvRows, setCsvRows] = useState([])
  const [importProgress, setImportProgress] = useState(null)
  const [lastImport, setLastImport] = useState(null)

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return additionalServices
      .filter((row) => {
        if (categoryFilter && String(row.categoryId || '') !== categoryFilter) return false
        if (!q) return true
        const cat = categoryMap[row.categoryId] || ''
        return [row.title, cat, String(row.price)].join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
  }, [additionalServices, search, categoryFilter, categoryMap])

  const existingIds = useMemo(() => new Set(additionalServices.map((s) => s.id)), [additionalServices])

  const preview = useMemo(() => {
    const out = []
    for (let i = 0; i < csvRows.length; i += 1) {
      const parsed = parseAdditionalServiceCsvRow(csvRows[i], categories)
      if (!parsed.ok) {
        out.push({ rowIndex: i + 2, status: 'skipped', reason: parsed.error })
        continue
      }
      const st =
        parsed.id && existingIds.has(parsed.id) ? 'update' : parsed.id ? 'create' : 'create'
      out.push({
        rowIndex: i + 2,
        status: st,
        id: parsed.id || '(auto id)',
        title: parsed.payload.title,
      })
    }
    return out
  }, [csvRows, categories, existingIds])

  const previewCounts = useMemo(() => {
    let c = 0
    let u = 0
    let s = 0
    for (const p of preview) {
      if (p.status === 'skipped') s += 1
      else if (p.status === 'update') u += 1
      else c += 1
    }
    return { c, u, s }
  }, [preview])

  const openCreate = () => {
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setForm({
      id: row.id,
      title: row.title ?? '',
      price: String(row.price ?? ''),
      categoryId: row.categoryId ?? '',
    })
    setModalOpen(true)
  }

  const save = async () => {
    try {
      await upsertAdditionalService(
        {
          id: form.id,
          title: form.title,
          price: form.price,
          categoryId: form.categoryId,
        },
        { successToast: form.id ? 'Saved.' : 'Created.' },
      )
      setModalOpen(false)
      setForm(emptyForm())
    } catch (e) {
      toast.error(e?.message || 'Could not save.')
    }
  }

  const remove = async (id, title) => {
    if (!window.confirm(`Delete “${title}”?`)) return
    try {
      await deleteAdditionalService(id)
    } catch (e) {
      toast.error(e?.message || 'Delete failed.')
    }
  }

  const onCsvFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.csv$/i.test(file.name) && file.type && !String(file.type).includes('csv')) {
      toast.error('Please upload a .csv file.')
      return
    }
    setParseError('')
    setFileName(file.name)
    setLastImport(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: normalizeCsvHeader,
      complete: (results) => {
        if (results.errors?.length) {
          const msg = results.errors.map((e) => e.message).join('; ')
          setParseError(msg)
          setCsvRows([])
          toast.error('Could not parse CSV.', { description: msg })
          return
        }
        const data = results.data.filter((r) => r && Object.values(r).some((v) => String(v ?? '').trim() !== ''))
        if (!data.length) {
          setCsvRows([])
          setParseError('No data rows found.')
          toast.error('CSV has no data rows.')
          return
        }
        const headers = results.meta.fields?.map(normalizeCsvHeader) ?? []
        const err = validateCsvHeaders(headers)
        if (err) {
          setCsvRows([])
          setParseError(err)
          toast.error('Invalid CSV headers.', { description: err })
          return
        }
        setCsvRows(data)
        toast.success('CSV loaded — review preview below.')
      },
      error: (err) => {
        setCsvRows([])
        setParseError(err.message)
        toast.error('Failed to read file.')
      },
    })
  }

  const runImport = async () => {
    if (!csvRows.length) {
      toast.error('Upload a valid CSV first.')
      return
    }
    if (previewCounts.c + previewCounts.u === 0) {
      toast.error('Nothing valid to import.')
      return
    }
    setImportProgress({ current: 0, total: csvRows.length })
    try {
      const result = await importAdditionalServicesFromCsv(csvRows, {
        onProgress: (p) => setImportProgress(p),
      })
      setLastImport(result)
      setCsvRows([])
      setFileName('')
      setParseError('')
    } catch (e) {
      toast.error(e?.message || 'Import failed.')
    } finally {
      setImportProgress(null)
    }
  }

  const busy = loading.additionalServices
  const listLoading = busy && additionalServices.length === 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Additional Services"
        description="Technician-only add-ons (spare parts, extra charges). Not shown in the customer app. Match categoryId to main service categories."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              disabled={!additionalServices.length}
              onClick={() =>
                exportAdditionalServicesCsv(
                  `additional-services-${new Date().toISOString().slice(0, 10)}.csv`,
                  additionalServices,
                )
              }
            >
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button type="button" className="gap-2" onClick={openCreate}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        }
      />

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-[var(--on-surface)]">Import CSV</p>
        <p className="text-xs text-[var(--on-surface-variant)]">
          Columns: id (optional), title, price, categoryId — or category name. Existing id is replaced; blank id creates
          a new document.
        </p>
        <input
          className="block w-full max-w-md text-sm"
          type="file"
          accept=".csv,text/csv"
          disabled={Boolean(mutating.additionalServiceCsvImport)}
          onChange={onCsvFile}
        />
        {fileName ? (
          <p className="text-xs text-[var(--on-surface-variant)]">Selected: {fileName}</p>
        ) : null}
        {parseError ? <p className="text-sm text-[var(--error)]">{parseError}</p> : null}

        {lastImport ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">New: {lastImport.imported ?? 0}</Badge>
            <Badge tone="info">Updated: {lastImport.updated ?? 0}</Badge>
            <Badge tone={lastImport.failedRows ? 'warning' : 'neutral'}>
              Skipped: {lastImport.failedRows ?? 0}
            </Badge>
          </div>
        ) : null}

        {csvRows.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>
                Preview: {previewCounts.c} new, {previewCounts.u} update, {previewCounts.s} skipped
              </span>
              {importProgress ? (
                <span className="text-[var(--on-surface-variant)]">
                  Working… {importProgress.current}/{importProgress.total}
                </span>
              ) : null}
            </div>
            <div className="max-h-48 overflow-auto rounded-2xl border border-[var(--outline-variant)] text-xs">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-[var(--surface-low)]">
                  <tr>
                    <th className="p-2 font-medium">Row</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">id</th>
                    <th className="p-2 font-medium">title / note</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 25).map((p) => (
                    <tr key={p.rowIndex} className="border-t border-[var(--outline-variant)]/50">
                      <td className="p-2">{p.rowIndex}</td>
                      <td className="p-2">{p.status}</td>
                      <td className="p-2">{p.id ?? '—'}</td>
                      <td className="p-2">{p.title ?? p.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 25 ? (
              <p className="text-xs text-[var(--on-surface-variant)]">Showing first 25 preview rows.</p>
            ) : null}
            <Button
              type="button"
              className="gap-2"
              disabled={Boolean(mutating.additionalServiceCsvImport)}
              onClick={runImport}
            >
              <FileUp className="size-4" />
              Run import
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <SearchInput
            value={search}
            onChange={(v) => setSearch(v)}
            placeholder="Search title, category, price…"
          />
        </div>
        <div className="w-full md:w-56">
          <Field label="Category">
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              disabled={listLoading || !categories.length}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {listLoading ? (
          <div className="flex items-center justify-center p-12 text-sm text-[var(--on-surface-variant)]">
            Loading additional services…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-low)] text-[var(--on-surface-variant)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--outline-variant)]/45">
                    <td className="px-4 py-3 font-medium text-[var(--on-surface)]">{row.title}</td>
                    <td className="px-4 py-3">{categoryMap[row.categoryId] || row.categoryId || '—'}</td>
                    <td className="px-4 py-3">{currency(row.price)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--on-surface-variant)] hover:bg-[var(--surface-low)]"
                          onClick={() => openEdit(row)}
                          disabled={mutating.additionalService || mutating.additionalServiceDelete}
                          aria-label="Edit"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--error)] hover:bg-[var(--surface-low)]"
                          onClick={() => remove(row.id, row.title)}
                          disabled={mutating.additionalServiceDelete}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--on-surface-variant)]">
                      No additional services yet. Add one or import CSV.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setForm(emptyForm())
        }}
        title={form.id ? 'Edit additional service' : 'New additional service'}
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Fan motor"
            />
          </Field>
          <Field label="Price (INR)">
            <Input
              type="number"
              min={0}
              step={1}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
          </Field>
          <Field label="Category">
            <Select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false)
                setForm(emptyForm())
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={mutating.additionalService} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
