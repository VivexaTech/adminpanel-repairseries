import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select } from '../components/ui'
import { BANNER_SECTION_LABELS, BANNER_SECTIONS, normalizeBannerSection } from '../constants/catalog'
import { uploadToCloudinary } from '../services/cloudinary'
import { useApp } from '../context/useApp'

const emptyForm = () => ({
  id: '',
  title: '',
  section: 'home',
  mobileImage: '',
  websiteImage: '',
  image: '',
  redirectLink: '',
  displayOrder: 0,
  enabled: true,
  startAt: '',
  endAt: '',
})

const toDateTimeLocal = (ts) => {
  const d = ts?.toDate?.() ? ts.toDate() : ts instanceof Date ? ts : ts ? new Date(ts) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BannersPage() {
  const { banners, loading, mutating, upsertBanner, deleteBanner } = useApp()
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [uploading, setUploading] = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return (banners || [])
      .filter((b) => sectionFilter === 'all' || normalizeBannerSection(b.section) === sectionFilter)
      .filter((b) => {
        if (!q) return true
        const hay = [b.title, b.section, b.redirectLink, BANNER_SECTION_LABELS[b.section], b.id]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        const oa = Number(a.displayOrder ?? 0)
        const ob = Number(b.displayOrder ?? 0)
        if (oa !== ob) return oa - ob
        return String(a.title || '').localeCompare(String(b.title || ''))
      })
  }, [banners, search, sectionFilter])

  const reset = () => {
    setForm(emptyForm())
    setOpen(false)
    setUploading(false)
  }

  const uploadField = async (file, field) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadToCloudinary(file, {
        kind: 'banner',
        section: form.section,
        bannerId: form.id,
        slot: field,
      })
      setForm((c) => {
        const next = { ...c, [field]: url }
        if (!next.image && (field === 'mobileImage' || field === 'websiteImage')) next.image = url
        return next
      })
      toast.success('Image uploaded.')
    } catch (err) {
      toast.error(err?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    try {
      await upsertBanner(form)
      reset()
    } catch (err) {
      toast.error(err?.message || 'Could not save banner.')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Banner Management"
        description="Place banners on any app/website section — Home, Services, Bookings, Account, Cart, Search, Category, Service details, and home blocks (Categories, Popular, Coming Soon)."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search banners…" />
            <Select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className="min-w-[160px]">
              <option value="all">All sections</option>
              {BANNER_SECTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              className="gap-2"
              onClick={() => {
                setForm(emptyForm())
                setOpen(true)
              }}
            >
              <Plus className="size-4" /> Add banner
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden p-0">
        {loading.banners ? (
          <div className="flex items-center justify-center p-12 text-sm text-[var(--on-surface-variant)]">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-low)] text-[var(--on-surface-variant)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Preview</th>
                  <th className="px-4 py-3 font-medium">Section</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const img = row.mobileImage || row.websiteImage || row.image || ''
                  const enabled = row.enabled !== false && row.active !== false
                  return (
                    <tr key={row.id} className="border-t border-[var(--outline-variant)]/45">
                      <td className="px-4 py-3">
                        {img ? (
                          <img src={img} alt="" className="h-14 w-24 rounded-xl object-cover" />
                        ) : (
                          <div className="flex h-14 w-24 items-center justify-center rounded-xl bg-[var(--surface-low)] text-xs text-[var(--on-surface-variant)]">
                            No image
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--on-surface)]">
                        {BANNER_SECTION_LABELS[row.section] || row.section || '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface)]">{row.title || '—'}</td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)]">{Number(row.displayOrder ?? 0)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-xl border border-[var(--outline-variant)] p-2 hover:bg-[var(--surface-low)]"
                            onClick={() => {
                              setForm({
                                id: row.id,
                                title: row.title ?? '',
                                section: normalizeBannerSection(row.section || 'home'),
                                mobileImage: row.mobileImage || '',
                                websiteImage: row.websiteImage || '',
                                image: row.image || row.mobileImage || row.websiteImage || '',
                                redirectLink: row.redirectLink || '',
                                displayOrder: Number(row.displayOrder ?? 0),
                                enabled,
                                startAt: toDateTimeLocal(row.startAt),
                                endAt: toDateTimeLocal(row.endAt),
                              })
                              setOpen(true)
                            }}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--error)] hover:bg-[var(--surface-low)]"
                            disabled={Boolean(mutating.bannerDelete)}
                            onClick={async () => {
                              if (!window.confirm(`Delete banner for "${BANNER_SECTION_LABELS[row.section] || row.section}"?`)) return
                              try {
                                await deleteBanner(row.id)
                              } catch (err) {
                                toast.error(err?.message || 'Delete failed.')
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[var(--on-surface-variant)]">
                      No banners yet. Add banners for Home, Services, Bookings, Account, Categories, Coming Soon, and more.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} title={form.id ? 'Edit banner' : 'Add banner'} onClose={reset} className="max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Section">
            <Select value={form.section} onChange={(e) => setForm((c) => ({ ...c, section: e.target.value }))} required>
              {BANNER_SECTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title (optional)">
            <Input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="Summer offer" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display order">
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm((c) => ({ ...c, displayOrder: Number(e.target.value) || 0 }))}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.enabled ? 'true' : 'false'}
                onChange={(e) => setForm((c) => ({ ...c, enabled: e.target.value === 'true' }))}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </Select>
            </Field>
          </div>
          <Field label="Redirect link (optional)">
            <Input
              value={form.redirectLink}
              onChange={(e) => setForm((c) => ({ ...c, redirectLink: e.target.value }))}
              placeholder="/services or https://…"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start at (optional)">
              <Input
                type="datetime-local"
                value={form.startAt || ''}
                onChange={(e) => setForm((c) => ({ ...c, startAt: e.target.value }))}
              />
            </Field>
            <Field label="End at (optional)">
              <Input
                type="datetime-local"
                value={form.endAt || ''}
                onChange={(e) => setForm((c) => ({ ...c, endAt: e.target.value }))}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-dashed border-[var(--outline-variant)] p-4">
              <div className="text-sm font-medium text-[var(--on-surface)]">Mobile image</div>
              <input
                className="mt-3 w-full text-sm"
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  void uploadField(file, 'mobileImage')
                }}
              />
              {form.mobileImage ? (
                <img src={form.mobileImage} alt="" className="mt-3 h-28 w-full rounded-xl object-cover" />
              ) : null}
            </div>
            <div className="rounded-2xl border border-dashed border-[var(--outline-variant)] p-4">
              <div className="text-sm font-medium text-[var(--on-surface)]">Website image</div>
              <input
                className="mt-3 w-full text-sm"
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  void uploadField(file, 'websiteImage')
                }}
              />
              {form.websiteImage ? (
                <img src={form.websiteImage} alt="" className="mt-3 h-28 w-full rounded-xl object-cover" />
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || Boolean(mutating.banner)}>
              {uploading || mutating.banner ? 'Saving…' : 'Save banner'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
