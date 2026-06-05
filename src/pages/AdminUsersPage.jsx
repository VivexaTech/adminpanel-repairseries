import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, Select, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { formatDateTime } from '../utils/helpers'
import { ASSIGNABLE_ROLES, ROLES, formatRoleLabel } from '../utils/rbac'

const formatCreated = (ts) => {
  if (!ts?.toDate) return '--'
  return formatDateTime(ts.toDate())
}

export function AdminUsersPage() {
  const {
    adminUsers,
    session,
    loading,
    mutating,
    createAdminUser,
    updateAdminUser,
  } = useApp()
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: ROLES.BOOKING_MANAGER,
  })
  const [editOpen, setEditOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editRole, setEditRole] = useState(ROLES.BOOKING_MANAGER)

  const sorted = useMemo(
    () =>
      [...adminUsers].sort((a, b) => {
        const ae = (a.email || '').toLowerCase()
        const be = (b.email || '').toLowerCase()
        return ae.localeCompare(be)
      }),
    [adminUsers],
  )

  const editRoleOptions = useMemo(() => {
    const role = editUser?.role
    if (role && !ASSIGNABLE_ROLES.includes(role)) {
      return [...ASSIGNABLE_ROLES, role]
    }
    return ASSIGNABLE_ROLES
  }, [editUser?.role])

  const canManage = session?.role === ROLES.SUPER_ADMIN

  const submitAdd = async (e) => {
    e.preventDefault()
    if (!canManage) {
      toast.error('Only Super Admins can manage users.')
      return
    }
    const phone = String(addForm.phone || '').trim()
    if (!/^\+?[0-9]{10,15}$/.test(phone)) {
      toast.error('Enter a valid phone number (10–15 digits, optional +).')
      return
    }
    try {
      await createAdminUser({
        name: addForm.name,
        email: addForm.email,
        phone,
        password: addForm.password,
        role: addForm.role,
      })
      setAddOpen(false)
      setAddForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: ROLES.BOOKING_MANAGER,
      })
    } catch (err) {
      toast.error(err.message)
    }
  }

  const openEdit = (user) => {
    setEditUser(user)
    setEditName(user.name || '')
    setEditPhone(user.phone || '')
    setEditRole(user.role || ROLES.BOOKING_MANAGER)
    setEditOpen(true)
  }

  const saveRole = async (e) => {
    e.preventDefault()
    if (!editUser || !canManage) return
    const name = String(editName || '').trim()
    const phone = String(editPhone || '').trim().replace(/\s+/g, '')
    if (!name) {
      toast.error('Name is required.')
      return
    }
    if (!/^\+?[0-9]{10,15}$/.test(phone)) {
      toast.error('Enter a valid phone number (10–15 digits, optional +).')
      return
    }
    try {
      await updateAdminUser(editUser.id, { name, phone, role: editRole })
      setEditOpen(false)
      setEditUser(null)
      setEditName('')
      setEditPhone('')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const toggleStatus = async (user) => {
    if (!canManage) return
    const next = user.status === 'active' ? 'inactive' : 'active'
    try {
      await updateAdminUser(user.id, { status: next })
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users Management"
        description="Create admin accounts and assign roles. Only Super Admins can use this page."
        actions={
          canManage ? (
            <Button onClick={() => setAddOpen(true)} disabled={Boolean(mutating.adminUserCreate)}>
              Add admin user
            </Button>
          ) : null
        }
      />

      {!canManage ? (
        <Card>
          <p className="text-sm text-[var(--on-surface-variant)]">
            You do not have permission to manage admin users.
          </p>
        </Card>
      ) : null}

      <Card className="overflow-x-auto p-0">
        {loading.adminUsers ? (
          <p className="p-5 text-sm text-[var(--on-surface-variant)]">Loading admin users...</p>
        ) : null}
        {!loading.adminUsers && !sorted.length ? (
          <p className="p-5 text-sm text-[var(--on-surface-variant)]">No admin users in Firestore yet.</p>
        ) : null}
        {!loading.adminUsers && sorted.length > 0 ? (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-low)] text-[var(--on-surface-variant)]">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((user) => {
                const isSelf = user.id === session?.id
                const active = user.status === 'active'
                return (
                  <tr
                    key={user.id}
                    className="border-b border-[var(--border)]/60 text-[var(--on-surface)] last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{user.name || '—'}</td>
                    <td className="px-4 py-3 text-[var(--on-surface-variant)]">{user.email || '—'}</td>
                    <td className="px-4 py-3 text-[var(--on-surface-variant)]">{user.phone || '—'}</td>
                    <td className="px-4 py-3">{formatRoleLabel(user.role)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={active ? 'success' : 'danger'}>{active ? 'active' : 'inactive'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--on-surface-variant)]">{formatCreated(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="!px-3 !py-1.5 text-xs"
                          disabled={!canManage || isSelf || Boolean(mutating.adminUserUpdate)}
                          onClick={() => openEdit(user)}
                          title={isSelf ? 'Use another Super Admin to change your role' : ''}
                        >
                          Edit role
                        </Button>
                        <Button
                          type="button"
                          variant={active ? 'ghost' : 'primary'}
                          className="!px-3 !py-1.5 text-xs"
                          disabled={!canManage || isSelf || Boolean(mutating.adminUserUpdate)}
                          onClick={() => toggleStatus(user)}
                          title={isSelf ? 'You cannot change your own status here' : ''}
                        >
                          {active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </Card>

      <Modal open={addOpen} title="Add admin user" onClose={() => setAddOpen(false)}>
        <form className="grid gap-4" onSubmit={submitAdd}>
          <p className="text-sm text-[var(--on-surface-variant)]">
            Creates a Firebase Auth user and an <code className="rounded bg-[var(--surface-high)] px-1">adminUsers</code>{' '}
            profile. The new user signs in with this email and password.
          </p>
          <Field label="Name">
            <Input
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </Field>
          <Field label="Phone">
            <Input
              inputMode="tel"
              value={addForm.phone}
              onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91XXXXXXXXXX"
              required
            />
          </Field>
          <Field label="Temporary password">
            <Input
              type="password"
              value={addForm.password}
              onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={6}
            />
          </Field>
          <Field label="Role">
            <Select
              value={addForm.role}
              onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {formatRoleLabel(r)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(mutating.adminUserCreate)}>
              {mutating.adminUserCreate ? 'Creating...' : 'Create user'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} title="Edit team member" onClose={() => setEditOpen(false)}>
        {editUser ? (
          <form className="grid gap-4 md:grid-cols-2" onSubmit={saveRole}>
            <div className="md:col-span-2 text-sm text-[var(--on-surface-variant)]">
              Email is read-only and cannot be changed.
            </div>
            <Field label="Name">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </Field>
            <Field label="Phone">
              <Input
                inputMode="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+91XXXXXXXXXX"
                required
              />
            </Field>
            <Field label="Role">
              <Select value={editRole} onChange={(e) => setEditRole(e.target.value)} required>
                {editRoleOptions.map((r) => (
                  <option key={r} value={r}>
                    {formatRoleLabel(r)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Email (not editable)">
              <Input value={editUser.email || ''} disabled />
            </Field>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={Boolean(mutating.adminUserUpdate)}>
                {mutating.adminUserUpdate ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
