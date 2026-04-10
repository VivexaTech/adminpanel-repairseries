import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { exportRows } from '../services/csv'

export function CustomersPage() {
  const { customers, toggleCustomerBlock, deleteCustomer, createCustomer, loading, mutating } = useApp()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' })

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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customer Management"
        description="Search, inspect, and manage customer profiles with quick moderation actions."
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search customers..." />
            <Button onClick={() => setOpen(true)}>Add Customer</Button>
            <Button
              variant="ghost"
              onClick={() => exportRows('customers.csv', filteredCustomers)}
            >
              Export CSV
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden p-0">
        {loading.customers ? (
          <div className="p-5 text-sm text-slate-500 dark:text-slate-400">Loading customers...</div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/70">
              <tr>
                {['Name', 'Phone', 'Email', 'Address', 'Total Bookings', 'Status', 'Actions'].map((header) => (
                  <th key={header} className="px-5 py-4 font-semibold text-slate-600 dark:text-slate-300">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="border-b border-slate-100 dark:border-slate-800/70">
                  <td className="px-5 py-4 font-medium text-slate-900 dark:text-white">{customer.name}</td>
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
              <div key={key} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{key}</p>
                <p className="mt-2 text-sm text-slate-900 dark:text-white">{String(value)}</p>
              </div>
            ))}
          </div>
        ) : null}
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
