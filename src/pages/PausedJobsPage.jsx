import { useMemo, useState } from 'react'
import { ExternalLink, PauseCircle } from 'lucide-react'
import { Badge, Card, PageHeader, SearchInput } from '../components/ui'
import { useApp } from '../context/useApp'
import { formatDateTime } from '../utils/helpers'

export function PausedJobsPage() {
  const { bookings, loading } = useApp()
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (bookings || [])
      .filter(
        (booking) =>
          booking.status === 'Paused' ||
          (Array.isArray(booking.pauseHistory) && booking.pauseHistory.length > 0),
      )
      .filter((booking) => {
        if (!q) return true
        return [
          booking.id,
          booking.serviceName,
          booking.customerName,
          booking.technicianName,
          booking.status,
          booking.currentPause?.reason,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => {
        const at = a.pausedAt?.toMillis?.() || a.updatedAt?.toMillis?.() || 0
        const bt = b.pausedAt?.toMillis?.() || b.updatedAt?.toMillis?.() || 0
        return bt - at
      })
  }, [bookings, search])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Paused Service Jobs"
        description="Live paused jobs and complete pause/resume evidence history."
        actions={
          <SearchInput value={search} onChange={setSearch} placeholder="Search jobs…" />
        }
      />

      {loading.bookings ? (
        <Card>
          <div className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Loading…</div>
        </Card>
      ) : null}

      {!loading.bookings && !rows.length ? (
        <Card className="flex flex-col items-center p-12 text-center">
          <PauseCircle className="size-10 text-[var(--on-surface-variant)]" />
          <h2 className="mt-3 font-semibold text-[var(--on-surface)]">No paused jobs</h2>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            Pause evidence will appear here when technicians pause active work.
          </p>
        </Card>
      ) : null}

      <div className="space-y-4">
        {rows.map((booking) => {
          const history = Array.isArray(booking.pauseHistory) ? booking.pauseHistory : []
          return (
            <Card key={booking.id} className="overflow-hidden p-0">
              <div className="flex flex-col gap-3 border-b border-[var(--outline-variant)]/50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--on-surface)]">
                      {booking.serviceName || 'Service'}
                    </h2>
                    <Badge tone={booking.status === 'Paused' ? 'warning' : 'success'}>
                      {booking.status === 'Paused' ? 'Currently paused' : 'Resumed'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                    {booking.customerName || 'Customer'} · {booking.technicianName || 'Technician'} · {booking.id}
                  </p>
                </div>
                <span className="text-xs text-[var(--on-surface-variant)]">
                  {history.length} pause event{history.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-2">
                {history.map((entry, index) => (
                  <div
                    key={entry.id || `${booking.id}-${index}`}
                    className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                          {entry.reason || 'Service paused'}
                        </h3>
                        <p className="mt-1 text-xs text-amber-800/70 dark:text-amber-300/70">
                          Paused {formatDateTime(entry.pausedAt)}
                          {entry.resumedAt ? ` · Resumed ${formatDateTime(entry.resumedAt)}` : ' · Not resumed'}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-black/20 dark:text-amber-200">
                        #{index + 1}
                      </span>
                    </div>

                    {entry.pauseNotes ? (
                      <p className="mt-3 text-sm text-amber-950/80 dark:text-amber-100/80">
                        {entry.pauseNotes}
                      </p>
                    ) : null}

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <EvidenceImage label="Damaged part" url={entry.damagedPartImageUrl} />
                      <EvidenceImage label="Installed / repaired" url={entry.resumePartImageUrl} />
                    </div>

                    {entry.resumeNotes ? (
                      <p className="mt-3 text-sm text-amber-950/80 dark:text-amber-100/80">
                        Resume: {entry.resumeNotes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function EvidenceImage({ label, url }) {
  if (!url) {
    return (
      <div>
        <div className="flex aspect-video items-center justify-center rounded-xl bg-black/5 text-xs text-[var(--on-surface-variant)] dark:bg-white/5">
          Not uploaded
        </div>
        <p className="mt-1.5 text-xs font-medium text-[var(--on-surface-variant)]">{label}</p>
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black/5">
        <img src={url} alt={label} loading="lazy" className="size-full object-cover" />
        <ExternalLink className="absolute right-2 top-2 size-4 text-white drop-shadow" />
      </div>
      <p className="mt-1.5 text-xs font-medium text-[var(--on-surface-variant)] group-hover:text-[var(--primary)]">
        {label}
      </p>
    </a>
  )
}
