import { useMemo, useState } from 'react'
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore'
import { Download, ExternalLink, History, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Modal, PageHeader, SearchInput } from '../components/ui'
import { useApp } from '../context/useApp'
import { db } from '../firebase/config'
import { exportRows } from '../services/csv'
import { formatDateTime } from '../utils/helpers'

function readLatest(customer) {
  const row = customer?.latestLocation || {}
  return {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    fullAddress: String(row.fullAddress || customer?.address || '').trim(),
    city: String(row.city || '').trim(),
    state: String(row.state || '').trim(),
    pincode: String(row.pincode || '').trim(),
    deviceType: String(row.deviceType || '').trim(),
    timestamp: row.timestamp || customer?.locationUpdatedAt,
  }
}

function mapsUrl(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return ''
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}

export function LocationHistoryPage() {
  const { customers, loading } = useApp()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (customers || [])
      .filter((customer) => customer.latestLocation)
      .filter((customer) => {
        if (!q) return true
        const latest = readLatest(customer)
        return [
          customer.name,
          customer.email,
          customer.phone,
          latest.fullAddress,
          latest.city,
          latest.pincode,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => {
        const at = readLatest(a).timestamp?.toMillis?.() || 0
        const bt = readLatest(b).timestamp?.toMillis?.() || 0
        return bt - at
      })
  }, [customers, search])

  const openTimeline = async (customer) => {
    setSelected(customer)
    setTimeline([])
    setTimelineLoading(true)
    try {
      const snapshot = await getDocs(
        query(
          collection(db, 'customers', customer.id, 'locationHistory'),
          orderBy('timestamp', 'desc'),
          limit(200),
        ),
      )
      setTimeline(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    } catch (error) {
      toast.error(error?.message || 'Could not load location timeline.')
    } finally {
      setTimelineLoading(false)
    }
  }

  const exportTimeline = () => {
    if (!selected || !timeline.length) return
    exportRows(
      `location-history-${selected.id}.csv`,
      timeline.map((item) => ({
        customer: selected.name || selected.email || selected.id,
        latitude: item.latitude,
        longitude: item.longitude,
        fullAddress: item.fullAddress,
        city: item.city,
        state: item.state,
        pincode: item.pincode,
        deviceType: item.deviceType,
        source: item.source,
        timestamp: formatDateTime(item.timestamp),
      })),
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Location History"
        description="Latest launch location and append-only customer location timeline."
        actions={
          <SearchInput value={search} onChange={setSearch} placeholder="Search customer or area…" />
        }
      />

      <Card className="overflow-hidden p-0">
        {loading.customers ? (
          <div className="p-12 text-center text-sm text-[var(--on-surface-variant)]">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-[var(--surface-low)] text-[var(--on-surface-variant)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Latest address</th>
                  <th className="px-4 py-3 font-medium">Device</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => {
                  const latest = readLatest(customer)
                  const map = mapsUrl(latest.latitude, latest.longitude)
                  return (
                    <tr key={customer.id} className="border-t border-[var(--outline-variant)]/45">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--on-surface)]">
                          {customer.name || 'Unnamed customer'}
                        </div>
                        <div className="text-xs text-[var(--on-surface-variant)]">
                          {customer.phone || customer.email || customer.id}
                        </div>
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <div className="line-clamp-2 text-[var(--on-surface)]">
                          {latest.fullAddress || 'Coordinates only'}
                        </div>
                        <div className="mt-1 text-xs text-[var(--on-surface-variant)]">
                          {[latest.city, latest.state, latest.pincode].filter(Boolean).join(', ')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)]">
                        {latest.deviceType || '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)]">
                        {formatDateTime(latest.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {map ? (
                            <a
                              href={map}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-xl border border-[var(--outline-variant)] px-3 py-2 text-xs font-semibold text-[var(--primary)]"
                            >
                              <MapPin className="size-3.5" /> Map
                            </a>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            className="gap-1"
                            onClick={() => void openTimeline(customer)}
                          >
                            <History className="size-3.5" /> Timeline
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-[var(--on-surface-variant)]">
                      No captured customer locations yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        title={`Location timeline · ${selected?.name || 'Customer'}`}
        onClose={() => setSelected(null)}
        className="max-w-3xl"
      >
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            disabled={!timeline.length}
            onClick={exportTimeline}
          >
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {timelineLoading ? (
            <div className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Loading…</div>
          ) : null}
          {!timelineLoading &&
            timeline.map((item) => {
              const map = mapsUrl(Number(item.latitude), Number(item.longitude))
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[var(--outline-variant)]/60 bg-[var(--surface-low)]/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[var(--on-surface)]">
                        {item.fullAddress || `${item.latitude}, ${item.longitude}`}
                      </div>
                      <div className="mt-1 text-xs text-[var(--on-surface-variant)]">
                        {[item.city, item.state, item.pincode].filter(Boolean).join(', ')}
                      </div>
                      <div className="mt-2 text-xs text-[var(--on-surface-variant)]">
                        {formatDateTime(item.timestamp)} · {item.deviceType || item.source || 'Unknown device'}
                      </div>
                    </div>
                    {map ? (
                      <a href={map} target="_blank" rel="noreferrer" className="text-[var(--primary)]">
                        <ExternalLink className="size-4" />
                      </a>
                    ) : null}
                  </div>
                </div>
              )
            })}
          {!timelineLoading && !timeline.length ? (
            <div className="p-8 text-center text-sm text-[var(--on-surface-variant)]">
              No history records for this customer.
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
