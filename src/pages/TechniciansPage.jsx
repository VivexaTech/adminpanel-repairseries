import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
<<<<<<< HEAD
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select } from '../components/ui'
import { TechnicianCard } from '../components/TechnicianCard'
import { useApp } from '../context/useApp'
=======
import { Button, Badge, Card, Field, Input, Modal, PageHeader, SearchInput, Select } from '../components/ui'
import { TechnicianSettlementSection } from '../components/TechnicianSettlementSection'
import { useApp } from '../context/useApp'
import { currency } from '../utils/helpers'
>>>>>>> 4a4f0d8c0be02f36b3ee800b83c8d3ef82c5f535
import { getStoredBookingTotalDeduction, getStoredTechnicianPayout } from '../utils/bookingStoredAmounts'
import { subscribeTechnicianBusySlots } from '../services/technicianBusySlots'
import {
  SCHED_DAY_END_EXCL,
<<<<<<< HEAD
  SCHED_DAY_START_HOUR,
=======
>>>>>>> 4a4f0d8c0be02f36b3ee800b83c8d3ef82c5f535
  slotDisplayKind,
  slotLabelFromIndex,
  TIMEZONE,
} from '../utils/technicianSlots'

function TechnicianSlotCalendar({ technicianId, dateKey }) {
  const [busyDocs, setBusyDocs] = useState([])
  useEffect(() => {
    if (!technicianId) return undefined
    return subscribeTechnicianBusySlots(
      technicianId,
      (docs) => {
        setBusyDocs(docs.filter((d) => String(d.date || '') === dateKey))
      },
<<<<<<< HEAD
      () => { },
=======
      () => {},
>>>>>>> 4a4f0d8c0be02f36b3ee800b83c8d3ef82c5f535
    )
  }, [technicianId, dateKey])

  const bySlotIndex = useMemo(() => {
    const m = new Map()
    for (const d of busyDocs) {
      const i = Number(d.slotIndex)
      if (Number.isFinite(i)) m.set(i, d)
    }
    return m
  }, [busyDocs])

  const nSlots = SCHED_DAY_END_EXCL - SCHED_DAY_START_HOUR
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {Array.from({ length: nSlots }, (_, i) => {
        const slotIndex = i + 1
        const doc = bySlotIndex.get(slotIndex)
        const kind = doc ? slotDisplayKind(doc.reason, doc.status) : 'free'
        const label = slotLabelFromIndex(slotIndex)
        const styles =
          kind === 'free'
            ? 'border-emerald-500/50 bg-emerald-500/10'
            : kind === 'booking'
              ? 'border-orange-500/50 bg-orange-500/10'
              : 'border-red-500/50 bg-red-500/10'
        const sub =
          kind === 'free'
            ? 'Available'
            : kind === 'booking'
              ? doc?.bookingId
                ? `Booked · ${doc.bookingId}`
                : 'Booked'
              : 'Manual block'
        return (
          <div key={slotIndex} className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>
            <div className="font-medium text-slate-900 dark:text-slate-100">{label}</div>
            <div className="text-xs text-slate-600 dark:text-slate-400">{sub}</div>
          </div>
        )
      })}
    </div>
  )
}

export function TechniciansPage() {
  const {
    technicians,
    bookings,
    categories,
    platformSettings,
    upsertTechnician,
    deleteTechnician,
    loading,
    mutating,
  } = useApp()
  const resolvedDefaultRadius = useMemo(() => {
    const r = Number(platformSettings?.defaultTechnicianServiceRadiusKm)
    return Number.isFinite(r) && r > 0 ? r : 10
  }, [platformSettings?.defaultTechnicianServiceRadiusKm])

  const buildEmptyForm = () => ({
    id: '',
    name: '',
    phone: '',
    email: '',
    completedBookings: 0,
    pendingBookings: 0,
    status: 'Available',
    categoryId: '',
    skills: '',
    areaAddress: '',
    latitude: '',
    longitude: '',
    serviceRadius: String(resolvedDefaultRadius),
  })

  const [search, setSearch] = useState('')
  const [slotCalendar, setSlotCalendar] = useState(null)
  const [calendarDate, setCalendarDate] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date()),
  )
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => ({
    id: '',
    name: '',
    phone: '',
    email: '',
    completedBookings: 0,
    pendingBookings: 0,
    status: 'Available',
    categoryId: '',
    skills: '',
    areaAddress: '',
    latitude: '',
    longitude: '',
    serviceRadius: '10',
  }))

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  const filtered = useMemo(
    () =>
      technicians.filter((technician) =>
        [
          technician.name,
          technician.email,
          technician.phone,
          technician.skills.join(' '),
          technician.areaAddress || '',
          categoryMap[technician.categoryId] || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [technicians, search, categoryMap],
  )

  const technicianStats = useMemo(() => {
    const stats = {}

    for (const booking of bookings) {
      const techId = booking.technicianId
      if (!techId) continue

      if (!stats[techId]) {
        stats[techId] = { completed: 0, pending: 0, technicianEarnings: 0, platformDeduction: 0 }
      }

      if (booking.status === 'Completed') {
        stats[techId].completed += 1
        stats[techId].technicianEarnings += getStoredTechnicianPayout(booking)
        stats[techId].platformDeduction += getStoredBookingTotalDeduction(booking)
      } else if (['Assigned', 'New', 'Pending', 'Started'].includes(booking.status)) {
        stats[techId].pending += 1
      }
    }

    return stats
  }, [bookings])

  const submit = (event) => {
    event.preventDefault()
    if (!String(form.categoryId || '').trim()) {
      toast.error('Select a technician category.')
      return
    }
    upsertTechnician({
      ...form,
      completedBookings: Number(form.completedBookings),
      pendingBookings: Number(form.pendingBookings),
      categoryId: form.categoryId?.trim() || '',
      areaAddress: form.areaAddress?.trim() || '',
      latitude: form.latitude === '' ? undefined : form.latitude,
      longitude: form.longitude === '' ? undefined : form.longitude,
      serviceRadius:
        Number(form.serviceRadius) > 0 ? Number(form.serviceRadius) : resolvedDefaultRadius,
    })
    setForm(buildEmptyForm())
    setOpen(false)
  }

  const edit = (technician) => {
    setForm({
      ...buildEmptyForm(),
      ...technician,
      categoryId: technician.categoryId ?? '',
      areaAddress: technician.areaAddress ?? '',
      latitude:
        technician.latitude != null && technician.latitude !== '' ? String(technician.latitude) : '',
      longitude:
        technician.longitude != null && technician.longitude !== '' ? String(technician.longitude) : '',
      serviceRadius:
        technician.serviceRadius != null && technician.serviceRadius !== ''
          ? String(technician.serviceRadius)
          : String(resolvedDefaultRadius),
      completedBookings: technician.completedBookings ?? 0,
      pendingBookings: technician.pendingBookings ?? 0,
    })
    setOpen(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Technician Management"
<<<<<<< HEAD
        description="Staff, slots, and settlements — earnings and payouts sync in real time from Firestore."
=======
        description="Staff, slots, settlement — payout & earning ledger Firestore mein realtime."
>>>>>>> 4a4f0d8c0be02f36b3ee800b83c8d3ef82c5f535
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search technicians..." />
            <Button
              onClick={() => {
                setForm(buildEmptyForm())
                setOpen(true)
              }}
            >
              Add Technician
            </Button>
          </>
        }
      />

      <div className="grid w-full min-w-0 gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
        {loading.technicians ? (
          <div className="[grid-column:1/-1]">
            <Card>
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading technicians...</p>
            </Card>
          </div>
        ) : null}
        {filtered.map((technician) => (
          <TechnicianCard
            key={technician.id}
            technician={technician}
            categoryLabel={categoryMap[technician.categoryId] || '— Set in edit'}
            bookingStats={
              technicianStats[technician.id] || {
                completed: 0,
                pending: 0,
                technicianEarnings: 0,
                platformDeduction: 0,
              }
<<<<<<< HEAD
            }
            onEdit={() => edit(technician)}
            onSlotCalendar={() => {
              setCalendarDate(new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date()))
              setSlotCalendar({ id: technician.id, name: technician.name })
            }}
            onDelete={() => deleteTechnician(technician.id)}
            mutating={mutating}
          />
=======
              return (
                <>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{technician.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{technician.email}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Category:{' '}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {categoryMap[technician.categoryId] || '— Set in edit'}
                  </span>
                </p>
              </div>
              <Badge tone={technician.status === 'Available' ? 'success' : 'warning'}>
                {technician.status}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
              <p>Phone: {technician.phone}</p>
              <p>
                Service area: {technician.areaAddress?.trim() ? technician.areaAddress : '—'}
              </p>
              <p>
                Radius:{' '}
                {Number(technician.serviceRadius) > 0 ? Number(technician.serviceRadius) : 10} km
                {technician.latitude != null &&
                technician.longitude != null &&
                Number.isFinite(Number(technician.latitude)) &&
                Number.isFinite(Number(technician.longitude)) ? (
                  <span className="text-slate-500 dark:text-slate-400">
                    {' '}
                    • {Number(technician.latitude).toFixed(4)}, {Number(technician.longitude).toFixed(4)}
                  </span>
                ) : (
                  <span className="ml-1 text-amber-700 dark:text-amber-300"> • Set lat/lng for geo assign</span>
                )}
              </p>
              <p>Completed: {stats.completed}</p>
              <p>Pending: {stats.pending}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bookings se technician share (reference): {currency(stats.technicianEarnings)}
              </p>
              <p className="font-medium text-slate-600 dark:text-slate-400">
                Platform deductions (bookings): {currency(stats.platformDeduction)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">Completed bookings — display only</p>
              <p>Skills: {technician.skills.join(', ')}</p>
            </div>
            <TechnicianSettlementSection technician={technician} />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => edit(technician)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCalendarDate(new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date()))
                  setSlotCalendar({ id: technician.id, name: technician.name })
                }}
              >
                Slot calendar
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteTechnician(technician.id)}
                disabled={Boolean(mutating.technicianDelete)}
              >
                Delete
              </Button>
            </div>
                </>
              )
            })()}
          </Card>
>>>>>>> 4a4f0d8c0be02f36b3ee800b83c8d3ef82c5f535
        ))}
      </div>

      <Modal
        open={open}
        title={form.id ? 'Edit Technician' : 'Add Technician'}
        onClose={() => {
          setOpen(false)
          setForm(buildEmptyForm())
        }}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <Field label="Name">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </Field>
          <Field label="Category">
            <Select
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              required
            >
              <option value="">Select category (e.g. AC, Plumber)</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option>Available</option>
              <option>Busy</option>
              <option>Offline</option>
            </Select>
          </Field>
          <Field label="Completed Bookings">
            <Input type="number" value={form.completedBookings} onChange={(event) => setForm({ ...form, completedBookings: event.target.value })} />
          </Field>
          <Field label="Pending Bookings">
            <Input type="number" value={form.pendingBookings} onChange={(event) => setForm({ ...form, pendingBookings: event.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Skills (comma separated)">
              <Input value={form.skills} onChange={(event) => setForm({ ...form, skills: event.target.value })} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Area address (service base)">
              <Input
                value={form.areaAddress}
                onChange={(event) => setForm({ ...form, areaAddress: event.target.value })}
                placeholder="e.g. Connaught Place, New Delhi"
              />
            </Field>
          </div>
          <Field label="Latitude (WGS84)">
            <Input
              type="number"
              step="any"
              value={form.latitude}
              onChange={(event) => setForm({ ...form, latitude: event.target.value })}
              placeholder="Required for distance-based assignment"
            />
          </Field>
          <Field label="Longitude (WGS84)">
            <Input
              type="number"
              step="any"
              value={form.longitude}
              onChange={(event) => setForm({ ...form, longitude: event.target.value })}
              placeholder="Required for distance-based assignment"
            />
          </Field>
          <Field label="Service radius (km)">
            <Input
              type="number"
              min="1"
              step="0.1"
              value={form.serviceRadius}
              onChange={(event) => setForm({ ...form, serviceRadius: event.target.value })}
            />
          </Field>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(mutating.technician)}>
              {mutating.technician ? 'Saving...' : 'Save Technician'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(slotCalendar)}
        title={slotCalendar ? `Hourly slots — ${slotCalendar.name}` : ''}
        onClose={() => setSlotCalendar(null)}
        bodyClassName="max-h-[70vh] overflow-y-auto pr-1"
      >
        {slotCalendar ? (
          <>
            <Field label={`Date (IST · ${TIMEZONE})`}>
              <Input
                type="date"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
              />
            </Field>
            <p className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5">
                Available
              </span>
              <span className="rounded border border-orange-500/50 bg-orange-500/10 px-2 py-0.5">
                Booked
              </span>
              <span className="rounded border border-red-500/50 bg-red-500/10 px-2 py-0.5">Manual</span>
            </p>
            <TechnicianSlotCalendar technicianId={slotCalendar.id} dateKey={calendarDate} />
          </>
        ) : null}
      </Modal>
    </div>
  )
}
