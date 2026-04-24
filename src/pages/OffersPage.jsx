import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Badge } from '../components/ui'
import { uploadToCloudinary } from '../services/cloudinary'
import { useApp } from '../context/useApp'

const initialOffer = { id: '', title: '', image: '', active: true }

export function OffersPage() {
  const { offers, loading, mutating, upsertOffer, deleteOffer } = useApp()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialOffer)
  const [uploading, setUploading] = useState(false)

  const filtered = useMemo(
    () =>
      (offers || []).filter((o) =>
        [o.title, o.active ? 'active' : 'inactive', o.id].join(' ').toLowerCase().includes(search.toLowerCase()),
      ),
    [offers, search],
  )

  const reset = () => {
    setForm(initialOffer)
    setOpen(false)
    setUploading(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    try {
      await upsertOffer(form)
      reset()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Special Offers"
        description="Create banners for the user app home screen."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search offers..." />
            <Button onClick={() => setOpen(true)}>Add offer</Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {loading.offers ? (
          <Card>
            <p className="text-sm text-[var(--on-surface-variant)]">Loading offers...</p>
          </Card>
        ) : null}
        {!loading.offers && !filtered.length ? (
          <Card>
            <p className="text-sm text-[var(--on-surface-variant)]">No offers found.</p>
          </Card>
        ) : null}
        {filtered.map((offer) => (
          <Card key={offer.id} className="overflow-hidden p-0">
            {offer.image ? <img src={offer.image} alt="" className="h-52 w-full object-cover" /> : null}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-[var(--on-surface)]">
                    {offer.title || 'Untitled offer'}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--on-surface-variant)]">ID: {offer.id}</p>
                </div>
                <Badge tone={offer.active ? 'success' : 'warning'}>{offer.active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setForm({ ...initialOffer, ...offer, active: Boolean(offer.active) })
                    setOpen(true)
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  type="button"
                  disabled={Boolean(mutating.offerDelete)}
                  onClick={() => deleteOffer(offer.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} title={form.id ? 'Edit offer' : 'Add offer'} onClose={reset} className="max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Title (optional)">
            <Input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} />
          </Field>
          <Field label="Active">
            <Select value={form.active ? 'true' : 'false'} onChange={(e) => setForm((c) => ({ ...c, active: e.target.value === 'true' }))}>
              <option value="true">true</option>
              <option value="false">false</option>
            </Select>
          </Field>

          <div className="rounded-2xl border border-dashed border-[var(--outline-variant)] p-4">
            <div className="text-sm text-[var(--on-surface-variant)]">Upload banner image (Cloudinary).</div>
            <input
              className="mt-3 w-full text-sm"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setUploading(true)
                try {
                  const url = await uploadToCloudinary(file)
                  setForm((c) => ({ ...c, image: url }))
                } finally {
                  setUploading(false)
                  e.target.value = ''
                }
              }}
            />
            {form.image ? <img src={form.image} alt="" className="mt-4 h-44 w-full rounded-2xl object-cover" /> : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || Boolean(mutating.offer)}>
              {uploading || mutating.offer ? 'Saving…' : 'Save offer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

