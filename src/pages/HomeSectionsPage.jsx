import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, LayoutGrid, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
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
  Textarea,
} from '../components/ui'
import {
  HOME_SECTION_CONTENT_LABELS,
  HOME_SECTION_CONTENT_TYPES,
  HOME_SECTION_LAYOUT_LABELS,
  HOME_SECTION_LAYOUTS,
  HOME_SECTION_SELECTION_MODES,
  buildDefaultHomeSections,
  emptyHomeSectionForm,
} from '../constants/homeSections'
import { uploadToCloudinary } from '../services/cloudinary'
import { useApp } from '../context/useApp'

function selectionModesFor(contentType) {
  if (contentType === 'static') return []
  if (contentType === 'categories') {
    return HOME_SECTION_SELECTION_MODES.filter((m) =>
      ['manual', 'all'].includes(m.value),
    )
  }
  return HOME_SECTION_SELECTION_MODES
}

export function HomeSectionsPage() {
  const {
    homeSections,
    services,
    categories,
    loading,
    mutating,
    upsertHomeSection,
    deleteHomeSection,
    seedDefaultHomeSections,
  } = useApp()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyHomeSectionForm)
  const [uploading, setUploading] = useState(false)
  const [itemFilter, setItemFilter] = useState('')

  const sorted = useMemo(() => {
    const q = search.toLowerCase().trim()
    return (homeSections || [])
      .filter((row) => {
        if (!q) return true
        const hay = [row.title, row.subtitle, row.layout, row.contentType, row.selectionMode]
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
  }, [homeSections, search])

  const selectableItems = useMemo(() => {
    const q = itemFilter.toLowerCase().trim()
    if (form.contentType === 'categories') {
      return (categories || [])
        .filter((c) => c.active !== false && c.isActive !== false)
        .filter((c) => !q || String(c.name || '').toLowerCase().includes(q))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    }
    if (form.contentType === 'services') {
      const mode = form.selectionMode
      return (services || [])
        .filter((s) => {
          const status = String(s.status || 'Active')
          if (mode === 'coming_soon' || mode === 'coming_soon_main' || mode === 'coming_soon_commercial') {
            return status === 'Coming Soon'
          }
          return status === 'Active'
        })
        .filter((s) => !q || String(s.name || '').toLowerCase().includes(q))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    }
    return []
  }, [categories, services, form.contentType, form.selectionMode, itemFilter])

  const reset = () => {
    setForm(emptyHomeSectionForm())
    setItemFilter('')
    setOpen(false)
    setUploading(false)
  }

  const openCreate = () => {
    const nextOrder =
      (homeSections || []).reduce((max, row) => Math.max(max, Number(row.displayOrder) || 0), 0) + 10
    setForm({ ...emptyHomeSectionForm(), displayOrder: nextOrder })
    setItemFilter('')
    setOpen(true)
  }

  const toggleItem = (id) => {
    setForm((c) => {
      const set = new Set(c.itemIds || [])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...c, itemIds: [...set] }
    })
  }

  const moveOrder = async (row, direction) => {
    const list = [...sorted]
    const idx = list.findIndex((x) => x.id === row.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return
    const a = list[idx]
    const b = list[swapIdx]
    try {
      await upsertHomeSection({
        ...a,
        displayOrder: Number(b.displayOrder ?? 0),
      })
      await upsertHomeSection({
        ...b,
        displayOrder: Number(a.displayOrder ?? 0),
      })
    } catch (err) {
      toast.error(err?.message || 'Could not reorder.')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    try {
      await upsertHomeSection(form)
      reset()
    } catch (err) {
      toast.error(err?.message || 'Could not save section.')
    }
  }

  const seedDefaults = async () => {
    if ((homeSections || []).length > 0) {
      const ok = window.confirm(
        'This adds the default home layout sections. Existing sections are kept. Continue?',
      )
      if (!ok) return
    }
    try {
      await seedDefaultHomeSections(buildDefaultHomeSections())
    } catch (err) {
      toast.error(err?.message || 'Could not seed defaults.')
    }
  }

  const modes = selectionModesFor(form.contentType)
  const isStatic = form.layout === 'static' || form.contentType === 'static'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Home Sections"
        description="Build the user app and website home layout without code — slider, list, grid, or static blocks. Pick services/categories, set columns & rows, and control platform visibility."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search sections…" />
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              disabled={Boolean(mutating.homeSectionSeed)}
              onClick={seedDefaults}
            >
              <Sparkles className="size-4" /> Load defaults
            </Button>
            <Button type="button" className="gap-2" onClick={openCreate}>
              <Plus className="size-4" /> Add section
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden p-0">
        {loading.homeSections ? (
          <div className="flex items-center justify-center p-12 text-sm text-[var(--on-surface-variant)]">
            Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-low)] text-[var(--on-surface-variant)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Section</th>
                  <th className="px-4 py-3 font-medium">Layout</th>
                  <th className="px-4 py-3 font-medium">Content</th>
                  <th className="px-4 py-3 font-medium">Grid</th>
                  <th className="px-4 py-3 font-medium">Platforms</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const enabled = row.enabled !== false
                  return (
                    <tr key={row.id} className="border-t border-[var(--outline-variant)]/45">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="w-8 font-semibold text-[var(--on-surface)]">
                            {Number(row.displayOrder ?? 0)}
                          </span>
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--outline-variant)] p-1.5 disabled:opacity-40"
                            disabled={idx === 0}
                            onClick={() => moveOrder(row, 'up')}
                            aria-label="Move up"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--outline-variant)] p-1.5 disabled:opacity-40"
                            disabled={idx === sorted.length - 1}
                            onClick={() => moveOrder(row, 'down')}
                            aria-label="Move down"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--on-surface)]">{row.title || '—'}</p>
                        {row.subtitle ? (
                          <p className="mt-0.5 text-xs text-[var(--on-surface-variant)]">{row.subtitle}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface)]">
                        {HOME_SECTION_LAYOUT_LABELS[row.layout] || row.layout}
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)]">
                        {HOME_SECTION_CONTENT_LABELS[row.contentType] || row.contentType}
                        {row.selectionMode && row.contentType !== 'static' ? (
                          <span className="mt-0.5 block text-xs">· {row.selectionMode}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)]">
                        {row.layout === 'grid'
                          ? `${Number(row.columns || 1)}×${Number(row.rows || 0) || '∞'}`
                          : row.maxItems
                            ? `max ${row.maxItems}`
                            : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.showOnApp !== false ? <Badge tone="neutral">App</Badge> : null}
                          {(row.showOnMobileWeb !== undefined
                            ? row.showOnMobileWeb !== false
                            : row.showOnWebsite !== false) ? (
                            <Badge tone="neutral">Mobile Web</Badge>
                          ) : null}
                          {(row.showOnDesktopWeb !== undefined
                            ? row.showOnDesktopWeb !== false
                            : row.showOnWebsite !== false) ? (
                            <Badge tone="neutral">Desktop Web</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={enabled ? 'success' : 'neutral'}>
                          {enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-xl border border-[var(--outline-variant)] p-2 hover:bg-[var(--surface-low)]"
                            onClick={() => {
                              setForm({
                                ...emptyHomeSectionForm(),
                                id: row.id,
                                title: row.title ?? '',
                                subtitle: row.subtitle ?? '',
                                layout: row.layout || 'grid',
                                contentType: row.contentType || 'categories',
                                selectionMode: row.selectionMode || 'all',
                                itemIds: Array.isArray(row.itemIds) ? row.itemIds : [],
                                columns: Number(row.columns ?? 4),
                                rows: Number(row.rows ?? 0),
                                maxItems: Number(row.maxItems ?? 0),
                                enabled: row.enabled !== false,
                                showOnApp: row.showOnApp !== false,
                                showOnWebsite: row.showOnWebsite !== false,
                                showOnMobileWeb:
                                  row.showOnMobileWeb !== undefined
                                    ? row.showOnMobileWeb !== false
                                    : row.showOnWebsite !== false,
                                showOnDesktopWeb:
                                  row.showOnDesktopWeb !== undefined
                                    ? row.showOnDesktopWeb !== false
                                    : row.showOnWebsite !== false,
                                displayOrder: Number(row.displayOrder ?? 0),
                                showViewAll: Boolean(row.showViewAll),
                                viewAllPath: row.viewAllPath || '',
                                staticBody: row.staticBody || '',
                                staticImage: row.staticImage || '',
                                staticCtaLabel: row.staticCtaLabel || '',
                                staticCtaLink: row.staticCtaLink || '',
                              })
                              setItemFilter('')
                              setOpen(true)
                            }}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--error)] hover:bg-[var(--surface-low)]"
                            disabled={Boolean(mutating.homeSectionDelete)}
                            onClick={async () => {
                              if (!window.confirm(`Delete section "${row.title}"?`)) return
                              try {
                                await deleteHomeSection(row.id)
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
                {!sorted.length ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[var(--on-surface-variant)]">
                      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                        <LayoutGrid className="size-8 text-[var(--primary)]" />
                        <p>
                          No home sections yet. Clients keep the built-in home layout until you add
                          sections here. Use <strong>Load defaults</strong> to mirror the current
                          home, then customize.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        title={form.id ? 'Edit home section' : 'Add home section'}
        onClose={reset}
        className="max-w-3xl"
      >
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Section title">
              <Input
                value={form.title}
                onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
                placeholder="Browse Categories"
                required
              />
            </Field>
            <Field label="Display order">
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(e) =>
                  setForm((c) => ({ ...c, displayOrder: Number(e.target.value) || 0 }))
                }
              />
            </Field>
          </div>
          <Field label="Subtitle (optional)">
            <Input
              value={form.subtitle}
              onChange={(e) => setForm((c) => ({ ...c, subtitle: e.target.value }))}
              placeholder="Short supporting line"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Layout type">
              <Select
                value={form.layout}
                onChange={(e) => {
                  const layout = e.target.value
                  setForm((c) => ({
                    ...c,
                    layout,
                    contentType: layout === 'static' ? 'static' : c.contentType === 'static' ? 'categories' : c.contentType,
                  }))
                }}
              >
                {HOME_SECTION_LAYOUTS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Content">
              <Select
                value={isStatic ? 'static' : form.contentType}
                disabled={form.layout === 'static'}
                onChange={(e) => {
                  const contentType = e.target.value
                  setForm((c) => ({
                    ...c,
                    contentType,
                    selectionMode:
                      contentType === 'categories' &&
                      !['manual', 'all'].includes(c.selectionMode)
                        ? 'all'
                        : c.selectionMode,
                    itemIds: [],
                  }))
                }}
              >
                {HOME_SECTION_CONTENT_TYPES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {!isStatic ? (
            <>
              <Field label="What to show">
                <Select
                  value={form.selectionMode}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, selectionMode: e.target.value, itemIds: [] }))
                  }
                >
                  {modes.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {form.selectionMode === 'manual' ? (
                <Field label={`Select ${form.contentType}`}>
                  <Input
                    value={itemFilter}
                    onChange={(e) => setItemFilter(e.target.value)}
                    placeholder="Filter by name…"
                    className="mb-2"
                  />
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-[var(--outline-variant)]/60 p-2">
                    {selectableItems.map((item) => {
                      const checked = (form.itemIds || []).includes(item.id)
                      return (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--surface-low)]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(item.id)}
                          />
                          <span className="text-sm">{item.name || item.title || item.id}</span>
                        </label>
                      )
                    })}
                    {!selectableItems.length ? (
                      <p className="px-2 py-3 text-sm text-[var(--on-surface-variant)]">No items found.</p>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                    {(form.itemIds || []).length} selected
                  </p>
                </Field>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Columns">
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    value={form.columns}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        columns: Math.min(4, Math.max(1, Number(e.target.value) || 1)),
                      }))
                    }
                    disabled={form.layout !== 'grid'}
                  />
                </Field>
                <Field label="Rows (0 = unlimited)">
                  <Input
                    type="number"
                    min={0}
                    value={form.rows}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, rows: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    disabled={form.layout !== 'grid'}
                  />
                </Field>
                <Field label="Max items (0 = auto)">
                  <Input
                    type="number"
                    min={0}
                    value={form.maxItems}
                    onChange={(e) =>
                      setForm((c) => ({
                        ...c,
                        maxItems: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Body text">
                <Textarea
                  value={form.staticBody}
                  onChange={(e) => setForm((c) => ({ ...c, staticBody: e.target.value }))}
                  rows={4}
                  placeholder="Trust message, offer copy, or info…"
                />
              </Field>
              <Field label="Image (optional)">
                <div className="flex flex-wrap items-center gap-3">
                  {form.staticImage ? (
                    <img
                      src={form.staticImage}
                      alt=""
                      className="h-16 w-28 rounded-xl object-cover"
                    />
                  ) : null}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setUploading(true)
                      try {
                        const url = await uploadToCloudinary(file)
                        setForm((c) => ({ ...c, staticImage: url }))
                        toast.success('Image uploaded.')
                      } catch (err) {
                        toast.error(err?.message || 'Upload failed.')
                      } finally {
                        setUploading(false)
                      }
                    }}
                  />
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="CTA label (optional)">
                  <Input
                    value={form.staticCtaLabel}
                    onChange={(e) => setForm((c) => ({ ...c, staticCtaLabel: e.target.value }))}
                    placeholder="Book now"
                  />
                </Field>
                <Field label="CTA link (optional)">
                  <Input
                    value={form.staticCtaLink}
                    onChange={(e) => setForm((c) => ({ ...c, staticCtaLink: e.target.value }))}
                    placeholder="/services or https://…"
                  />
                </Field>
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={form.enabled ? 'true' : 'false'}
                onChange={(e) => setForm((c) => ({ ...c, enabled: e.target.value === 'true' }))}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </Select>
            </Field>
            <Field label="Show View all">
              <Select
                value={form.showViewAll ? 'true' : 'false'}
                onChange={(e) => setForm((c) => ({ ...c, showViewAll: e.target.value === 'true' }))}
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            </Field>
          </div>

          {form.showViewAll ? (
            <Field label="View all path (optional)">
              <Input
                value={form.viewAllPath}
                onChange={(e) => setForm((c) => ({ ...c, viewAllPath: e.target.value }))}
                placeholder="Leave blank for default (categories / services)"
              />
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Show on user app">
              <Select
                value={form.showOnApp ? 'true' : 'false'}
                onChange={(e) => setForm((c) => ({ ...c, showOnApp: e.target.value === 'true' }))}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </Field>
            <Field label="Show on website (legacy)">
              <Select
                value={form.showOnWebsite ? 'true' : 'false'}
                onChange={(e) => {
                  const on = e.target.value === 'true'
                  setForm((c) => ({
                    ...c,
                    showOnWebsite: on,
                    // When enabling website, default both web surfaces on.
                    ...(on
                      ? { showOnMobileWeb: true, showOnDesktopWeb: true }
                      : {}),
                  }))
                }}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </Field>
            <Field label="Show on mobile web">
              <Select
                value={form.showOnMobileWeb ? 'true' : 'false'}
                onChange={(e) =>
                  setForm((c) => ({ ...c, showOnMobileWeb: e.target.value === 'true' }))
                }
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </Field>
            <Field label="Show on desktop web">
              <Select
                value={form.showOnDesktopWeb ? 'true' : 'false'}
                onChange={(e) =>
                  setForm((c) => ({ ...c, showOnDesktopWeb: e.target.value === 'true' }))
                }
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(mutating.homeSection)}>
              {mutating.homeSection ? 'Saving…' : 'Save section'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
