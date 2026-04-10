import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { exportRows } from '../services/csv'
import { currency, formatDateTime } from '../utils/helpers'
import { getBookingsForDay } from '../services/firestore'

const statusPriority = { New: 1, Assigned: 2, Pending: 3, Completed: 4 }

export function BookingsPage() {
  const {
    bookings,
    customers,
    technicians,
    services,
    assignTechnician,
    updateBookingStatus,
    createBooking,
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
        .filter((booking) =>
          [booking.id, booking.serviceName, booking.customerId, booking.status]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .sort((a, b) => statusPriority[a.status] - statusPriority[b.status]),
    [bookings, search],
  )

  const busyTechnicianIds = useMemo(
    () =>
      new Set(
        bookings
          .filter((booking) => ['Assigned', 'Pending', 'New'].includes(booking.status))
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
          .filter((b) => ['Assigned', 'Pending', 'New'].includes(b.status))
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

  const createAvailableTechnicians = technicians
    .filter((t) => t.status === 'Available')
    .filter((t) => !busyTechnicianIds.has(t.id))
    .filter((t) => !createAvailability.busyTechIds.has(t.id))

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
          .filter((b) => ['Assigned', 'Pending', 'New'].includes(b.status))
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

  const availableTechnicians = technicians
    .filter((technician) => technician.status === 'Available')
    .filter(
      (technician) =>
        !busyTechnicianIds.has(technician.id) ||
        modalState.booking?.technicianId === technician.id,
    )
    .filter((technician) => !availability.busyTechIds.has(technician.id))

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
                  })),
                )
              }
            >
              Export CSV
            </Button>
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
                        : 'warning'
                  }
                >
                  {booking.status}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{booking.serviceName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Customer: {customerMap[booking.customerId]?.name || booking.customerId}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Date:{' '}
                {formatDateTime(
                  booking.scheduledAt?.toDate?.() || booking.dateTime || booking.scheduledAt,
                )}
              </p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Price: {currency(booking.amount)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setModalState({ mode: 'customer', booking })}>
                View Customer
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
              <Button
                variant="ghost"
                onClick={() =>
                  updateBookingStatus({
                    bookingId: booking.id,
                    status: booking.status === 'Completed' ? 'Assigned' : 'Completed',
                  })
                }
                disabled={Boolean(mutating.bookingStatus)}
              >
                Mark {booking.status === 'Completed' ? 'Assigned' : 'Completed'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={Boolean(modalState.booking)}
        title={modalState.mode === 'customer' ? 'Customer Details' : 'Assign Technician'}
        onClose={() => setModalState({ mode: null, booking: null })}
      >
        {modalState.booking ? (
          modalState.mode === 'customer' ? (
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p>Customer: {customerMap[modalState.booking.customerId]?.name}</p>
              <p>Email: {customerMap[modalState.booking.customerId]?.email}</p>
              <p>Phone: {customerMap[modalState.booking.customerId]?.phone}</p>
              <p>Address: {customerMap[modalState.booking.customerId]?.address}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Technician can be assigned only after completing their current booking.
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
                    {technician.name} • {technician.skills.join(', ')}
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

              const address = createForm.address.trim() || customer.address || ''
              if (!address) {
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
                notes: createForm.notes,
                durationMinutes: Number(service.duration || 60),
                amount: Number(createForm.amount || service.price || 0),
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
                  address: customer?.address || c.address,
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
                  {t.name} • {t.skills.join(', ')}
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
              {mutating.bookingCreate ? 'Saving...' : 'Create Booking'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
