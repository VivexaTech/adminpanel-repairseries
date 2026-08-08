import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select } from '../components/ui'
import { useApp } from '../context/useApp'
import { formatDateTime } from '../utils/helpers'

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'New', label: 'New' },
  { value: 'Assigned', label: 'Assigned' },
  { value: 'InProgress', label: 'In Progress' },
  { value: 'Started', label: 'Started' },
  { value: 'Paused', label: 'Paused' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Failed', label: 'Failed' },
]

function statusTone(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') return 'success'
  if (s === 'cancelled' || s === 'canceled' || s === 'failed') return 'danger'
  if (s === 'assigned' || s === 'started' || s === 'inprogress' || s === 'in progress') return 'info'
  if (s === 'paused') return 'warning'
  return 'warning'
}

function hasRevisitHistory(booking) {
  return Array.isArray(booking?.revisitHistory) && booking.revisitHistory.length > 0
}

function remainingRevisitsLabel(booking) {
  const remaining =
    booking?.revisitRemaining ??
    booking?.remainingRevisits ??
    booking?.freeRevisitsRemaining ??
    booking?.revisitEligibility?.remaining
  if (remaining == null || remaining === '') return null
  const n = Number(remaining)
  if (!Number.isFinite(n)) return String(remaining)
  return String(n)
}

export function RevisitsPage() {
  const { bookings, customers, loading, mutating, updateBookingRevisitRemaining } = useApp()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [remainingInput, setRemainingInput] = useState('')

  const customerMap = useMemo(
    () => Object.fromEntries((customers || []).map((c) => [c.id, c])),
    [customers],
  )

  const revisitRows = useMemo(() => {
    const rows = (bookings || []).filter(
      (b) => b?.isRevisit === true || Boolean(b?.parentBookingId) || hasRevisitHistory(b),
    )
    const q = search.trim().toLowerCase()
    return rows
      .filter((b) => {
        if (statusFilter !== 'all') {
          const status = String(b.status || '')
          if (statusFilter === 'InProgress') {
            const s = status.toLowerCase()
            if (s !== 'inprogress' && s !== 'in progress' && s !== 'started') return false
          } else if (status.toLowerCase() !== statusFilter.toLowerCase()) {
            return false
          }
        }
        if (!q) return true
        const customer = customerMap[b.customerId]
        const hay = [
          b.id,
          b.bookingCode,
          b.serviceName,
          b.parentBookingId,
          b.originalBookingId,
          b.revisitReason,
          b.revisitNotes,
          customer?.name,
          customer?.phone,
          customer?.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        const aDate = a.scheduledAt?.toDate?.() || a.dateTime || a.createdAt?.toDate?.() || a.createdAt || 0
        const bDate = b.scheduledAt?.toDate?.() || b.dateTime || b.createdAt?.toDate?.() || b.createdAt || 0
        return new Date(bDate) - new Date(aDate)
      })
  }, [bookings, search, statusFilter, customerMap])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Revisits"
        description="Bookings claimed as free revisits, plus parents that have revisit history."
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search booking, customer, reason…"
            />
            <Field label="Status">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        }
      />

      {loading.bookings ? (
        <Card>
          <p className="text-sm text-[var(--on-surface-variant)]">Loading revisits…</p>
        </Card>
      ) : null}

      {!loading.bookings && !revisitRows.length ? (
        <Card>
          <p className="text-sm text-[var(--on-surface-variant)]">No revisit bookings found.</p>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {revisitRows.map((booking) => {
          const customer = customerMap[booking.customerId]
          const parentId = booking.parentBookingId || booking.originalBookingId
          const remaining = remainingRevisitsLabel(booking)
          const images = Array.isArray(booking.revisitImages) ? booking.revisitImages.filter(Boolean) : []
          return (
            <Card key={booking.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-[var(--on-surface)]">
                      {booking.bookingCode || booking.id}
                    </h3>
                    {booking.isRevisit === true || parentId ? (
                      <Badge tone="info">Revisit</Badge>
                    ) : null}
                    {hasRevisitHistory(booking) && booking.isRevisit !== true ? (
                      <Badge tone="warning">Has revisit history</Badge>
                    ) : null}
                    <Badge tone={statusTone(booking.status)}>{booking.status || 'Unknown'}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                    {booking.serviceName || 'Service'} · {customer?.name || booking.customerId || '—'}
                  </p>
                  <p className="text-sm text-[var(--on-surface-variant)]">
                    Scheduled:{' '}
                    {formatDateTime(
                      booking.scheduledAt?.toDate?.() || booking.dateTime || booking.scheduledAt,
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-[var(--outline-variant)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] hover:bg-[var(--surface-lowest)]"
                  onClick={() => {
                    setSelected(booking)
                    setRemainingInput(remainingRevisitsLabel(booking) ?? '')
                  }}
                >
                  View details
                </button>
              </div>

              {parentId ? (
                <p className="text-sm text-[var(--on-surface-variant)]">
                  Original booking:{' '}
                  <Link className="font-medium text-[var(--primary)] underline" to="/bookings">
                    {parentId}
                  </Link>
                </p>
              ) : null}

              {remaining != null ? (
                <p className="text-sm text-[var(--on-surface-variant)]">
                  Remaining free revisits: <span className="font-semibold text-[var(--on-surface)]">{remaining}</span>
                </p>
              ) : null}

              {booking.revisitReason ? (
                <p className="text-sm text-[var(--on-surface)]">
                  Reason: <span className="text-[var(--on-surface-variant)]">{booking.revisitReason}</span>
                </p>
              ) : null}

              {booking.revisitNotes ? (
                <p className="whitespace-pre-wrap text-sm text-[var(--on-surface-variant)]">{booking.revisitNotes}</p>
              ) : null}

              {images.length ? (
                <div className="flex flex-wrap gap-2">
                  {images.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt=""
                        className="h-16 w-16 rounded-xl border border-[var(--outline-variant)] object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : null}

              {hasRevisitHistory(booking) ? (
                <p className="text-xs text-[var(--on-surface-variant)]">
                  Revisit history entries: {booking.revisitHistory.length}
                </p>
              ) : null}
            </Card>
          )
        })}
      </div>

      <Modal
        open={Boolean(selected)}
        title={selected ? `Revisit ${selected.bookingCode || selected.id}` : 'Revisit'}
        onClose={() => {
          setSelected(null)
          setRemainingInput('')
        }}
        className="max-w-3xl"
      >
        {selected ? (
          <div className="space-y-4 text-sm text-[var(--on-surface)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <p>
                <span className="text-[var(--on-surface-variant)]">Status:</span> {selected.status || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Service:</span>{' '}
                {selected.serviceName || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Customer:</span>{' '}
                {customerMap[selected.customerId]?.name || selected.customerId || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Parent booking:</span>{' '}
                {selected.parentBookingId || selected.originalBookingId || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Reason:</span>{' '}
                {selected.revisitReason || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Remaining:</span>{' '}
                {remainingRevisitsLabel(selected) ?? '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--outline-variant)] p-3">
              <Field label="Adjust remaining free revisits">
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    type="number"
                    min="0"
                    className="max-w-[140px]"
                    value={remainingInput}
                    onChange={(e) => setRemainingInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    disabled={Boolean(mutating.bookingRevisitRemaining)}
                    onClick={async () => {
                      try {
                        await updateBookingRevisitRemaining({
                          bookingId: selected.id,
                          remaining: remainingInput,
                        })
                        setSelected((cur) =>
                          cur
                            ? {
                                ...cur,
                                revisitRemaining: Math.max(0, Math.round(Number(remainingInput))),
                                remainingRevisits: Math.max(0, Math.round(Number(remainingInput))),
                                freeRevisitsRemaining: Math.max(0, Math.round(Number(remainingInput))),
                              }
                            : cur,
                        )
                      } catch (e) {
                        toast.error(e.message)
                      }
                    }}
                  >
                    {mutating.bookingRevisitRemaining ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </Field>
              <p className="mt-2 text-xs text-[var(--on-surface-variant)]">
                Syncs <code>revisitRemaining</code>, <code>remainingRevisits</code>, and{' '}
                <code>freeRevisitsRemaining</code>.
              </p>
            </div>
            {selected.revisitNotes ? (
              <div>
                <p className="mb-1 font-medium">Notes</p>
                <p className="whitespace-pre-wrap text-[var(--on-surface-variant)]">{selected.revisitNotes}</p>
              </div>
            ) : null}
            {Array.isArray(selected.revisitImages) && selected.revisitImages.length ? (
              <div>
                <p className="mb-2 font-medium">Images</p>
                <div className="flex flex-wrap gap-2">
                  {selected.revisitImages.filter(Boolean).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt=""
                        className="h-24 w-24 rounded-xl border border-[var(--outline-variant)] object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
            {Array.isArray(selected.revisitHistory) && selected.revisitHistory.length ? (
              <div>
                <p className="mb-2 font-medium">Revisit history</p>
                <ul className="space-y-2">
                  {selected.revisitHistory.map((entry, idx) => (
                    <li
                      key={entry?.revisitBookingId || entry?.id || idx}
                      className="rounded-2xl border border-[var(--outline-variant)] px-3 py-2 text-[var(--on-surface-variant)]"
                    >
                      {entry?.revisitBookingId || entry?.id || `Entry ${idx + 1}`}
                      {entry?.reason ? ` · ${entry.reason}` : ''}
                      {entry?.createdAt
                        ? ` · ${formatDateTime(entry.createdAt?.toDate?.() || entry.createdAt)}`
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
