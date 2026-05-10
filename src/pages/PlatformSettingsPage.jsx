import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, PageHeader } from '../components/ui'
import { useApp } from '../context/useApp'
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
  const { platformSettings, updatePlatformGeneral, loading, mutating } = useApp()
  const [radiusKm, setRadiusKm] = useState('')
  const [commission, setCommission] = useState('')
  const [addonCommission, setAddonCommission] = useState('')

  useEffect(() => {
    const r = platformSettings?.defaultTechnicianServiceRadiusKm
    const c = platformSettings?.platformCommissionPercent
    const a = platformSettings?.addonFeePercent
    setRadiusKm(r != null && r !== '' ? String(r) : '')
    setCommission(c != null && c !== '' ? String(c) : '')
    setAddonCommission(a != null && a !== '' ? String(a) : '')
  }, [
    platformSettings?.updatedAt,
    platformSettings?.defaultTechnicianServiceRadiusKm,
    platformSettings?.platformCommissionPercent,
    platformSettings?.addonFeePercent,
  ])

  const onSubmit = async (e) => {
    e.preventDefault()
    const r = Number(radiusKm)
    const c = Number(commission)
    const a = Number(addonCommission)
    if (!Number.isFinite(r) || r <= 0) {
      toast.error('Technician service radius must be a positive number (e.g. 5, 7, 10).')
      return
    }
    if (!Number.isFinite(c) || c < 0 || c > 100) {
      toast.error('Platform commission must be between 0 and 100.')
      return
    }
    if (!Number.isFinite(a) || a < 0 || a > 100) {
      toast.error('Add-on fee percent must be between 0 and 100.')
      return
    }
    try {
      await updatePlatformGeneral({
        defaultTechnicianServiceRadiusKm: r,
        platformCommissionPercent: c,
        addonFeePercent: a,
      })
    } catch (err) {
      toast.error(err?.message || 'Could not save settings.')
    }
  }

  const busy = Boolean(mutating.platformSettings)
  const settingsLoading = loading.platformSettings

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform Settings"
        description="Live values from Firestore settings/general. New bookings snapshot platform and add-on fee percents; changing these does not alter existing bookings."
      />

      <Card className="max-w-lg space-y-6">
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
          <Field label="Technician Service Radius (KM)">
            <Input
              type="number"
              min="0"
              step="0.1"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              placeholder="e.g. 10"
              disabled={busy || settingsLoading}
              required
            />
          </Field>
          <Field label="Platform fee on original booking (%)">
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
              Applied only to service + visiting (frozen amounts per booking).
            </span>
          </Field>
          <Field label="Platform fee on approved add-ons (%)">
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
            <span className="text-xs font-normal text-[var(--on-surface-variant)]">
              Separate rate for extra / additional services after customer approval.
            </span>
          </Field>
          <Button type="submit" disabled={busy || settingsLoading} className="w-full sm:w-auto">
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
