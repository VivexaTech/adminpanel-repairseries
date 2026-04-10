import { useMemo, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, Badge } from '../components/ui'
import { KeyPointsInput } from '../components/KeyPointsInput'
import { useApp } from '../context/useApp'
import { exportRows } from '../services/csv'
import { uploadToCloudinary } from '../services/cloudinary'
import { currency } from '../utils/helpers'

const initialService = {
  id: '',
  name: '',
  description: '',
  keyPoints: [],
  price: '',
  duration: '',
  categoryId: '',
  extraPoint: '',
  imageUrl: '',
  status: 'Active',
}

const initialCategory = { id: '', name: '', icon: '' }

export function ServicesPage() {
  const {
    services,
    categories,
    upsertService,
    deleteService,
    upsertCategory,
    deleteCategory,
    loading,
    mutating,
  } = useApp()
  const [search, setSearch] = useState('')
  const [serviceForm, setServiceForm] = useState(initialService)
  const [categoryForm, setCategoryForm] = useState(initialCategory)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

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

  const saveService = (event) => {
    event.preventDefault()
    upsertService({
      ...serviceForm,
      price: Number(serviceForm.price),
      duration: Number(serviceForm.duration),
      keyPoints: serviceForm.keyPoints,
    })
    resetService()
  }

  const saveCategory = (event) => {
    event.preventDefault()
    upsertCategory(categoryForm)
    resetCategory()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Services Management"
        description="Maintain the service catalog, media, pricing, categories, and availability."
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
            <Button onClick={() => setServiceOpen(true)}>Add Service</Button>
          </>
        }
      />

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
            <img src={service.imageUrl} alt={service.name} className="h-52 w-full object-cover" />
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
                <p>Duration: {service.duration} min</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {service.keyPoints.map((point) => (
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
                      ...service,
                      keyPoints: service.keyPoints || [],
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

      <Modal
        open={serviceOpen}
        title={serviceForm.id ? 'Edit Service' : 'Add Service'}
        onClose={resetService}
        className="max-h-[80vh] max-w-4xl overflow-hidden"
        bodyClassName="overflow-y-auto pr-1"
      >
        <form className="grid max-w-full gap-4 overflow-x-hidden md:grid-cols-2" onSubmit={saveService}>
          <Field label="Service Name">
            <Input value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} required />
          </Field>
          <Field label="Category">
            <Select value={serviceForm.categoryId} onChange={(event) => setServiceForm({ ...serviceForm, categoryId: event.target.value })} required>
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
              <Textarea value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} required />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Key Points">
              <KeyPointsInput value={serviceForm.keyPoints} onChange={(next) => setServiceForm({ ...serviceForm, keyPoints: next })} />
            </Field>
          </div>
          <Field label="Price">
            <Input type="number" value={serviceForm.price} onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })} required />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" value={serviceForm.duration} onChange={(event) => setServiceForm({ ...serviceForm, duration: event.target.value })} required />
          </Field>
          <Field label="Extra Point">
            <Input value={serviceForm.extraPoint} onChange={(event) => setServiceForm({ ...serviceForm, extraPoint: event.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={serviceForm.status} onChange={(event) => setServiceForm({ ...serviceForm, status: event.target.value })}>
              <option>Active</option>
              <option>Inactive</option>
            </Select>
          </Field>
          <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <ImagePlus className="size-5 text-blue-500" />
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Uploads go to Cloudinary when env keys are present. Otherwise the file previews locally.
              </div>
            </div>
            <input
              className="mt-3 w-full text-sm"
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                setUploading(true)
                try {
                  const imageUrl = await uploadToCloudinary(file)
                  setServiceForm((current) => ({ ...current, imageUrl }))
                } finally {
                  setUploading(false)
                }
              }}
            />
            {serviceForm.imageUrl ? (
              <img
                src={serviceForm.imageUrl}
                alt="Preview"
                className="mt-4 h-40 w-full rounded-2xl object-cover sm:h-48"
              />
            ) : null}
          </div>
          <div className="md:col-span-2 flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={resetService} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={uploading || Boolean(mutating.service)}
              className="w-full sm:w-auto"
            >
              {uploading || mutating.service ? 'Saving...' : 'Save Service'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={categoryOpen} title="Manage Categories" onClose={resetCategory}>
        <div className="space-y-4">
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={saveCategory}>
            <Field label="Category Name">
              <Input value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} required />
            </Field>
            <Field label="Icon (optional)">
              <Input value={categoryForm.icon} onChange={(event) => setCategoryForm({ ...categoryForm, icon: event.target.value })} />
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
                  <Button variant="ghost" onClick={() => setCategoryForm(category)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
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
