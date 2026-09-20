import { useMemo, useState } from 'react'
import { ArrowRightCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea } from '../components/ui'
import {
  COMING_SOON_CATEGORIES,
  COMING_SOON_CATEGORY_LABELS,
  normalizeComingSoonCategory,
} from '../constants/catalog'
import { uploadToCloudinary } from '../services/cloudinary'
import { useApp } from '../context/useApp'
import { formatDateTime } from '../utils/helpers'

const emptyForm = () => ({
  id: '',
  name: '',
  description: '',
  imageUrl: '',
  comingSoonCategory: 'main',
  displayOrder: 0,
  previewStatus: 'Active',
})

export function ComingSoonServicesPage() {
  const {
    services,
    upsertComingSoonService,
    convertComingSoonToActive,
    deleteComingSoonService,
    loading,
    mutating,
  } = useApp()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [form, setForm] = useState(emptyForm)
  const [modalOpen, setModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  const comingSoon = useMemo(() => {
    const q = search.toLowerCase().trim()
    return (services || [])
      .filter((s) => String(s.status || '') === 'Coming Soon')
      .filter((s) => {
        if (categoryFilter === 'all') return true
        return normalizeComingSoonCategory(s.comingSoonCategory) === categoryFilter
      })
      .filter((s) => !q || [s.name, s.description, s.comingSoonCategory].join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        const oa = Number(a.displayOrder ?? 999)
        const ob = Number(b.displayOrder ?? 999)
        if (oa !== ob) return oa - ob
        return String(a.name || '').localeCompare(String(b.name || ''))
      })
  }, [services, search, categoryFilter])

  const openCreate = () => {
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setForm({
      id: row.id,
      name: row.name ?? '',
      description: row.description ?? '',
      imageUrl: row.imageUrl || row.homeImage || '',
      comingSoonCategory: normalizeComingSoonCategory(row.comingSoonCategory),
      displayOrder: Number(row.displayOrder ?? 0),
      previewStatus: String(row.previewStatus || 'Active') === 'Inactive' ? 'Inactive' : 'Active',
    })
    setModalOpen(true)
  }

  const onImagePick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadToCloudinary(file, {
        kind: 'coming-soon',
        serviceName: form.name,
        serviceId: form.id,
        slot: 'preview',
      })
      setForm((f) => ({ ...f, imageUrl: url }))
      toast.success('Image uploaded.')
    } catch (err) {
      toast.error(err?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    try {
      await upsertComingSoonService(form, { successToast: form.id ? 'Saved.' : 'Created.' })
      setModalOpen(false)
      setForm(emptyForm())
    } catch (e) {
      toast.error(e?.message || 'Could not save.')
    }
  }

  const convert = async (row) => {
    if (
      !window.confirm(
        `Convert "${row.name}" to a regular service? It will appear in Services as Inactive for you to complete pricing and activate.`,
      )
    ) {
      return
    }
    try {
      await convertComingSoonToActive(row.id)
    } catch (e) {
      toast.error(e?.message || 'Convert failed.')
    }
  }

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return
    try {
      await deleteComingSoonService(row.id)
    } catch (e) {
      toast.error(e?.message || 'Delete failed.')
    }
  }

  const listLoading = loading.services

  return (
    <div className="space-y-4">
      <PageHeader
        title="Coming Soon Management"
        description="Showcase upcoming Main and Commercial services on the website and user app. Publish, hide, reorder, or convert when ready."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search…" />
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="min-w-[160px]">
              <option value="all">All categories</option>
              {COMING_SOON_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Button type="button" className="gap-2" onClick={openCreate}>
              <Plus className="size-4" /> Add
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden p-0">
        {listLoading ? (
          <div className="flex items-center justify-center p-12 text-sm text-[var(--on-surface-variant)]">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-low)] text-[var(--on-surface-variant)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {comingSoon.map((row) => {
                  const img = row.imageUrl || row.homeImage || ''
                  const preview = String(row.previewStatus || 'Active') === 'Inactive' ? 'Inactive' : 'Active'
                  const cat = normalizeComingSoonCategory(row.comingSoonCategory)
                  return (
                    <tr key={row.id} className="border-t border-[var(--outline-variant)]/45">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {img ? (
                            <img src={img} alt="" className="size-12 rounded-xl object-cover" />
                          ) : (
                            <div className="size-12 rounded-xl bg-[var(--surface-low)]" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-[var(--on-surface)]">{row.name}</div>
                            {row.description ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-[var(--on-surface-variant)]">
                                {row.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={cat === 'commercial' ? 'warning' : 'neutral'}>
                          {COMING_SOON_CATEGORY_LABELS[cat] || 'Main'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)]">{Number(row.displayOrder ?? 0)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={preview === 'Active' ? 'success' : 'neutral'}>
                          {preview === 'Active' ? 'Published' : 'Hidden'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)]">{formatDateTime(row.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            title="Convert to Active Service"
                            className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--primary)] hover:bg-[var(--surface-low)]"
                            onClick={() => convert(row)}
                            disabled={Boolean(mutating.comingSoonConvert)}
                          >
                            <ArrowRightCircle className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-[var(--outline-variant)] p-2 hover:bg-[var(--surface-low)]"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--error)] hover:bg-[var(--surface-low)]"
                            onClick={() => remove(row)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!comingSoon.length ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--on-surface-variant)]">
                      No coming soon services yet.
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
        title={form.id ? 'Edit coming soon service' : 'New coming soon service'}
        className="max-w-xl"
      >
        <div className="space-y-4">
          <Field label="Service name">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Smart TV Repair"
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short teaser shown on app and website"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={form.comingSoonCategory}
                onChange={(e) => setForm((f) => ({ ...f, comingSoonCategory: e.target.value }))}
              >
                {COMING_SOON_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Display order">
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) || 0 }))}
              />
            </Field>
          </div>
          <Field label="Service image">
            <input type="file" accept="image/*" onChange={onImagePick} disabled={uploading} />
            {form.imageUrl ? (
              <img src={form.imageUrl} alt="" className="mt-2 h-24 w-24 rounded-xl object-cover" />
            ) : null}
          </Field>
          <Field label="Publish status">
            <Select
              value={form.previewStatus}
              onChange={(e) => setForm((f) => ({ ...f, previewStatus: e.target.value }))}
            >
              <option value="Active">Published (visible)</option>
              <option value="Inactive">Hidden</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={uploading || mutating.comingSoonService}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
