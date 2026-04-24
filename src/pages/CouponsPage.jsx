import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, Badge } from '../components/ui'
import { useApp } from '../context/useApp'

const initialCoupon = {
  id: '',
  code: '',
  discountType: 'flat',
  discountValue: '',
  minOrderAmount: '',
  maxDiscount: '',
  expiryDate: '',
  active: true,
}

const toDateTimeLocal = (ts) => {
  const d = ts?.toDate?.() ? ts.toDate() : ts instanceof Date ? ts : null
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CouponsPage() {
  const { coupons, loading, mutating, upsertCoupon, deleteCoupon } = useApp()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialCoupon)

  const filtered = useMemo(
    () =>
      (coupons || []).filter((c) =>
        [
          c.code,
          c.discountType,
          c.discountValue,
          c.minOrderAmount,
          c.maxDiscount,
          c.active ? 'active' : 'inactive',
          c.id,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [coupons, search],
  )

  const reset = () => {
    setForm(initialCoupon)
    setOpen(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    try {
      await upsertCoupon(form)
      reset()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Coupons"
        description="Create coupon codes for the user app checkout."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search coupons..." />
            <Button onClick={() => setOpen(true)}>Add coupon</Button>
          </>
        }
      />

      <div className="grid gap-4">
        {loading.coupons ? (
          <Card>
            <p className="text-sm text-[var(--on-surface-variant)]">Loading coupons...</p>
          </Card>
        ) : null}
        {!loading.coupons && !filtered.length ? (
          <Card>
            <p className="text-sm text-[var(--on-surface-variant)]">No coupons found.</p>
          </Card>
        ) : null}

        {filtered.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-lg font-semibold text-[var(--on-surface)]">{c.code}</p>
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">ID: {c.id}</p>
                <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
                  {c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`} off • Min ₹{c.minOrderAmount || 0}
                  {c.maxDiscount ? ` • Max ₹${c.maxDiscount}` : ''}
                </p>
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                  Expiry: {c.expiryDate?.toDate?.() ? c.expiryDate.toDate().toLocaleString() : '—'}
                </p>
              </div>
              <Badge tone={c.active ? 'success' : 'warning'}>{c.active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setForm({
                    ...initialCoupon,
                    ...c,
                    discountValue: String(c.discountValue ?? ''),
                    minOrderAmount: String(c.minOrderAmount ?? ''),
                    maxDiscount: c.maxDiscount == null ? '' : String(c.maxDiscount),
                    expiryDate: toDateTimeLocal(c.expiryDate),
                    active: Boolean(c.active),
                  })
                  setOpen(true)
                }}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                type="button"
                disabled={Boolean(mutating.couponDelete)}
                onClick={() => deleteCoupon(c.id)}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} title={form.id ? 'Edit coupon' : 'Add coupon'} onClose={reset} className="max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Code (e.g. SAVE50)">
            <Input
              value={form.code}
              onChange={(e) => setForm((cur) => ({ ...cur, code: e.target.value }))}
              placeholder="SAVE50"
              required
            />
          </Field>
          <Field label="Discount type">
            <Select
              value={form.discountType}
              onChange={(e) => setForm((cur) => ({ ...cur, discountType: e.target.value }))}
            >
              <option value="flat">flat</option>
              <option value="percentage">percentage</option>
            </Select>
          </Field>
          <Field label={form.discountType === 'percentage' ? 'Discount value (%)' : 'Discount value (₹)'}>
            <Input
              type="number"
              min="0"
              value={form.discountValue}
              onChange={(e) => setForm((cur) => ({ ...cur, discountValue: e.target.value }))}
              required
            />
          </Field>
          <Field label="Min order amount (₹)">
            <Input
              type="number"
              min="0"
              value={form.minOrderAmount}
              onChange={(e) => setForm((cur) => ({ ...cur, minOrderAmount: e.target.value }))}
              required
            />
          </Field>
          <Field label="Max discount (optional)">
            <Input
              type="number"
              min="0"
              value={form.maxDiscount}
              onChange={(e) => setForm((cur) => ({ ...cur, maxDiscount: e.target.value }))}
              placeholder="Leave blank for no limit"
            />
          </Field>
          <Field label="Expiry date & time">
            <Input
              type="datetime-local"
              value={form.expiryDate}
              onChange={(e) => setForm((cur) => ({ ...cur, expiryDate: e.target.value }))}
              required
            />
          </Field>
          <Field label="Active">
            <Select value={form.active ? 'true' : 'false'} onChange={(e) => setForm((c) => ({ ...c, active: e.target.value === 'true' }))}>
              <option value="true">true</option>
              <option value="false">false</option>
            </Select>
          </Field>

          <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-low)]/30 p-4 text-sm text-[var(--on-surface-variant)]">
            <p>
              Notes for checkout validation: coupon must be <strong>active</strong>, not expired, and order total must be
              at least <strong>min order amount</strong>. If percentage, apply <strong>max discount</strong> if set.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(mutating.coupon)}>
              {mutating.coupon ? 'Saving…' : 'Save coupon'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

