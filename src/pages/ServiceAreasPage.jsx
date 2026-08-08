import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select } from '../components/ui'
import { useApp } from '../context/useApp'

const emptyForm = {
  id: '',
  name: '',
  slug: '',
  active: true,
  pincodePrefixesText: '',
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function ServiceAreasPage() {
  const { platformSettings, loading, mutating, updateServiceAreas } = useApp()
  const [areas, setAreas] = useState([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editIndex, setEditIndex] = useState(-1)

  useEffect(() => {
    const list = Array.isArray(platformSettings?.serviceAreas) ? platformSettings.serviceAreas : []
    setAreas(
      list.map((row, index) => ({
        id: String(row?.id || row?.slug || `area-${index + 1}`),
        name: String(row?.name || ''),
        slug: String(row?.slug || ''),
        active: row?.active !== false,
        pincodePrefixes: Array.isArray(row?.pincodePrefixes) ? row.pincodePrefixes : [],
      })),
    )
  }, [platformSettings?.serviceAreas, platformSettings?.updatedAt])

  const persist = async (next) => {
    try {
      const saved = await updateServiceAreas(next)
      setAreas(saved)
    } catch (err) {
      toast.error(err?.message || 'Could not save service areas.')
      throw err
    }
  }

  const resetModal = () => {
    setForm(emptyForm)
    setEditIndex(-1)
    setOpen(false)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const name = String(form.name || '').trim()
    if (!name) {
      toast.error('City / area name is required.')
      return
    }
    const slug = slugify(form.slug || name)
    if (!slug) {
      toast.error('Slug is required.')
      return
    }
    const pincodePrefixes = String(form.pincodePrefixesText || '')
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter(Boolean)
    const row = {
      id: form.id || slug,
      name,
      slug,
      active: Boolean(form.active),
      pincodePrefixes,
    }
    const next = [...areas]
    if (editIndex >= 0) next[editIndex] = row
    else {
      if (next.some((a) => a.slug === slug)) {
        toast.error('A service area with this slug already exists.')
        return
      }
      next.push(row)
    }
    try {
      await persist(next)
      resetModal()
    } catch {
      /* toasted */
    }
  }

  const toggleActive = async (index) => {
    const next = areas.map((row, i) => (i === index ? { ...row, active: !row.active } : row))
    try {
      await persist(next)
    } catch {
      /* toasted */
    }
  }

  const removeArea = async (index) => {
    const target = areas[index]
    if (!window.confirm(`Remove service area “${target?.name || target?.slug}”?`)) return
    const next = areas.filter((_, i) => i !== index)
    try {
      await persist(next)
    } catch {
      /* toasted */
    }
  }

  const busy = Boolean(mutating.serviceAreas)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Service areas"
        description="Cities / areas stored on settings/general.serviceAreas for app geo gating. Add, edit, or toggle active."
        actions={<Button onClick={() => setOpen(true)}>Add city</Button>}
      />

      {loading.platformSettings ? (
        <Card>
          <p className="text-sm text-[var(--on-surface-variant)]">Loading service areas…</p>
        </Card>
      ) : null}

      {!loading.platformSettings && !areas.length ? (
        <Card>
          <p className="text-sm text-[var(--on-surface-variant)]">No service areas yet. Add your first city.</p>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {areas.map((area, index) => (
          <Card key={area.id || area.slug}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-[var(--on-surface)]">{area.name}</p>
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">slug: {area.slug}</p>
                <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
                  Pincode prefixes:{' '}
                  {(area.pincodePrefixes || []).length ? area.pincodePrefixes.join(', ') : '—'}
                </p>
              </div>
              <Badge tone={area.active ? 'success' : 'warning'}>{area.active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setEditIndex(index)
                  setForm({
                    id: area.id,
                    name: area.name,
                    slug: area.slug,
                    active: area.active,
                    pincodePrefixesText: (area.pincodePrefixes || []).join(', '),
                  })
                  setOpen(true)
                }}
              >
                Edit
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void toggleActive(index)}>
                {area.active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => void removeArea(index)}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        title={editIndex >= 0 ? 'Edit service area' : 'Add service area'}
        onClose={resetModal}
        className="max-w-lg"
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value
                setForm((cur) => ({
                  ...cur,
                  name,
                  slug: cur.slug && editIndex >= 0 ? cur.slug : slugify(name),
                }))
              }}
              placeholder="e.g. Aligarh"
              required
            />
          </Field>
          <Field label="Slug">
            <Input
              value={form.slug}
              onChange={(e) => setForm((cur) => ({ ...cur, slug: slugify(e.target.value) }))}
              placeholder="aligarh"
              required
            />
          </Field>
          <Field label="Pincode prefixes (optional, comma-separated)">
            <Input
              value={form.pincodePrefixesText}
              onChange={(e) => setForm((cur) => ({ ...cur, pincodePrefixesText: e.target.value }))}
              placeholder="e.g. 202, 203"
            />
          </Field>
          <Field label="Active">
            <Select
              value={form.active ? 'true' : 'false'}
              onChange={(e) => setForm((cur) => ({ ...cur, active: e.target.value === 'true' }))}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={resetModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
