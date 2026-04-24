import { useMemo, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, Badge } from '../components/ui'
import { KeyPointsInput } from '../components/KeyPointsInput'
import { useApp } from '../context/useApp'
import { exportRows } from '../services/csv'
import { uploadToCloudinary } from '../services/cloudinary'
import { currency } from '../utils/helpers'

const emptyBrand = () => ({ name: '', logoImage: '' })
const emptyStep = () => ({ title: '', description: '', image: '' })

const initialService = {
  id: '',
  name: '',
  description: '',
  keyPoints: [],
  price: '',
  visitingCharge: '',
  duration: '',
  categoryId: '',
  extraPoint: '',
  imageUrl: '',
  homeImage: '',
  listImage: '',
  detailImage: '',
  brands: [],
  processSteps: [],
  status: 'Active',
}

const initialCategory = { id: '', name: '', icon: '' }

const initialFaq = { id: '', question: '', answer: '' }

function ImageSlot({ label, value, disabled, onUploaded }) {
  const [busy, setBusy] = useState(false)
  return (
    <Field label={label}>
      <div className="rounded-2xl border border-dashed border-[var(--outline-variant)] p-3">
        <input
          className="w-full text-sm"
          type="file"
          accept="image/*"
          disabled={disabled || busy}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setBusy(true)
            try {
              const url = await uploadToCloudinary(file)
              onUploaded(url)
            } finally {
              setBusy(false)
              e.target.value = ''
            }
          }}
        />
        {value ? (
          <img src={value} alt="" className="mt-3 h-28 w-full rounded-xl object-cover" />
        ) : (
          <p className="mt-2 text-xs text-[var(--on-surface-variant)]">No image yet</p>
        )}
      </div>
    </Field>
  )
}

export function ServicesPage() {
  const {
    services,
    categories,
    faqs,
    upsertService,
    deleteService,
    upsertCategory,
    deleteCategory,
    upsertFaq,
    deleteFaq,
    loading,
    mutating,
  } = useApp()
  const [tab, setTab] = useState('services')
  const [search, setSearch] = useState('')
  const [serviceForm, setServiceForm] = useState(initialService)
  const [categoryForm, setCategoryForm] = useState(initialCategory)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [faqForm, setFaqForm] = useState(initialFaq)
  const [faqOpen, setFaqOpen] = useState(false)

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  const filteredServices = useMemo(
    () =>
      services.filter((service) =>
        [service.name, service.description, categoryMap[service.categoryId], service.status]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [services, search, categoryMap],
  )

  const resetService = () => {
    setServiceForm(initialService)
    setServiceOpen(false)
  }

  const resetCategory = () => {
    setCategoryForm(initialCategory)
    setCategoryOpen(false)
  }

  const resetFaq = () => {
    setFaqForm(initialFaq)
    setFaqOpen(false)
  }

  const saveService = async (event) => {
    event.preventDefault()
    if (!serviceForm.homeImage?.trim()) {
      toast.error('Home page image is required.')
      return
    }
    if (Number.isNaN(Number(serviceForm.visitingCharge)) || Number(serviceForm.visitingCharge) < 0) {
      toast.error('Visiting charge must be a valid number (0 or more).')
      return
    }
    for (let i = 0; i < serviceForm.brands.length; i += 1) {
      const b = serviceForm.brands[i]
      const hasAny = Boolean(b.name?.trim() || b.logoImage?.trim())
      if (!hasAny) continue
      if (!b.name?.trim() || !b.logoImage?.trim()) {
        toast.error(`Brand ${i + 1}: enter both name and logo image.`)
        return
      }
    }
    for (let i = 0; i < serviceForm.processSteps.length; i += 1) {
      const s = serviceForm.processSteps[i]
      const partial = Boolean(s.title?.trim() || s.description?.trim() || s.image?.trim())
      if (!partial) continue
      if (!s.title?.trim() || !s.description?.trim() || !s.image?.trim()) {
        toast.error(`Process step ${i + 1}: enter title, description, and image.`)
        return
      }
    }
    try {
      await upsertService({
        ...serviceForm,
        price: Number(serviceForm.price),
        visitingCharge: Number(serviceForm.visitingCharge || 0),
        duration: Number(serviceForm.duration),
        keyPoints: serviceForm.keyPoints,
      })
      resetService()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const saveCategory = (event) => {
    event.preventDefault()
    upsertCategory(categoryForm)
    resetCategory()
  }

  const saveFaq = async (event) => {
    event.preventDefault()
    try {
      await upsertFaq(faqForm)
      resetFaq()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const serviceCover = (s) => s.homeImage || s.imageUrl || ''

  return (
    <div className="space-y-4">
      <PageHeader
        title="Services Management"
        description="Catalog, media (Cloudinary), brands, process steps, and global FAQs for the user app."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search services..." />
            <Button
              variant="ghost"
              onClick={() =>
                exportRows(
                  'services.csv',
                  filteredServices.map((service) => ({
                    ...service,
                    category: categoryMap[service.categoryId],
                  })),
                )
              }
            >
              Export CSV
            </Button>
            <Button variant="ghost" onClick={() => setCategoryOpen(true)}>
              Manage Categories
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-low)]/40 p-2">
        <Button type="button" variant={tab === 'services' ? 'primary' : 'ghost'} onClick={() => setTab('services')}>
          Services
        </Button>
        <Button type="button" variant={tab === 'faqs' ? 'primary' : 'ghost'} onClick={() => setTab('faqs')}>
          Global FAQs
        </Button>
      </div>

      {tab === 'services' ? (
        <>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setServiceForm(initialService)
                setServiceOpen(true)
              }}
            >
              Add Service
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {loading.services ? (
              <Card>
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading services...</p>
              </Card>
            ) : null}
            {!loading.services && !filteredServices.length ? (
              <Card>
                <p className="text-sm text-slate-500 dark:text-slate-400">No services found.</p>
              </Card>
            ) : null}
            {filteredServices.map((service) => (
              <Card key={service.id} className="overflow-hidden p-0">
                <img
                  src={serviceCover(service)}
                  alt={service.name}
                  className="h-52 w-full object-cover"
                />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{service.name}</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {categoryMap[service.categoryId] || 'Uncategorized'}
                      </p>
                    </div>
                    <Badge tone={service.status === 'Active' ? 'success' : 'warning'}>{service.status}</Badge>
                  </div>
                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{service.description}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <p>Price: {currency(service.price)}</p>
                    <p>Visiting: {currency(service.visitingCharge || 0)}</p>
                    <p>Duration: {service.duration} min</p>
                  </div>
                  {(service.brands || []).length > 0 ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Brands
                      </p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {(service.brands || []).map((b) => (
                          <div
                            key={`${service.id}-${b.name}`}
                            className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
                          >
                            <img src={b.logoImage} alt={b.name} className="h-12 w-12 rounded-lg object-contain" />
                            <p className="mt-1 max-w-[72px] truncate text-center text-[10px] text-slate-600 dark:text-slate-300">
                              {b.name}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(service.keyPoints || []).map((point) => (
                      <span
                        key={point}
                        className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                      >
                        {point}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setServiceForm({
                          ...initialService,
                          ...service,
                          keyPoints: service.keyPoints || [],
                          brands: (service.brands || []).length ? service.brands : [],
                          processSteps: (service.processSteps || []).length ? service.processSteps : [],
                          homeImage: service.homeImage || service.imageUrl || '',
                          listImage: service.listImage || '',
                          detailImage: service.detailImage || '',
                          price: String(service.price ?? ''),
                          visitingCharge: String(service.visitingCharge ?? ''),
                          duration: String(service.duration ?? ''),
                        })
                        setServiceOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => deleteService(service.id)}
                      disabled={Boolean(mutating.serviceDelete)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--on-surface)]">Global FAQs</h3>
              <p className="text-sm text-[var(--on-surface-variant)]">
                Same FAQ set for every service; the user app loads this collection once.
              </p>
            </div>
            <Button
              onClick={() => {
                setFaqForm(initialFaq)
                setFaqOpen(true)
              }}
            >
              Add FAQ
            </Button>
          </div>
          {loading.faqs ? <p className="text-sm text-[var(--on-surface-variant)]">Loading FAQs…</p> : null}
          <div className="space-y-3">
            {(faqs || []).map((faq) => (
              <div
                key={faq.id}
                className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)]/80 p-4"
              >
                <p className="font-medium text-[var(--on-surface)]">{faq.question}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--on-surface-variant)]">{faq.answer}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setFaqForm({ id: faq.id, question: faq.question, answer: faq.answer })
                      setFaqOpen(true)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => deleteFaq(faq.id)}
                    disabled={Boolean(mutating.faqDelete)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {!loading.faqs && !(faqs || []).length ? (
              <p className="text-sm text-[var(--on-surface-variant)]">No FAQs yet. Add entries for the user app.</p>
            ) : null}
          </div>
        </Card>
      )}

      <Modal open={serviceOpen} title={serviceForm.id ? 'Edit Service' : 'Add Service'} onClose={resetService} className="max-h-[85vh] max-w-4xl overflow-hidden" bodyClassName="overflow-y-auto pr-1">
        <form className="grid max-w-full gap-4 overflow-x-hidden md:grid-cols-2" onSubmit={saveService}>
          <Field label="Service Name">
            <Input
              value={serviceForm.name}
              onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })}
              required
            />
          </Field>
          <Field label="Category">
            <Select
              value={serviceForm.categoryId}
              onChange={(event) => setServiceForm({ ...serviceForm, categoryId: event.target.value })}
              required
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Description">
              <Textarea
                value={serviceForm.description}
                onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })}
                required
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Key Points">
              <KeyPointsInput value={serviceForm.keyPoints} onChange={(next) => setServiceForm({ ...serviceForm, keyPoints: next })} />
            </Field>
          </div>
          <Field label="Price">
            <Input
              type="number"
              value={serviceForm.price}
              onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })}
              required
            />
          </Field>
          <Field label="Visiting charge">
            <Input
              type="number"
              min="0"
              value={serviceForm.visitingCharge}
              onChange={(event) => setServiceForm({ ...serviceForm, visitingCharge: event.target.value })}
              required
            />
          </Field>
          <Field label="Duration (minutes)">
            <Input
              type="number"
              value={serviceForm.duration}
              onChange={(event) => setServiceForm({ ...serviceForm, duration: event.target.value })}
              required
            />
          </Field>
          <Field label="Extra Point">
            <Input
              value={serviceForm.extraPoint}
              onChange={(event) => setServiceForm({ ...serviceForm, extraPoint: event.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select value={serviceForm.status} onChange={(event) => setServiceForm({ ...serviceForm, status: event.target.value })}>
              <option>Active</option>
              <option>Inactive</option>
            </Select>
          </Field>

          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-semibold text-[var(--on-surface)]">Service images (Cloudinary)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <ImageSlot
                label="Home page"
                value={serviceForm.homeImage}
                disabled={uploading}
                onUploaded={(url) => setServiceForm((c) => ({ ...c, homeImage: url, imageUrl: url }))}
              />
              <ImageSlot
                label="Services list"
                value={serviceForm.listImage}
                disabled={uploading}
                onUploaded={(url) => setServiceForm((c) => ({ ...c, listImage: url }))}
              />
              <ImageSlot
                label="Service detail"
                value={serviceForm.detailImage}
                disabled={uploading}
                onUploaded={(url) => setServiceForm((c) => ({ ...c, detailImage: url }))}
              />
            </div>
          </div>

          <div className="md:col-span-2 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-low)]/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--on-surface)]">Brands</p>
              <Button
                type="button"
                variant="ghost"
                className="gap-1"
                onClick={() => setServiceForm((c) => ({ ...c, brands: [...c.brands, emptyBrand()] }))}
              >
                <Plus className="size-4" /> Add brand
              </Button>
            </div>
            <p className="mt-1 text-xs text-[var(--on-surface-variant)]">Name and logo required for each brand you add.</p>
            <div className="mt-4 space-y-4">
              {serviceForm.brands.map((brand, idx) => (
                <div
                  key={`brand-${idx}`}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--outline-variant)]/80 bg-[var(--surface-lowest)]/60 p-3 sm:flex-row sm:items-end"
                >
                  <div className="min-w-0 flex-1">
                    <Field label="Brand name">
                    <Input
                      value={brand.name}
                      onChange={(e) => {
                        const next = [...serviceForm.brands]
                        next[idx] = { ...next[idx], name: e.target.value }
                        setServiceForm({ ...serviceForm, brands: next })
                      }}
                    />
                    </Field>
                  </div>
                  <div className="flex flex-1 flex-wrap items-end gap-2">
                    <div className="min-w-[140px] flex-1">
                      <Field label="Logo">
                      <Input
                        type="file"
                        accept="image/*"
                        className="text-sm"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setUploading(true)
                          try {
                            const url = await uploadToCloudinary(file)
                            const next = [...serviceForm.brands]
                            next[idx] = { ...next[idx], logoImage: url }
                            setServiceForm({ ...serviceForm, brands: next })
                          } finally {
                            setUploading(false)
                            e.target.value = ''
                          }
                        }}
                      />
                      </Field>
                    </div>
                    {brand.logoImage ? (
                      <img src={brand.logoImage} alt="" className="h-14 w-14 rounded-lg border object-contain" />
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-[var(--error)]"
                      onClick={() =>
                        setServiceForm((c) => ({
                          ...c,
                          brands: c.brands.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-low)]/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--on-surface)]">Process steps</p>
              <Button
                type="button"
                variant="ghost"
                className="gap-1"
                onClick={() => setServiceForm((c) => ({ ...c, processSteps: [...c.processSteps, emptyStep()] }))}
              >
                <Plus className="size-4" /> Add step
              </Button>
            </div>
            <p className="mt-1 text-xs text-[var(--on-surface-variant)]">Each step needs title, description, and image.</p>
            <div className="mt-4 space-y-4">
              {serviceForm.processSteps.map((step, idx) => (
                <div key={`step-${idx}`} className="rounded-xl border border-[var(--outline-variant)]/80 bg-[var(--surface-lowest)]/60 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[var(--on-surface-variant)]">
                    <GripVertical className="size-4 shrink-0" />
                    <span className="text-xs font-medium">Step {idx + 1}</span>
                  </div>
                  <Field label="Title">
                    <Input
                      value={step.title}
                      onChange={(e) => {
                        const next = [...serviceForm.processSteps]
                        next[idx] = { ...next[idx], title: e.target.value }
                        setServiceForm({ ...serviceForm, processSteps: next })
                      }}
                    />
                  </Field>
                  <Field label="Description">
                    <Textarea
                      className="min-h-20"
                      value={step.description}
                      onChange={(e) => {
                        const next = [...serviceForm.processSteps]
                        next[idx] = { ...next[idx], description: e.target.value }
                        setServiceForm({ ...serviceForm, processSteps: next })
                      }}
                    />
                  </Field>
                  <Field label="Step image">
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-sm"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploading(true)
                        try {
                          const url = await uploadToCloudinary(file)
                          const next = [...serviceForm.processSteps]
                          next[idx] = { ...next[idx], image: url }
                          setServiceForm({ ...serviceForm, processSteps: next })
                        } finally {
                          setUploading(false)
                          e.target.value = ''
                        }
                      }}
                    />
                  </Field>
                  {step.image ? <img src={step.image} alt="" className="mt-2 h-32 w-full rounded-xl object-cover" /> : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 text-[var(--error)]"
                    onClick={() =>
                      setServiceForm((c) => ({
                        ...c,
                        processSteps: c.processSteps.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    Remove step
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" type="button" onClick={resetService} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || Boolean(mutating.service)} className="w-full sm:w-auto">
              {uploading || mutating.service ? 'Saving...' : 'Save Service'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={faqOpen} title={faqForm.id ? 'Edit FAQ' : 'Add FAQ'} onClose={resetFaq}>
        <form className="space-y-4" onSubmit={saveFaq}>
          <Field label="Question">
            <Input
              value={faqForm.question}
              onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
              required
            />
          </Field>
          <Field label="Answer">
            <Textarea
              className="min-h-32"
              value={faqForm.answer}
              onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={resetFaq}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(mutating.faq)}>
              {mutating.faq ? 'Saving…' : 'Save FAQ'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={categoryOpen} title="Manage Categories" onClose={resetCategory}>
        <div className="space-y-4">
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={saveCategory}>
            <Field label="Category Name">
              <Input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                required
              />
            </Field>
            <Field label="Icon (optional)">
              <Input
                value={categoryForm.icon}
                onChange={(event) => setCategoryForm({ ...categoryForm, icon: event.target.value })}
              />
            </Field>
            <div className="self-end">
              <Button type="submit">{categoryForm.id ? 'Update' : 'Create'}</Button>
            </div>
          </form>

          <div className="space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{category.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{category.icon || 'No icon'}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" type="button" onClick={() => setCategoryForm(category)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => deleteCategory(category.id)}
                    disabled={Boolean(mutating.categoryDelete)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
