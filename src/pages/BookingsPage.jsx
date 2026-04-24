import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { exportRows } from '../services/csv'
import {
  currency,
  formatDateTime,
  getBookingAmount,
  getBookingBaseAmount,
  getBookingEarningSplit,
  normalizeBookingAddOnServices,
} from '../utils/helpers'
import {
  addressToFormString,
  bookingAddressSearchText,
  formatBookingAddressForDisplay,
  formatBookingAddressShort,
  normalizeBookingAddressForStorage,
} from '../utils/bookingAddress'
import { ROLES } from '../utils/rbac'
import { getBookingsForDay } from '../services/firestore'

const statusPriority = { New: 1, Assigned: 2, Started: 3, Pending: 3, Completed: 5 }

function AddonServicesList({ addOns }) {
  if (!addOns.length) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No additional services</p>
  }
  return (
    <ul className="space-y-1.5">
      {addOns.map((a, i) => (
        <li
          key={`${a.serviceName}-${i}`}
          className="flex justify-between gap-3 text-sm text-slate-700 dark:text-slate-200"
        >
          <span className="min-w-0 flex-1 truncate">{a.serviceName}</span>
          <span className="shrink-0 tabular-nums font-medium">{currency(a.price)}</span>
        </li>
      ))}
    </ul>
  )
}

function BookingPricingSection({ booking, compact = false }) {
  const addOns = normalizeBookingAddOnServices(booking)
  const baseAmount = getBookingBaseAmount(booking)
  const total = getBookingAmount(booking)
  const split = getBookingEarningSplit(booking)
  const baseName = booking.serviceName || 'Base service'

  const commission = (
    <div className="space-y-1 text-slate-600 dark:text-slate-400">
      <p className="flex justify-between text-sm">
        <span>Platform cut (30%)</span>
        <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
          {currency(split.platformCut)}
        </span>
      </p>
      <p className="flex justify-between text-sm">
        <span>Technician earning (70%)</span>
        <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
          {currency(split.technicianEarning)}
        </span>
      </p>
    </div>
  )

  if (compact) {
    return (
      <div className="mt-1 space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Base service
          </p>
          <p className="mt-1 flex justify-between gap-2 text-slate-800 dark:text-slate-100">
            <span className="min-w-0 truncate">{baseName}</span>
            <span className="shrink-0 tabular-nums font-semibold">{currency(baseAmount)}</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Additional services
          </p>
          <div className="mt-1">
            <AddonServicesList addOns={addOns} />
          </div>
        </div>
        <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 px-3 py-2.5 dark:border-blue-500/25 dark:bg-blue-950/25">
          <p className="flex justify-between text-base font-bold text-slate-900 dark:text-white">
            <span>Total amount</span>
            <span className="tabular-nums text-blue-700 dark:text-blue-300">{currency(total)}</span>
          </p>
        </div>
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">{commission}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-slate-600 dark:bg-slate-800/40">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Base service
        </h4>
        <p className="mt-2 flex justify-between gap-3 text-slate-900 dark:text-white">
          <span className="min-w-0 font-medium">{baseName}</span>
          <span className="shrink-0 tabular-nums text-lg font-semibold">{currency(baseAmount)}</span>
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-slate-600 dark:bg-slate-800/40">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Additional services
        </h4>
        <div className="mt-3">
          <AddonServicesList addOns={addOns} />
        </div>
      </div>
      <div className="rounded-xl border-2 border-blue-500/35 bg-gradient-to-br from-blue-50/90 to-white p-4 dark:border-blue-400/30 dark:from-blue-950/40 dark:to-slate-900/60">
        <p className="flex justify-between gap-3 text-lg font-bold text-slate-900 dark:text-white">
          <span>Total amount</span>
          <span className="tabular-nums text-blue-700 dark:text-blue-300">{currency(total)}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Base + all add-ons (synced from booking)</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-900/40">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Earnings split
        </h4>
        <div className="mt-3">{commission}</div>
      </div>
    </div>
  )
}

export function BookingsPage() {
  const {
    bookings,
    customers,
    technicians,
    services,
    session,
    assignTechnician,
    updateBookingStatus,
    createBooking,
    backfillMissingBookingCoordinates,
    loading,
    mutating,
  } = useApp()
  const [search, setSearch] = useState('')
  const [modalState, setModalState] = useState({ mode: null, booking: null })
  const [selectedTechnician, setSelectedTechnician] = useState('')
  const [availability, setAvailability] = useState({ loading: false, busyTechIds: new Set(), error: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    customerId: '',
    serviceId: '',
    scheduledAt: '',
    address: '',
    latitude: '',
    longitude: '',
    notes: '',
    technicianId: '',
    amount: '',
  })
  const [createAvailability, setCreateAvailability] = useState({
    loading: false,
    busyTechIds: new Set(),
    error: '',
  })

  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((customer) => [customer.id, customer])),
    [customers],
  )

  const serviceMap = useMemo(
    () => Object.fromEntries(services.map((service) => [service.id, service])),
    [services],
  )

  const sortedBookings = useMemo(
    () =>
      bookings
        .filter((booking) => {
          const addOnNames = Array.isArray(booking.addOnServices)
            ? booking.addOnServices.map((a) => (a && typeof a === 'object' ? a.serviceName ?? a.name : '')).join(' ')
            : ''
          return [
            booking.id,
            booking.serviceName,
            booking.customerId,
            booking.status,
            bookingAddressSearchText(booking.address),
            addOnNames,
          ]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase())
        })
        .sort((a, b) => {
          const pa = statusPriority[a.status] ?? 99
          const pb = statusPriority[b.status] ?? 99
          return pa - pb
        }),
    [bookings, search],
  )

  const busyTechnicianIds = useMemo(
    () =>
      new Set(
        bookings
          .filter((booking) => ['Assigned', 'Pending', 'New', 'Started'].includes(booking.status))
          .map((booking) => booking.technicianId)
          .filter(Boolean),
      ),
    [bookings],
  )

  const resetCreate = () => {
    setCreateForm({
      customerId: '',
      serviceId: '',
      scheduledAt: '',
      address: '',
      latitude: '',
      longitude: '',
      notes: '',
      technicianId: '',
      amount: '',
    })
    setCreateOpen(false)
    setCreateAvailability({ loading: false, busyTechIds: new Set(), error: '' })
  }

  const parseDateTimeLocal = (value) => {
    if (!value) return null
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  useEffect(() => {
    const run = async () => {
      const start = parseDateTimeLocal(createForm.scheduledAt)
      const service = serviceMap[createForm.serviceId]
      const durationMinutes = Number(service?.duration || 60)
      if (!createOpen || !start) return

      const dayStart = new Date(start)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      setCreateAvailability({ loading: true, busyTechIds: new Set(), error: '' })
      try {
        const dayBookings = await getBookingsForDay({ dayStart, dayEnd })
        const busy = new Set()
        const targetStart = start.getTime()
        const targetEnd = targetStart + durationMinutes * 60_000

        dayBookings
          .filter((b) => ['Assigned', 'Pending', 'New', 'Started'].includes(b.status))
          .filter((b) => b.technicianId)
          .forEach((b) => {
            const startMs = b.scheduledAt?.toDate?.()
              ? b.scheduledAt.toDate().getTime()
              : b.dateTime
                ? new Date(b.dateTime).getTime()
                : null
            if (!startMs) return
            const endMs = startMs + Number(b.durationMinutes || 60) * 60_000
            const overlaps = startMs < targetEnd && endMs > targetStart
            if (overlaps) busy.add(b.technicianId)
          })

        setCreateAvailability({ loading: false, busyTechIds: busy, error: '' })
      } catch {
        setCreateAvailability({
          loading: false,
          busyTechIds: new Set(),
          error:
            'Could not check availability. Ensure bookings have a `scheduledAt` Timestamp field in Firestore.',
        })
      }
    }

    run()
  }, [createOpen, createForm.scheduledAt, createForm.serviceId, serviceMap])

  const baseCreateTechnicians = useMemo(
    () =>
      technicians
        .filter((t) => t.status === 'Available')
        .filter((t) => !busyTechnicianIds.has(t.id))
        .filter((t) => !createAvailability.busyTechIds.has(t.id)),
    [technicians, busyTechnicianIds, createAvailability.busyTechIds],
  )

  const createAvailableTechnicians = baseCreateTechnicians

  useEffect(() => {
    const loadAvailability = async () => {
      const bookingStart = modalState.booking?.scheduledAt?.toDate?.()
        ? modalState.booking.scheduledAt.toDate()
        : modalState.booking?.dateTime
          ? new Date(modalState.booking.dateTime)
          : null

      if (modalState.mode !== 'assign' || !modalState.booking || !bookingStart) return

      const dayStart = new Date(bookingStart)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      setAvailability({ loading: true, busyTechIds: new Set(), error: '' })
      try {
        const dayBookings = await getBookingsForDay({ dayStart, dayEnd })
        const busy = new Set()
        const targetStart = bookingStart.getTime()
        const targetDuration = Number(modalState.booking.durationMinutes || 60)
        const targetEnd = targetStart + targetDuration * 60_000

        dayBookings
          .filter((b) => ['Assigned', 'Pending', 'New', 'Started'].includes(b.status))
          .filter((b) => b.technicianId)
          .forEach((b) => {
            const start = b.scheduledAt?.toDate?.()
              ? b.scheduledAt.toDate().getTime()
              : b.dateTime
                ? new Date(b.dateTime).getTime()
                : null
            if (!start) return
            const duration = Number(b.durationMinutes || 60)
            const end = start + duration * 60_000
            const overlaps = start < targetEnd && end > targetStart
            if (overlaps) busy.add(b.technicianId)
          })

        setAvailability({ loading: false, busyTechIds: busy, error: '' })
      } catch {
        setAvailability({
          loading: false,
          busyTechIds: new Set(),
          error:
            'Could not check availability. Ensure bookings have a `scheduledAt` Timestamp field in Firestore.',
        })
      }
    }

    loadAvailability()
  }, [modalState.mode, modalState.booking])

  useEffect(() => {
    if (!createForm.technicianId) return
    const stillOk = createAvailableTechnicians.some((t) => t.id === createForm.technicianId)
    if (!stillOk) setCreateForm((c) => ({ ...c, technicianId: '' }))
  }, [createForm.technicianId, createAvailableTechnicians])

  const baseAssignTechnicians = useMemo(
    () =>
      technicians
        .filter((technician) => technician.status === 'Available')
        .filter(
          (technician) =>
            !busyTechnicianIds.has(technician.id) ||
            modalState.booking?.technicianId === technician.id,
        )
        .filter((technician) => !availability.busyTechIds.has(technician.id)),
    [technicians, busyTechnicianIds, availability.busyTechIds, modalState.booking?.technicianId],
  )

  const availableTechnicians = baseAssignTechnicians

  return (
    <div className="space-y-4">
      <PageHeader
        title="Booking Management"
        description="Prioritize new work, assign staff quickly, and keep scheduling clear."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search bookings..." />
            <Button onClick={() => setCreateOpen(true)}>Add Booking</Button>
            <Button
              variant="ghost"
              onClick={() =>
                exportRows(
                  'bookings.csv',
                  sortedBookings.map((booking) => ({
                    ...booking,
                    customerName: customerMap[booking.customerId]?.name || booking.customerId,
                    address: formatBookingAddressForDisplay(booking.address),
                  })),
                )
              }
            >
              Export CSV
            </Button>
            {session?.role === ROLES.SUPER_ADMIN || session?.role === ROLES.BOOKING_MANAGER ? (
              <Button
                variant="ghost"
                disabled={Boolean(mutating.bookingGeocodeBackfill)}
                onClick={async () => {
                  try {
                    await backfillMissingBookingCoordinates()
                  } catch (e) {
                    toast.error(e.message)
                  }
                }}
              >
                {mutating.bookingGeocodeBackfill ? 'Geocoding…' : 'Fill missing coordinates'}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4">
        {loading.bookings ? (
          <Card>
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading bookings...</p>
          </Card>
        ) : null}
        {sortedBookings.map((booking) => (
          <Card key={booking.id} className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{booking.id}</h3>
                <Badge
                  tone={
                    booking.status === 'Completed'
                      ? 'success'
                      : booking.status === 'Assigned'
                        ? 'info'
                        : booking.status === 'Started'
                          ? 'info'
                          : booking.status === 'Pending'
                            ? 'neutral'
                            : 'warning'
                  }
                >
                  {booking.status || 'Unknown'}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Service: {booking.serviceName}
              </p>
              <p className="truncate text-sm text-slate-600 dark:text-slate-300" title={formatBookingAddressForDisplay(booking.address)}>
                Address: {formatBookingAddressShort(booking.address)}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Customer: {customerMap[booking.customerId]?.name || booking.customerId}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Date & time:{' '}
                {formatDateTime(
                  booking.scheduledAt?.toDate?.() || booking.dateTime || booking.scheduledAt,
                )}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Status: {booking.status || 'Unknown'}</p>
              {booking.paymentStatus ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Payment: {booking.paymentStatus}
                </p>
              ) : null}
              <BookingPricingSection booking={booking} compact />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setModalState({ mode: 'details', booking })}>
                View Details
              </Button>
              <Button
                onClick={() => {
                  setModalState({ mode: 'assign', booking })
                  setSelectedTechnician('')
                }}
                disabled={booking.status === 'Completed'}
              >
                Assign Technician
              </Button>
              {booking.status === 'Assigned' ? (
                <Button
                  variant="secondary"
                  disabled={Boolean(mutating.bookingStatus)}
                  onClick={() => updateBookingStatus({ bookingId: booking.id, status: 'Started' })}
                >
                  Mark started
                </Button>
              ) : null}
              {booking.status !== 'Completed' && booking.status !== 'New' ? (
                <Button
                  variant="ghost"
                  disabled={Boolean(mutating.bookingStatus)}
                  onClick={() => updateBookingStatus({ bookingId: booking.id, status: 'Completed' })}
                >
                  Mark completed
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={Boolean(modalState.booking)}
        title={modalState.mode === 'details' ? 'Booking details' : 'Assign Technician'}
        onClose={() => setModalState({ mode: null, booking: null })}
        className={modalState.mode === 'details' ? 'max-w-2xl' : undefined}
      >
        {modalState.booking ? (
          modalState.mode === 'details' ? (
            <div className="grid gap-6 text-sm md:grid-cols-2">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Customer
                </h4>
                <p className="text-slate-900 dark:text-white">
                  <span className="text-slate-500 dark:text-slate-400">Name: </span>
                  {customerMap[modalState.booking.customerId]?.name || '—'}
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Phone: </span>
                  {customerMap[modalState.booking.customerId]?.phone || '—'}
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Email: </span>
                  {customerMap[modalState.booking.customerId]?.email || '—'}
                </p>
                <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
                  <span className="block text-slate-500 dark:text-slate-400">Full address</span>
                  {formatBookingAddressForDisplay(customerMap[modalState.booking.customerId]?.address)}
                </p>
              </div>
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Booking
                </h4>
                <p className="text-slate-900 dark:text-white">
                  <span className="text-slate-500 dark:text-slate-400">Booking code: </span>
                  {modalState.booking.bookingCode ||
                    (modalState.booking.id ? `BK-${String(modalState.booking.id).slice(-6).toUpperCase()}` : '—')}
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Service: </span>
                  {modalState.booking.serviceName || '—'}
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Date & time: </span>
                  {formatDateTime(
                    modalState.booking.scheduledAt?.toDate?.() ||
                      modalState.booking.dateTime ||
                      modalState.booking.scheduledAt,
                  )}
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Status: </span>
                  {modalState.booking.status || 'Unknown'}
                </p>
                {modalState.booking.paymentStatus ? (
                  <p className="text-slate-700 dark:text-slate-300">
                    <span className="text-slate-500 dark:text-slate-400">Payment: </span>
                    {modalState.booking.paymentStatus}
                  </p>
                ) : null}
                <BookingPricingSection booking={modalState.booking} />
                <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
                  <span className="block text-slate-500 dark:text-slate-400">Job address</span>
                  {formatBookingAddressForDisplay(modalState.booking.address)}
                </p>
                <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
                  <span className="block text-slate-500 dark:text-slate-400">Notes</span>
                  {(() => {
                    const n = modalState.booking.notes
                    if (n == null || n === '') return '—'
                    if (typeof n === 'string') return n.trim() || '—'
                    return String(n)
                  })()}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                <p className="font-medium text-slate-900 dark:text-white">
                  {modalState.booking.serviceName}
                </p>
                <p className="mt-2 text-slate-600 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Address: </span>
                  {formatBookingAddressForDisplay(modalState.booking.address)}
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Date & time: </span>
                  {formatDateTime(
                    modalState.booking.scheduledAt?.toDate?.() ||
                      modalState.booking.dateTime ||
                      modalState.booking.scheduledAt,
                  )}
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Status: </span>
                  {modalState.booking.status}
                </p>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Only technicians who are available and not busy at this time are listed.
              </p>
              {availability.loading ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">Checking availability...</div>
              ) : null}
              {availability.error ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  {availability.error}
                </div>
              ) : null}
              <Select value={selectedTechnician} onChange={(event) => setSelectedTechnician(event.target.value)}>
                <option value="">Select technician</option>
                {availableTechnicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name} • {(technician.skills || []).join(', ') || '—'}
                  </option>
                ))}
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setModalState({ mode: null, booking: null })}>
                  Cancel
                </Button>
                <Button
                  disabled={!selectedTechnician || availability.loading || Boolean(mutating.bookingAssign)}
                  onClick={async () => {
                    await assignTechnician({ bookingId: modalState.booking.id, technicianId: selectedTechnician })
                    setModalState({ mode: null, booking: null })
                  }}
                >
                  {mutating.bookingAssign ? 'Assigning...' : 'Confirm Assignment'}
                </Button>
              </div>
            </div>
          )
        ) : null}
      </Modal>

      <Modal
        open={createOpen}
        title="Add Booking"
        onClose={resetCreate}
        className="max-h-[80vh] max-w-4xl overflow-hidden"
        bodyClassName="overflow-y-auto pr-1"
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              const customer = customerMap[createForm.customerId]
              const service = serviceMap[createForm.serviceId]
              const scheduledAt = parseDateTimeLocal(createForm.scheduledAt)

              if (!customer || !service || !scheduledAt) {
                toast.error('Please select customer, service, and booking date/time.')
                return
              }

              const addressRaw =
                createForm.address.trim() ||
                addressToFormString(customer.address) ||
                ''
              const address = normalizeBookingAddressForStorage(addressRaw)
              if (formatBookingAddressForDisplay(address) === '—') {
                toast.error('Address is required.')
                return
              }

              const technicianId = createForm.technicianId || ''
              if (technicianId && createAvailability.busyTechIds.has(technicianId)) {
                toast.error('Selected technician is already booked at this time.')
                return
              }

              await createBooking({
                customerId: customer.id,
                serviceId: service.id,
                serviceName: service.name,
                scheduledAt,
                address,
                latitude: createForm.latitude,
                longitude: createForm.longitude,
                notes: createForm.notes,
                durationMinutes: Number(service.duration || 60),
                amount: Number(createForm.amount || service.price || 0),
                visitingCharge: Number(service.visitingCharge || 0),
                technicianId: technicianId || null,
              })

              resetCreate()
            } catch (error) {
              toast.error(error.message)
            }
          }}
        >
          <Field label="Customer">
            <Select
              value={createForm.customerId}
              onChange={(e) => {
                const customerId = e.target.value
                const customer = customerMap[customerId]
                setCreateForm((c) => ({
                  ...c,
                  customerId,
                  address:
                    customer != null
                      ? addressToFormString(customer.address) || c.address
                      : c.address,
                }))
              }}
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} • {c.phone}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Service">
            <Select
              value={createForm.serviceId}
              onChange={(e) => {
                const serviceId = e.target.value
                const service = serviceMap[serviceId]
                setCreateForm((c) => ({
                  ...c,
                  serviceId,
                  amount: service ? String(service.price || 0) : c.amount,
                }))
              }}
              required
            >
              <option value="">Select service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Booking Date & Time">
            <Input
              type="datetime-local"
              value={createForm.scheduledAt}
              onChange={(e) => setCreateForm((c) => ({ ...c, scheduledAt: e.target.value }))}
              required
            />
          </Field>

          <Field label="Technician (optional)">
            <Select
              value={createForm.technicianId}
              onChange={(e) => setCreateForm((c) => ({ ...c, technicianId: e.target.value }))}
              disabled={!createForm.scheduledAt || createAvailability.loading}
            >
              <option value="">Not assigned</option>
              {createAvailableTechnicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} • {(t.skills || []).join(', ') || '—'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Price">
            <Input
              type="number"
              min="0"
              value={createForm.amount}
              onChange={(e) => setCreateForm((c) => ({ ...c, amount: e.target.value }))}
              placeholder="Enter booking price"
              required
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Address">
              <Input
                value={createForm.address}
                onChange={(e) => setCreateForm((c) => ({ ...c, address: e.target.value }))}
                required
              />
            </Field>
          </div>

          <Field label="Latitude (optional override)">
            <Input
              type="number"
              step="any"
              value={createForm.latitude}
              onChange={(e) => setCreateForm((c) => ({ ...c, latitude: e.target.value }))}
              placeholder="Leave blank to geocode from address"
            />
          </Field>
          <Field label="Longitude (optional override)">
            <Input
              type="number"
              step="any"
              value={createForm.longitude}
              onChange={(e) => setCreateForm((c) => ({ ...c, longitude: e.target.value }))}
              placeholder="Leave blank to geocode from address"
            />
          </Field>

          <div className="md:col-span-2 rounded-2xl border border-[var(--outline-variant)]/60 bg-[var(--surface-low)]/50 px-4 py-3 text-sm text-[var(--on-surface-variant)]">
            <p>
              Optional <code className="rounded bg-[var(--surface-high)] px-1">latitude</code> /{' '}
              <code className="rounded bg-[var(--surface-high)] px-1">longitude</code> override the map pin. If left
              blank, coordinates are filled when geocoding succeeds (same as <strong>Fill missing coordinates</strong>).
            </p>
            <p className="mt-2">
              For production geocoding, set{' '}
              <code className="rounded bg-[var(--surface-high)] px-1">VITE_GOOGLE_GEOCODING_API_KEY</code> in{' '}
              <code className="rounded bg-[var(--surface-high)] px-1">.env.local</code>; dev can use the Nominatim proxy
              (<code className="rounded bg-[var(--surface-high)] px-1">/nominatim</code>).
            </p>
          </div>

          <div className="md:col-span-2">
            <Field label="Notes (optional)">
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm((c) => ({ ...c, notes: e.target.value }))}
                className="min-h-24"
              />
            </Field>
          </div>

          {createAvailability.loading ? (
            <div className="md:col-span-2 text-sm text-slate-500 dark:text-slate-400">
              Checking technician availability...
            </div>
          ) : null}
          {createAvailability.error ? (
            <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              {createAvailability.error}
            </div>
          ) : null}

          <div className="md:col-span-2 flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={resetCreate} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={Boolean(mutating.bookingCreate)}
            >
              {mutating.bookingCreate ? 'Saving…' : 'Create Booking'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
