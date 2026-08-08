import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Badge } from '../components/ui'
import { useApp } from '../context/useApp'

const initialCoupon = {
  id: '',
  code: '',
  discountType: 'flat',
  discountValue: '',
  minOrderAmount: '',
  maxDiscount: '',
  expiryDate: '',
  usageLimit: '',
  perUserLimit: '',
  firstOrderOnly: false,
  categoryIds: [],
  serviceIds: [],
  active: true,
}

const toDateTimeLocal = (ts) => {
  const d = ts?.toDate?.() ? ts.toDate() : ts instanceof Date ? ts : null
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function couponDiscountLabel(c) {
  const type = c.discountType === 'percentage' ? 'percentage' : 'flat'
  const value =
    type === 'percentage'
      ? Number(c.discountPercent ?? c.discountValue ?? c.value ?? 0)
      : Number(c.discountFlat ?? c.discountValue ?? c.value ?? 0)
  return type === 'percentage' ? `${value}%` : `₹${value}`
}

function toggleId(list, id) {
  const next = new Set(list || [])
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return [...next]
}

export function CouponsPage() {
  const { coupons, categories, services, loading, mutating, upsertCoupon, deleteCoupon } = useApp()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialCoupon)

  const categoryOptions = useMemo(
    () =>
      (categories || [])
        .map((c) => ({ id: c.id, label: c.name || c.title || c.id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  )

  const serviceOptions = useMemo(
    () =>
      (services || [])
        .filter((s) => !s.comingSoon)
        .map((s) => ({ id: s.id, label: s.name || s.title || s.id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [services],
  )

  const filtered = useMemo(
    () =>
      (coupons || []).filter((c) =>
        [
          c.code,
          c.discountType,
          c.discountValue,
          c.discountPercent,
          c.discountFlat,
          c.minOrderAmount,
          c.maxDiscount,
          c.usageLimit,
          c.perUserLimit,
          c.firstOrderOnly ? 'first order' : '',
          c.usageCount,
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
        description="Create coupon codes for the user app checkout. Optional per-user limits, first-order-only, and category/service restrictions."
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
                  {couponDiscountLabel(c)} off • Min ₹{c.minOrderAmount || 0}
                  {c.maxDiscount ? ` • Max ₹${c.maxDiscount}` : ''}
                </p>
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                  Expiry:{' '}
                  {(c.expiresAt || c.expiryDate)?.toDate?.()
                    ? (c.expiresAt || c.expiryDate).toDate().toLocaleString()
                    : '—'}
                </p>
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                  Usage: {Number(c.usageCount ?? 0)}
                  {c.usageLimit != null && c.usageLimit !== '' ? ` / ${c.usageLimit}` : ' (no limit)'}
                  {c.perUserLimit != null && c.perUserLimit !== ''
                    ? ` • Per user: ${c.perUserLimit}`
                    : ''}
                </p>
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                  {c.firstOrderOnly ? 'First order only' : 'Any order'}
                  {(Array.isArray(c.categoryIds) && c.categoryIds.length) ||
                  (Array.isArray(c.serviceIds) && c.serviceIds.length)
                    ? ` • Restricted (${(c.categoryIds || []).length} categories, ${(c.serviceIds || []).length} services)`
                    : ' • All categories/services'}
                </p>
              </div>
              <Badge tone={c.active ? 'success' : 'warning'}>{c.active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  const type = c.discountType === 'percentage' ? 'percentage' : 'flat'
                  const value =
                    type === 'percentage'
                      ? c.discountPercent ?? c.discountValue ?? c.value
                      : c.discountFlat ?? c.discountValue ?? c.value
                  setForm({
                    ...initialCoupon,
                    ...c,
                    discountType: type,
                    discountValue: String(value ?? ''),
                    minOrderAmount: String(c.minOrderAmount ?? ''),
                    maxDiscount: c.maxDiscount == null ? '' : String(c.maxDiscount),
                    expiryDate: toDateTimeLocal(c.expiresAt || c.expiryDate),
                    usageLimit: c.usageLimit == null ? '' : String(c.usageLimit),
                    perUserLimit: c.perUserLimit == null ? '' : String(c.perUserLimit),
                    firstOrderOnly: Boolean(c.firstOrderOnly),
                    categoryIds: Array.isArray(c.categoryIds) ? c.categoryIds.map(String) : [],
                    serviceIds: Array.isArray(c.serviceIds) ? c.serviceIds.map(String) : [],
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
                onClick={() => {
                  if (!window.confirm(`Delete coupon ${c.code || c.id}?`)) return
                  void deleteCoupon(c.id)
                }}
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
          <Field label="Usage limit (optional)">
            <Input
              type="number"
              min="0"
              value={form.usageLimit}
              onChange={(e) => setForm((cur) => ({ ...cur, usageLimit: e.target.value }))}
              placeholder="Leave blank for unlimited"
            />
          </Field>
          <Field label="Per-user limit (optional)">
            <Input
              type="number"
              min="1"
              value={form.perUserLimit}
              onChange={(e) => setForm((cur) => ({ ...cur, perUserLimit: e.target.value }))}
              placeholder="e.g. 1 — leave blank for no per-user cap"
            />
          </Field>
          <Field label="First order only">
            <Select
              value={form.firstOrderOnly ? 'true' : 'false'}
              onChange={(e) => setForm((c) => ({ ...c, firstOrderOnly: e.target.value === 'true' }))}
            >
              <option value="false">No — any order</option>
              <option value="true">Yes — first order only</option>
            </Select>
          </Field>
          <Field label="Categories (optional — empty = all)">
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)] p-3">
              {!categoryOptions.length ? (
                <p className="text-xs text-[var(--on-surface-variant)]">No categories loaded.</p>
              ) : (
                categoryOptions.map((opt) => (
                  <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(form.categoryIds || []).includes(opt.id)}
                      onChange={() =>
                        setForm((cur) => ({
                          ...cur,
                          categoryIds: toggleId(cur.categoryIds, opt.id),
                        }))
                      }
                    />
                    <span>{opt.label}</span>
                  </label>
                ))
              )}
            </div>
          </Field>
          <Field label="Services (optional — empty = all)">
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)] p-3">
              {!serviceOptions.length ? (
                <p className="text-xs text-[var(--on-surface-variant)]">No services loaded.</p>
              ) : (
                serviceOptions.map((opt) => (
                  <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(form.serviceIds || []).includes(opt.id)}
                      onChange={() =>
                        setForm((cur) => ({
                          ...cur,
                          serviceIds: toggleId(cur.serviceIds, opt.id),
                        }))
                      }
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                ))
              )}
            </div>
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
              Usage / per-user limits and category/service filters are stored for apps that enforce them. Older coupons
              without these fields remain valid (no restriction).
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
