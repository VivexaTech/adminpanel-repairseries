import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, PageHeader } from '../components/ui'
import { useApp } from '../context/useApp'
import {
  deleteStorageFileAtDownloadUrl,
  uploadGlobalPaymentQrImage,
  validatePaymentQrFile,
} from '../services/platformPaymentStorage'
import { isStorageConfigured } from '../services/storageUpload'
import { DEFAULT_ADDON_FEE_PERCENT } from '../utils/bookingFinance'
import { DEFAULT_PLATFORM_COMMISSION_PERCENT, formatDateTime } from '../utils/helpers'

function formatSettingsTime(updatedAt) {
  if (!updatedAt) return '—'
  try {
    const d = typeof updatedAt.toDate === 'function' ? updatedAt.toDate() : new Date(updatedAt)
    if (Number.isNaN(d.getTime())) return '—'
    return formatDateTime(d)
  } catch {
    return '—'
  }
}

export function PlatformSettingsPage() {
  const { platformSettings, updatePlatformGeneral, updateGlobalPaymentSettings, loading, mutating } =
    useApp()
  const [radiusKm, setRadiusKm] = useState('')
  const [commission, setCommission] = useState('')
  const [addonCommission, setAddonCommission] = useState('')
  const [spareCommission, setSpareCommission] = useState('')
  const [customerFeeType, setCustomerFeeType] = useState('fixed')
  const [customerFeeValue, setCustomerFeeValue] = useState('0')
  const [globalUpiInput, setGlobalUpiInput] = useState('')
  const [qrImageUrl, setQrImageUrl] = useState('')
  const [googleReviewInput, setGoogleReviewInput] = useState('')
  const qrFileRef = useRef(null)
  const storageConfigured = isStorageConfigured()

  useEffect(() => {
    const r = platformSettings?.defaultTechnicianServiceRadiusKm
    const c = platformSettings?.platformCommissionPercent
    const a = platformSettings?.addonFeePercent
    setRadiusKm(r != null && r !== '' ? String(r) : '')
    setCommission(c != null && c !== '' ? String(c) : '')
    setAddonCommission(a != null && a !== '' ? String(a) : '')
    setSpareCommission(
      platformSettings?.sparePartCommissionPercent != null &&
        platformSettings?.sparePartCommissionPercent !== ''
        ? String(platformSettings.sparePartCommissionPercent)
        : a != null && a !== ''
          ? String(a)
          : '',
    )
    setCustomerFeeType(
      String(platformSettings?.customerPlatformFeeType || 'fixed').toLowerCase() === 'percent'
        ? 'percent'
        : 'fixed',
    )
    setCustomerFeeValue(
      platformSettings?.customerPlatformFeeValue != null &&
        platformSettings?.customerPlatformFeeValue !== ''
        ? String(platformSettings.customerPlatformFeeValue)
        : '0',
    )
    setGlobalUpiInput(
      platformSettings?.globalUpiId != null && platformSettings?.globalUpiId !== ''
        ? String(platformSettings.globalUpiId)
        : '',
    )
    setQrImageUrl(
      platformSettings?.globalPaymentQr != null && platformSettings?.globalPaymentQr !== ''
        ? String(platformSettings.globalPaymentQr)
        : '',
    )
    setGoogleReviewInput(
      platformSettings?.googleReviewUrl != null && platformSettings?.googleReviewUrl !== ''
        ? String(platformSettings.googleReviewUrl)
        : '',
    )
  }, [
    platformSettings?.updatedAt,
    platformSettings?.defaultTechnicianServiceRadiusKm,
    platformSettings?.platformCommissionPercent,
    platformSettings?.addonFeePercent,
    platformSettings?.sparePartCommissionPercent,
    platformSettings?.customerPlatformFeeType,
    platformSettings?.customerPlatformFeeValue,
    platformSettings?.globalUpiId,
    platformSettings?.globalPaymentQr,
    platformSettings?.googleReviewUrl,
  ])

  const onSubmit = async (e) => {
    e.preventDefault()
    const r = Number(radiusKm)
    const c = Number(commission)
    const a = Number(addonCommission)
    const spare = Number(spareCommission)
    const feeVal = Number(customerFeeValue)
    if (!Number.isFinite(r) || r < 0) {
      toast.error('Partner map radius must be 0 or more. It does not limit bookings.')
      return
    }
    if (!Number.isFinite(c) || c < 0 || c > 100) {
      toast.error('Service commission must be between 0 and 100.')
      return
    }
    if (!Number.isFinite(a) || a < 0 || a > 100) {
      toast.error('Additional service commission must be between 0 and 100.')
      return
    }
    if (!Number.isFinite(spare) || spare < 0 || spare > 100) {
      toast.error('Spare part commission must be between 0 and 100.')
      return
    }
    if (!Number.isFinite(feeVal) || feeVal < 0) {
      toast.error('Customer platform fee must be 0 or more.')
      return
    }
    if (customerFeeType === 'percent' && feeVal > 100) {
      toast.error('Customer platform fee percent must be between 0 and 100.')
      return
    }
    try {
      await updatePlatformGeneral({
        defaultTechnicianServiceRadiusKm: r,
        platformCommissionPercent: c,
        addonFeePercent: a,
        sparePartCommissionPercent: spare,
        customerPlatformFeeType: customerFeeType,
        customerPlatformFeeValue: feeVal,
        googleReviewUrl: googleReviewInput,
      })
    } catch (err) {
      toast.error(err?.message || 'Could not save settings.')
    }
  }

  const onSaveGlobalPayment = async (e) => {
    e.preventDefault()
    try {
      await updateGlobalPaymentSettings({
        globalUpiId: globalUpiInput,
        globalPaymentQr: qrImageUrl,
      })
    } catch (err) {
      toast.error(err?.message || 'Could not save global payment settings.')
    }
  }

  const onPickQrFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const v = validatePaymentQrFile(file)
    if (!v.ok) {
      toast.error(v.error)
      return
    }
    if (!isStorageConfigured()) {
      toast.error('Set VITE_WEBSITE_API_URL so payment QR images can upload to Cloudinary.')
      return
    }
    try {
      const old = qrImageUrl
      const url = await uploadGlobalPaymentQrImage(file)
      setQrImageUrl(url)
      if (old && old !== url) {
        await deleteStorageFileAtDownloadUrl(old)
      }
      toast.success('Image uploaded. Click Save changes to store the URL in Firestore.')
    } catch (err) {
      toast.error(err?.message || 'Upload failed.')
    }
  }

  const onRemoveQr = async () => {
    if (!qrImageUrl) {
      toast.message('No QR image to remove.')
      return
    }
    try {
      if (qrImageUrl.includes('firebasestorage.googleapis.com')) {
        await deleteStorageFileAtDownloadUrl(qrImageUrl)
      }
      setQrImageUrl('')
      await updateGlobalPaymentSettings({
        globalUpiId: globalUpiInput,
        globalPaymentQr: '',
      })
      toast.success('Payment QR removed from storage and settings.')
    } catch (err) {
      toast.error(err?.message || 'Could not remove QR.')
    }
  }

  const busy = Boolean(mutating.platformSettings)
  const settingsLoading = loading.platformSettings

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Platform Settings"
        description="Live values from Firestore settings/general. New bookings snapshot these rates; changing them does not alter completed or frozen bookings."
      />

      <Card className="space-y-6 rounded-3xl border border-[var(--outline-variant)]/50 p-5 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.35)] sm:p-6">
        <p className="text-sm text-[var(--on-surface-variant)]">
          Last updated:{' '}
          <span className="font-medium text-[var(--on-surface)]">
            {settingsLoading ? 'Loading…' : formatSettingsTime(platformSettings?.updatedAt)}
          </span>
        </p>
        <p className="text-xs text-[var(--on-surface-variant)]">
          Bookings created before fee snapshots use code defaults ({DEFAULT_PLATFORM_COMMISSION_PERCENT}% /{' '}
          {DEFAULT_ADDON_FEE_PERCENT}% ) in the admin UI until you migrate data.
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Partner map radius (KM, display only)">
            <Input
              type="number"
              min="0"
              step="0.1"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              placeholder="e.g. 10"
              disabled={busy || settingsLoading}
            />
          </Field>
          <p className="text-xs text-[var(--on-surface-variant)]">
            Shown on the Partner App map. Booking assignment is not limited to this radius.
          </p>
          <Field label="Company commission on service (%)">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="0–100"
              disabled={busy || settingsLoading}
              required
            />
            <span className="text-xs font-normal text-[var(--on-surface-variant)]">
              Taken from service value only. Example: ₹1000 service at 30% → company ₹300, partner ₹700.
            </span>
          </Field>
          <Field label="Company commission on additional services (%)">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={addonCommission}
              onChange={(e) => setAddonCommission(e.target.value)}
              placeholder="0–100"
              disabled={busy || settingsLoading}
              required
            />
          </Field>
          <Field label="Company commission on spare parts (%)">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={spareCommission}
              onChange={(e) => setSpareCommission(e.target.value)}
              placeholder="0–100"
              disabled={busy || settingsLoading}
              required
            />
            <span className="text-xs font-normal text-[var(--on-surface-variant)]">
              Example: ₹1000 spare at 10% → company ₹100, partner ₹900.
            </span>
          </Field>
          <Field label="Customer convenience / platform fee type">
            <select
              className="w-full rounded-xl border border-[var(--outline-variant)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={customerFeeType}
              onChange={(e) => setCustomerFeeType(e.target.value)}
              disabled={busy || settingsLoading}
            >
              <option value="fixed">Fixed amount (₹)</option>
              <option value="percent">Percentage of service value</option>
            </select>
          </Field>
          <Field label={customerFeeType === 'percent' ? 'Customer platform fee (%)' : 'Customer platform fee (₹)'}>
            <Input
              type="number"
              min="0"
              max={customerFeeType === 'percent' ? '100' : undefined}
              step="0.01"
              value={customerFeeValue}
              onChange={(e) => setCustomerFeeValue(e.target.value)}
              placeholder={customerFeeType === 'percent' ? 'e.g. 10' : 'e.g. 100'}
              disabled={busy || settingsLoading}
              required
            />
            <span className="text-xs font-normal text-[var(--on-surface-variant)]">
              Charged to the customer in addition to service price. Not included in partner commission base.
              Visiting charge is no longer used for new bookings.
            </span>
          </Field>
          <Field label="Google Review URL">
            <Input
              type="url"
              value={googleReviewInput}
              onChange={(e) => setGoogleReviewInput(e.target.value)}
              placeholder="https://g.page/r/.../review"
              disabled={busy || settingsLoading}
            />
            <span className="text-xs font-normal text-[var(--on-surface-variant)]">
              Google Business listing review link — shown to customers after booking completion.
            </span>
          </Field>
          <Button type="submit" disabled={busy || settingsLoading} className="w-full sm:w-auto">
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>

      <Card className="space-y-5 rounded-3xl border border-[var(--outline-variant)]/50 p-5 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.35)] sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--on-surface)]">Global payment settings</h2>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            Default UPI and optional QR image for payouts when a technician has not added their own
            details. Stored in Firestore <code className="rounded bg-[var(--surface-high)] px-1.5 py-0.5 text-xs">settings/general</code>
            — updates in real time.
          </p>
        </div>

        <form className="space-y-5" onSubmit={onSaveGlobalPayment}>
          <Field label="UPI ID">
            <Input
              value={globalUpiInput}
              onChange={(e) => setGlobalUpiInput(e.target.value)}
              placeholder="e.g. repairseries@paytm"
              disabled={busy || settingsLoading}
              autoComplete="off"
            />
            <span className="text-xs font-normal text-[var(--on-surface-variant)]">
              Saved as lowercase (e.g. name@paytm → name@paytm).
            </span>
          </Field>
          <div>
            <span className="mb-2 block text-sm font-medium text-[var(--on-surface)]">Upload payment QR</span>
            <input
              ref={qrFileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="sr-only"
              onChange={onPickQrFile}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || settingsLoading || !storageConfigured}
                onClick={() => qrFileRef.current?.click()}
              >
                {qrImageUrl ? 'Replace QR' : 'Upload QR'}
              </Button>
              <span className="text-xs text-[var(--on-surface-variant)]">JPG, PNG, WebP · max 5 MB</span>
            </div>
            {!storageConfigured ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Cloudinary is not configured — QR upload disabled.
              </p>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-[var(--on-surface)]">QR preview</p>
            <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-[var(--outline-variant)]/60 bg-[var(--surface-low)]/40 p-4 sm:p-6">
              {qrImageUrl ? (
                <>
                  <img
                    src={qrImageUrl}
                    alt="Payment QR"
                    className="max-h-52 w-auto max-w-full rounded-xl border border-[var(--outline-variant)] bg-white object-contain p-2 shadow-inner"
                  />
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy || settingsLoading || !storageConfigured}
                      onClick={() => qrFileRef.current?.click()}
                    >
                      Replace QR
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={busy || settingsLoading}
                      onClick={onRemoveQr}
                    >
                      Remove QR
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-center text-sm text-[var(--on-surface-variant)]">No QR image uploaded yet.</p>
              )}
            </div>
          </div>

          <Button type="submit" disabled={busy || settingsLoading} className="w-full sm:w-auto">
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
