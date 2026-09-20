import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui'
import { useApp } from '../context/useApp'
import { formatDateTime } from '../utils/helpers'

function formatStamp(updatedAt) {
  if (!updatedAt) return '—'
  try {
    const d = typeof updatedAt.toDate === 'function' ? updatedAt.toDate() : new Date(updatedAt)
    if (Number.isNaN(d.getTime())) return '—'
    return formatDateTime(d)
  } catch {
    return '—'
  }
}

export function SupportLegalPage() {
  const { appSettings, updateAppPublicSettings, loading, mutating } = useApp()
  const [supportPhone, setSupportPhone] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [aboutApp, setAboutApp] = useState('')
  const [customerTerms, setCustomerTerms] = useState('')
  const [customerPrivacyPolicy, setCustomerPrivacyPolicy] = useState('')
  const [partnerTerms, setPartnerTerms] = useState('')
  const [partnerPrivacyPolicy, setPartnerPrivacyPolicy] = useState('')

  useEffect(() => {
    setSupportPhone(appSettings?.supportPhone || '')
    setSupportEmail(appSettings?.supportEmail || '')
    setAboutApp(appSettings?.aboutApp || '')
    setCustomerTerms(appSettings?.customerTerms || '')
    setCustomerPrivacyPolicy(appSettings?.customerPrivacyPolicy || '')
    setPartnerTerms(appSettings?.partnerTerms || '')
    setPartnerPrivacyPolicy(appSettings?.partnerPrivacyPolicy || '')
  }, [appSettings])

  const busy = Boolean(mutating.appSettings)
  const settingsLoading = loading.appSettings

  const save = async (patch) => {
    try {
      await updateAppPublicSettings(patch)
    } catch (err) {
      toast.error(err?.message || 'Could not save.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Support & Legal"
        description="Single source of truth stored in Firestore settings/app. Customer App, Customer Website, and Partner App read these values."
      />

      <Card className="space-y-5">
        <h2 className="text-lg font-semibold text-[var(--on-surface)]">Support details</h2>
        <p className="text-sm text-[var(--on-surface-variant)]">
          Last updated: {settingsLoading ? 'Loading…' : formatStamp(appSettings?.updatedAt)}
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save({ supportPhone, supportEmail, aboutApp })
          }}
        >
          <Field label="Support phone">
            <Input
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="+91 98765 43210"
              disabled={busy || settingsLoading}
            />
          </Field>
          <Field label="Support email">
            <Input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@repairseries.com"
              disabled={busy || settingsLoading}
            />
          </Field>
          <Field label="About app (optional extra line in Partner App)">
            <Textarea
              value={aboutApp}
              onChange={(e) => setAboutApp(e.target.value)}
              rows={3}
              disabled={busy || settingsLoading}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || settingsLoading}>
              {busy ? 'Saving…' : 'Save support details'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-5">
        <h2 className="text-lg font-semibold text-[var(--on-surface)]">Customer legal</h2>
        <p className="text-xs text-[var(--on-surface-variant)]">
          Shown in Customer App and Customer Website. Updated at:{' '}
          {formatStamp(appSettings?.customerTermsUpdatedAt)} (Terms) ·{' '}
          {formatStamp(appSettings?.customerPrivacyUpdatedAt)} (Privacy)
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save({ customerTerms, customerPrivacyPolicy })
          }}
        >
          <Field label="Customer Terms & Conditions">
            <Textarea
              value={customerTerms}
              onChange={(e) => setCustomerTerms(e.target.value)}
              rows={10}
              className="min-h-40"
              disabled={busy || settingsLoading}
            />
          </Field>
          <Field label="Customer Privacy Policy">
            <Textarea
              value={customerPrivacyPolicy}
              onChange={(e) => setCustomerPrivacyPolicy(e.target.value)}
              rows={10}
              className="min-h-40"
              disabled={busy || settingsLoading}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || settingsLoading}>
              {busy ? 'Saving…' : 'Save customer legal'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-5">
        <h2 className="text-lg font-semibold text-[var(--on-surface)]">Partner legal</h2>
        <p className="text-xs text-[var(--on-surface-variant)]">
          Shown in Partner App. Updated at: {formatStamp(appSettings?.partnerTermsUpdatedAt)} (Terms) ·{' '}
          {formatStamp(appSettings?.partnerPrivacyUpdatedAt)} (Privacy)
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save({ partnerTerms, partnerPrivacyPolicy })
          }}
        >
          <Field label="Partner Terms & Conditions">
            <Textarea
              value={partnerTerms}
              onChange={(e) => setPartnerTerms(e.target.value)}
              rows={10}
              className="min-h-40"
              disabled={busy || settingsLoading}
            />
          </Field>
          <Field label="Partner Privacy Policy">
            <Textarea
              value={partnerPrivacyPolicy}
              onChange={(e) => setPartnerPrivacyPolicy(e.target.value)}
              rows={10}
              className="min-h-40"
              disabled={busy || settingsLoading}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || settingsLoading}>
              {busy ? 'Saving…' : 'Save partner legal'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
