import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui'
import { DEFAULT_INVOICE_SETTINGS, normalizeInvoiceSettings } from '../constants/invoiceSettings'
import { useApp } from '../context/useApp'
import { isFirebaseConfigured } from '../firebase/config'
import { subscribeDoc, upsertDoc } from '../services/firestore'
import { isStorageConfigured, uploadMedia } from '../services/storageUpload'

export function InvoiceSettingsPage() {
  const { mutating, session } = useApp()
  const [form, setForm] = useState({ ...DEFAULT_INVOICE_SETTINGS })
  const [loadingDoc, setLoadingDoc] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured || !session?.id) {
      setLoadingDoc(false)
      return undefined
    }
    setLoadingDoc(true)
    const unsub = subscribeDoc(
      'settings',
      'invoice',
      (row) => {
        setForm(normalizeInvoiceSettings(row || {}))
        setLoadingDoc(false)
      },
      () => {
        toast.error('Could not load invoice settings.')
        setLoadingDoc(false)
      },
    )
    return () => unsub?.()
  }, [session?.id])

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const onSave = async (e) => {
    e.preventDefault()
    const gst = Number(form.gstPercent)
    if (!Number.isFinite(gst) || gst < 0) {
      toast.error('GST percent must be 0 or more.')
      return
    }
    if (!String(form.companyName || '').trim()) {
      toast.error('Company name is required.')
      return
    }
    setSaving(true)
    try {
      const payload = normalizeInvoiceSettings(form)
      await upsertDoc('settings', 'invoice', payload)
      setForm(payload)
      toast.success('Invoice settings saved.')
    } catch (err) {
      toast.error(err?.message || 'Could not save invoice settings.')
    } finally {
      setSaving(false)
    }
  }

  const busy = saving || Boolean(mutating?.invoiceSettings)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Invoice Settings"
        description="Company details, GST, and branding used when generating invoices."
      />

      <Card className="space-y-6 p-5 sm:p-6">
        {loadingDoc ? (
          <p className="text-sm text-[var(--on-surface-variant)]">Loading invoice settings…</p>
        ) : null}
        <form className="space-y-6" onSubmit={onSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <Input
                value={form.companyName}
                onChange={(e) => setField('companyName', e.target.value)}
                disabled={busy || loadingDoc}
                required
              />
            </Field>
            <Field label="Legal name">
              <Input
                value={form.legalName}
                onChange={(e) => setField('legalName', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="GSTIN">
              <Input
                value={form.gstin}
                onChange={(e) => setField('gstin', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="PAN">
              <Input
                value={form.pan}
                onChange={(e) => setField('pan', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="Invoice prefix">
              <Input
                value={form.invoicePrefix}
                onChange={(e) => setField('invoicePrefix', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="UPI ID (Scan & Pay)">
              <Input
                value={form.upiId || ''}
                onChange={(e) => setField('upiId', e.target.value)}
                disabled={busy || loadingDoc}
                placeholder="repairseries@upi"
              />
            </Field>
            <Field label="GST enabled">
              <label className="flex items-center gap-2 text-sm text-[var(--on-surface)]">
                <input
                  type="checkbox"
                  checked={Boolean(form.gstEnabled)}
                  onChange={(e) => setField('gstEnabled', e.target.checked)}
                  disabled={busy || loadingDoc}
                />
                Add GST on top of the taxable amount for new bookings
              </label>
              <span className="text-xs font-normal text-[var(--on-surface-variant)]">
                Off by default. Existing invoices keep their original GST treatment.
              </span>
            </Field>
            <Field label="GST percent">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.gstPercent}
                onChange={(e) => setField('gstPercent', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address line 1">
              <Input
                value={form.addressLine1}
                onChange={(e) => setField('addressLine1', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="Address line 2">
              <Input
                value={form.addressLine2}
                onChange={(e) => setField('addressLine2', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(e) => setField('state', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="Pincode">
              <Input
                value={form.pincode}
                onChange={(e) => setField('pincode', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="Udyam number">
              <Input
                value={form.udyamNumber || ''}
                onChange={(e) => setField('udyamNumber', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="Website">
              <Input
                value={form.website}
                onChange={(e) => setField('website', e.target.value)}
                disabled={busy || loadingDoc}
              />
            </Field>
            <Field label="Logo">
              <Input
                value={form.logoUrl}
                onChange={(e) => setField('logoUrl', e.target.value)}
                disabled={busy || loadingDoc}
                placeholder="Cloudinary URL"
              />
              <input
                className="mt-2 text-sm"
                type="file"
                accept="image/*"
                disabled={busy || loadingDoc}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  if (!isStorageConfigured()) {
                    toast.error('Set VITE_WEBSITE_API_URL so the logo can upload to Cloudinary.')
                    return
                  }
                  try {
                    const url = await uploadMedia(file, { kind: 'company', slot: 'logo' })
                    setField('logoUrl', url)
                    toast.success('Logo uploaded.')
                  } catch (err) {
                    toast.error(err?.message || 'Logo upload failed.')
                  }
                }}
              />
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="" className="mt-3 h-16 w-16 rounded-lg object-contain" />
              ) : null}
            </Field>
          </div>

          <Field label="Terms">
            <Textarea
              value={form.terms}
              onChange={(e) => setField('terms', e.target.value)}
              disabled={busy || loadingDoc}
            />
          </Field>
          <Field label="Thank you message">
            <Textarea
              value={form.thankYouMessage}
              onChange={(e) => setField('thankYouMessage', e.target.value)}
              disabled={busy || loadingDoc}
            />
          </Field>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy || loadingDoc}>
              {busy ? 'Saving…' : 'Save invoice settings'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
