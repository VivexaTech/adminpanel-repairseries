import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { exportRows } from '../services/csv'

export function CustomersPage() {
  const { customers, session, toggleCustomerBlock, deleteCustomer, createCustomer, updateCustomerDetails, loading, mutating } = useApp()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' })
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ id: '', name: '', phone: '', email: '', role: '' })

  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) =>
        [customer.name, customer.phone, customer.email, customer.address]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [customers, search],
  )

  const reset = () => {
    setForm({ name: '', phone: '', email: '', address: '' })
    setOpen(false)
  }

  const resetEdit = () => {
    setEditForm({ id: '', name: '', phone: '', email: '', role: '' })
    setEditOpen(false)
  }

  const canEdit = session?.role === 'superAdmin'

  const submit = async (event) => {
    event.preventDefault()

    const email = form.email.trim().toLowerCase()
    const phone = form.phone.trim()
    const name = form.name.trim()
    const address = form.address.trim()

    if (!name || !phone || !email || !address) {
      toast.error('Please fill all required fields.')
      return
    }

    const duplicate = customers.some((c) => {
      const cEmail = String(c.email || '').trim().toLowerCase()
      const cPhone = String(c.phone || '').trim()
      return cEmail === email || cPhone === phone
    })

    if (duplicate) {
      toast.error('A customer with the same phone or email already exists.')
      return
    }

    try {
      await createCustomer({ name, phone, email, address })
      reset()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const submitEdit = async (event) => {
    event.preventDefault()
    if (!canEdit) {
      toast.error('Only Super Admins can update customer details.')
      return
    }
    try {
      await updateCustomerDetails({
        customerId: editForm.id,
        name: editForm.name,
        phone: editForm.phone,
        role: editForm.role,
      })
      resetEdit()
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customer Management"
        description="Search, inspect, and manage customer profiles with quick moderation actions."
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <div className="w-full sm:w-[min(100%,22rem)]">
              <SearchInput value={search} onChange={setSearch} placeholder="Search customers..." />
            </div>
            <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
              Add Customer
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => exportRows('customers.csv', filteredCustomers)}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden p-0">
        {loading.customers ? (
          <div className="p-5 text-sm text-[var(--on-surface-variant)]">Loading customers...</div>
        ) : null}

        {/* Mobile: stacked cards */}
        <div className="space-y-3 p-4 md:hidden">
          {filteredCustomers.map((customer) => (
            <div
              key={customer.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-lowest)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[var(--on-surface)]">{customer.name}</p>
                  <p className="mt-1 text-sm text-[var(--on-surface-variant)]">{customer.phone}</p>
                  <p className="mt-1 break-words text-sm text-[var(--on-surface-variant)]">{customer.email}</p>
                </div>
                <Badge tone={customer.blocked ? 'danger' : 'success'}>{customer.blocked ? 'Blocked' : 'Active'}</Badge>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-[var(--on-surface)]">{customer.address}</p>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--on-surface-variant)]">
                <span>Bookings: {customer.totalBookings}</span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button variant="ghost" className="w-full" onClick={() => setSelected(customer)}>
                  View
                </Button>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setEditForm({
                        id: customer.id,
                        name: customer.name || '',
                        phone: customer.phone || '',
                        email: customer.email || '',
                        role: customer.role || '',
                      })
                      setEditOpen(true)
                    }}
                    disabled={Boolean(mutating.customerUpdate)}
                  >
                    Edit
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => toggleCustomerBlock(customer.id, customer.blocked)}
                  disabled={Boolean(mutating.customerBlock)}
                >
                  {customer.blocked ? 'Unblock' : 'Block'}
                </Button>
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => deleteCustomer(customer.id)}
                  disabled={Boolean(mutating.customerDelete)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-low)]">
              <tr>
                {['Name', 'Phone', 'Email', 'Address', 'Total Bookings', 'Status', 'Actions'].map((header) => (
                  <th key={header} className="px-5 py-4 font-semibold text-[var(--on-surface-variant)]">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="border-b border-[var(--border)]/70">
                  <td className="px-5 py-4 font-medium text-[var(--on-surface)]">{customer.name}</td>
                  <td className="px-5 py-4">{customer.phone}</td>
                  <td className="px-5 py-4">{customer.email}</td>
                  <td className="px-5 py-4">{customer.address}</td>
                  <td className="px-5 py-4">{customer.totalBookings}</td>
                  <td className="px-5 py-4">
                    <Badge tone={customer.blocked ? 'danger' : 'success'}>
                      {customer.blocked ? 'Blocked' : 'Active'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={() => setSelected(customer)}>
                        View
                      </Button>
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditForm({
                              id: customer.id,
                              name: customer.name || '',
                              phone: customer.phone || '',
                              email: customer.email || '',
                              role: customer.role || '',
                            })
                            setEditOpen(true)
                          }}
                          disabled={Boolean(mutating.customerUpdate)}
                        >
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        onClick={() => toggleCustomerBlock(customer.id, customer.blocked)}
                        disabled={Boolean(mutating.customerBlock)}
                      >
                        {customer.blocked ? 'Unblock' : 'Block'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => deleteCustomer(customer.id)}
                        disabled={Boolean(mutating.customerDelete)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={Boolean(selected)} title="Customer Details" onClose={() => setSelected(null)}>
        {selected ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(selected).map(([key, value]) => (
              <div key={key} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-lowest)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--on-surface-variant)]">{key}</p>
                <p className="mt-2 break-words text-sm text-[var(--on-surface)]">{String(value)}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>

      <Modal open={editOpen} title="Edit customer" onClose={resetEdit} className="max-w-2xl">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submitEdit}>
          <Field label="Name">
            <Input value={editForm.name} onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))} required />
          </Field>
          <Field label="Phone">
            <Input
              inputMode="tel"
              value={editForm.phone}
              onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))}
              placeholder="+91XXXXXXXXXX"
              required
            />
          </Field>
          <Field label="Role">
            <Input value={editForm.role} onChange={(e) => setEditForm((c) => ({ ...c, role: e.target.value }))} placeholder="customer" />
          </Field>
          <Field label="Email (not editable)">
            <Input value={editForm.email} disabled />
          </Field>
          <div className="md:col-span-2 flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={resetEdit} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={!canEdit || Boolean(mutating.customerUpdate)}
            >
              {mutating.customerUpdate ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={open}
        title="Add Customer"
        onClose={reset}
        className="max-h-[80vh] max-w-2xl overflow-hidden"
        bodyClassName="overflow-y-auto pr-1"
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} required />
          </Field>
          <Field label="Phone Number">
            <Input value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} required />
          </Field>
          <Field label="Email ID">
            <Input type="email" value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} required />
          </Field>
          <div className="md:col-span-2">
            <Field label="Address">
              <Input value={form.address} onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} required />
            </Field>
          </div>
          <div className="md:col-span-2 flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={reset} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={Boolean(mutating.customerCreate)}
            >
              {mutating.customerCreate ? 'Saving...' : 'Create Customer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
