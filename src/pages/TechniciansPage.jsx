import { useMemo, useState } from 'react'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { currency } from '../utils/helpers'

const emptyForm = {
  id: '',
  name: '',
  phone: '',
  email: '',
  completedBookings: 0,
  pendingBookings: 0,
  status: 'Available',
  skills: '',
  areaAddress: '',
  latitude: '',
  longitude: '',
  serviceRadius: '10',
}

export function TechniciansPage() {
  const { technicians, bookings, upsertTechnician, deleteTechnician, loading, mutating } = useApp()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const filtered = useMemo(
    () =>
      technicians.filter((technician) =>
        [
          technician.name,
          technician.email,
          technician.phone,
          technician.skills.join(' '),
          technician.areaAddress || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [technicians, search],
  )

  const technicianStats = useMemo(() => {
    const stats = {}

    for (const booking of bookings) {
      const techId = booking.technicianId
      if (!techId) continue

      if (!stats[techId]) {
        stats[techId] = { completed: 0, pending: 0, earnings: 0 }
      }

      const amount = Number(booking.amount || 0)
      if (booking.status === 'Completed') {
        stats[techId].completed += 1
        stats[techId].earnings += amount
      } else if (['Assigned', 'New', 'Pending', 'Started'].includes(booking.status)) {
        stats[techId].pending += 1
      }
    }

    return stats
  }, [bookings])

  const submit = (event) => {
    event.preventDefault()
    upsertTechnician({
      ...form,
      completedBookings: Number(form.completedBookings),
      pendingBookings: Number(form.pendingBookings),
      skills: form.skills.split(',').map((item) => item.trim()).filter(Boolean),
      areaAddress: form.areaAddress?.trim() || '',
      latitude: form.latitude === '' ? undefined : form.latitude,
      longitude: form.longitude === '' ? undefined : form.longitude,
      serviceRadius: Number(form.serviceRadius) > 0 ? Number(form.serviceRadius) : 10,
    })
    setForm(emptyForm)
    setOpen(false)
  }

  const edit = (technician) => {
    setForm({
      ...emptyForm,
      ...technician,
      skills: technician.skills.join(', '),
      areaAddress: technician.areaAddress ?? '',
      latitude:
        technician.latitude != null && technician.latitude !== '' ? String(technician.latitude) : '',
      longitude:
        technician.longitude != null && technician.longitude !== '' ? String(technician.longitude) : '',
      serviceRadius:
        technician.serviceRadius != null && technician.serviceRadius !== ''
          ? String(technician.serviceRadius)
          : '10',
      completedBookings: technician.completedBookings ?? 0,
      pendingBookings: technician.pendingBookings ?? 0,
    })
    setOpen(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Technician Management"
        description="Manage staff capacity, availability, and assigned skills."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search technicians..." />
            <Button onClick={() => setOpen(true)}>Add Technician</Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {loading.technicians ? (
          <Card>
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading technicians...</p>
          </Card>
        ) : null}
        {filtered.map((technician) => (
          <Card key={technician.id}>
            {/** Live stats are derived from bookings for accuracy. */}
            {(() => {
              const stats = technicianStats[technician.id] || {
                completed: 0,
                pending: 0,
                earnings: 0,
              }
              return (
                <>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{technician.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{technician.email}</p>
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
              <p className="font-semibold text-emerald-600 dark:text-emerald-300">
                Total Earnings: {currency(stats.earnings)}
              </p>
              <p>Skills: {technician.skills.join(', ')}</p>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="ghost" onClick={() => edit(technician)}>
                Edit
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
        ))}
      </div>

      <Modal
        open={open}
        title={form.id ? 'Edit Technician' : 'Add Technician'}
        onClose={() => {
          setOpen(false)
          setForm(emptyForm)
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
          <Field label="Status">
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option>Available</option>
              <option>Busy</option>
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
    </div>
  )
}
