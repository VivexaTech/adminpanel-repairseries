import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui'
import { useApp } from '../context/useApp'
import { isFirebaseConfigured } from '../firebase/config'
import { createDoc, subscribeCollection } from '../services/firestore'
import { formatDateTime } from '../utils/helpers'

function outboxStatus(row) {
  if (row?.processed === true || row?.status === 'sent') return { label: 'Processed', tone: 'success' }
  if (row?.error || row?.status === 'failed') return { label: 'Failed', tone: 'danger' }
  return { label: 'Pending', tone: 'warning' }
}

export function NotificationsPage() {
  const { session } = useApp()
  const [outbox, setOutbox] = useState([])
  const [loadingOutbox, setLoadingOutbox] = useState(true)
  const [outboxDenied, setOutboxDenied] = useState(false)
  const [broadcasts, setBroadcasts] = useState([])
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', segmentNote: '' })

  useEffect(() => {
    if (!isFirebaseConfigured || !session?.id) {
      setLoadingOutbox(false)
      setLoadingBroadcasts(false)
      return undefined
    }

    setLoadingOutbox(true)
    setOutboxDenied(false)
    const unsubOutbox = subscribeCollection(
      'bookingNotificationOutbox',
      (rows) => {
        const sorted = [...(rows || [])].sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0
          const tb = b.createdAt?.toMillis?.() ?? 0
          return tb - ta
        })
        setOutbox(sorted.slice(0, 100))
        setLoadingOutbox(false)
        setOutboxDenied(false)
      },
      (err) => {
        console.warn('[notifications] outbox subscribe failed', err)
        setOutbox([])
        setLoadingOutbox(false)
        setOutboxDenied(true)
      },
      { orderByField: 'createdAt', orderDirection: 'desc', limit: 100 },
    )

    setLoadingBroadcasts(true)
    const unsubBroadcast = subscribeCollection(
      'broadcastNotifications',
      (rows) => {
        const sorted = [...(rows || [])].sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0
          const tb = b.createdAt?.toMillis?.() ?? 0
          return tb - ta
        })
        setBroadcasts(sorted.slice(0, 50))
        setLoadingBroadcasts(false)
      },
      () => {
        setBroadcasts([])
        setLoadingBroadcasts(false)
      },
      { orderByField: 'createdAt', orderDirection: 'desc', limit: 50 },
    )

    return () => {
      unsubOutbox?.()
      unsubBroadcast?.()
    }
  }, [session?.id])

  const pendingCount = useMemo(
    () => outbox.filter((r) => !(r.processed === true || r.status === 'sent')).length,
    [outbox],
  )

  const onBroadcast = async (e) => {
    e.preventDefault()
    const title = String(form.title || '').trim()
    const body = String(form.body || '').trim()
    if (!title || !body) {
      toast.error('Title and body are required.')
      return
    }
    setSaving(true)
    try {
      await createDoc('broadcastNotifications', {
        title,
        body,
        segmentNote: String(form.segmentNote || '').trim(),
        processed: false,
        status: 'queued',
        createdBy: session?.id || '',
        createdByEmail: session?.email || '',
      })
      setForm({ title: '', body: '', segmentNote: '' })
      toast.success('Broadcast queued in broadcastNotifications.')
    } catch (err) {
      toast.error(err?.message || 'Could not enqueue broadcast.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Monitor booking notification outbox and queue broadcast messages for later delivery."
      />

      <Card className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--on-surface)]">Broadcast</h2>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            Writes to <code className="rounded bg-[var(--surface-high)] px-1.5 py-0.5 text-xs">broadcastNotifications</code>.
            A Cloud Function or ops process can send these later. Segment note is informational only.
          </p>
        </div>
        <form className="space-y-4" onSubmit={onBroadcast}>
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
              placeholder="Announcement title"
              required
            />
          </Field>
          <Field label="Body">
            <Textarea
              value={form.body}
              onChange={(e) => setForm((c) => ({ ...c, body: e.target.value }))}
              placeholder="Message body"
              required
            />
          </Field>
          <Field label="Segment note (optional)">
            <Input
              value={form.segmentNote}
              onChange={(e) => setForm((c) => ({ ...c, segmentNote: e.target.value }))}
              placeholder="e.g. All customers in Aligarh / inactive 30 days"
            />
          </Field>
          <Button type="submit" disabled={saving}>
            {saving ? 'Queuing…' : 'Queue broadcast'}
          </Button>
        </form>
      </Card>

      <Card className="space-y-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[var(--on-surface)]">Booking outbox</h2>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Recent docs from <code className="rounded bg-[var(--surface-high)] px-1.5 py-0.5 text-xs">bookingNotificationOutbox</code>
              {!outboxDenied ? ` · ${pendingCount} pending` : ''}
            </p>
          </div>
        </div>

        {outboxDenied ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-[var(--on-surface)]">
            Client read of the outbox was denied (check that Firestore rules allow Super Admin / Booking Manager
            read on <code className="text-xs">bookingNotificationOutbox</code> and that rules are deployed). You can
            still queue broadcasts above.
          </div>
        ) : null}

        {loadingOutbox ? (
          <p className="text-sm text-[var(--on-surface-variant)]">Loading outbox…</p>
        ) : null}

        {!loadingOutbox && !outboxDenied && !outbox.length ? (
          <p className="text-sm text-[var(--on-surface-variant)]">No recent outbox items.</p>
        ) : null}

        <div className="space-y-3">
          {outbox.map((row) => {
            const st = outboxStatus(row)
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-[var(--outline-variant)]/60 bg-[var(--surface-low)]/30 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--on-surface)]">{row.title || 'Notification'}</p>
                    <p className="mt-1 text-sm text-[var(--on-surface-variant)]">{row.body || '—'}</p>
                    <p className="mt-2 text-xs text-[var(--on-surface-variant)]">
                      {row.eventType || '—'} · booking {row.bookingId || '—'} · customer {row.customerId || '—'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                      {row.createdAt ? formatDateTime(row.createdAt) : '—'}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="space-y-3 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-[var(--on-surface)]">Queued broadcasts</h2>
        {loadingBroadcasts ? (
          <p className="text-sm text-[var(--on-surface-variant)]">Loading…</p>
        ) : null}
        {!loadingBroadcasts && !broadcasts.length ? (
          <p className="text-sm text-[var(--on-surface-variant)]">No broadcasts queued yet.</p>
        ) : null}
        <div className="space-y-3">
          {broadcasts.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--outline-variant)]/60 bg-[var(--surface-low)]/30 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--on-surface)]">{row.title}</p>
                  <p className="mt-1 text-sm text-[var(--on-surface-variant)]">{row.body}</p>
                  {row.segmentNote ? (
                    <p className="mt-1 text-xs text-[var(--on-surface-variant)]">Segment: {row.segmentNote}</p>
                  ) : null}
                </div>
                <Badge tone={row.processed ? 'success' : 'warning'}>
                  {row.processed ? 'Processed' : row.status || 'queued'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
