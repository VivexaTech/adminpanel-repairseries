import { createContext, useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { auth, isFirebaseConfigured } from '../firebase/config'
import {
  createDoc,
  removeDoc,
  subscribeCollection,
  updateDocFields,
  upsertDoc,
} from '../services/firestore'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(localStorage.getItem('repair-series-theme') || 'dark')
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured)
  const [loading, setLoading] = useState({
    customers: true,
    technicians: true,
    bookings: true,
    services: true,
    categories: true,
  })
  const [mutating, setMutating] = useState({})
  const [data, setData] = useState({
    customers: [],
    technicians: [],
    bookings: [],
    services: [],
    categories: [],
  })
  const bookingsBootstrapped = useRef(false)

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('repair-series-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthLoading(false)
      return undefined
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setSession({
          id: user.uid,
          name: user.displayName || 'Admin User',
          email: user.email,
          role: 'Super Admin',
        })
      } else {
        setSession(null)
      }
      setAuthLoading(false)
    })

    const bindings = [
      { key: 'customers', collectionName: 'customers' },
      { key: 'technicians', collectionName: 'technicians' },
      { key: 'bookings', collectionName: 'bookings' },
      { key: 'services', collectionName: 'services' },
      { key: 'categories', collectionName: 'categories' },
    ]

    const unsubscribers = bindings.map(({ key, collectionName }) =>
      subscribeCollection(
        collectionName,
        (rows, changes) => {
          setData((current) => ({ ...current, [key]: rows }))
          setLoading((current) => ({ ...current, [key]: false }))

          if (collectionName === 'bookings') {
            if (bookingsBootstrapped.current) {
              changes
                .filter((change) => change.type === 'added')
                .forEach((change) => {
                  const booking = change.doc.data()
                  toast.info('New booking received', {
                    description: `${booking.serviceName || 'Service'} • ${change.doc.id} • ${booking.status || 'New'}`,
                  })
                })
            } else {
              bookingsBootstrapped.current = true
            }
          }
        },
        () => {
          setLoading((current) => ({ ...current, [key]: false }))
          toast.error(`Realtime sync failed for ${collectionName}.`)
        },
      ),
    )

    return () => {
      unsubAuth()
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  const login = async ({ email, password }) => {
    if (!isFirebaseConfigured || !auth) throw new Error('Firebase is not configured.')
    await signInWithEmailAndPassword(auth, email, password)
    toast.success('Logged in successfully.')
  }

  const logout = async () => {
    if (!isFirebaseConfigured || !auth) return
    await signOut(auth)
    toast.success('Logged out.')
  }

  const withMutating = async (key, fn) => {
    setMutating((current) => ({ ...current, [key]: true }))
    try {
      await fn()
    } finally {
      setMutating((current) => ({ ...current, [key]: false }))
    }
  }

  const hasActiveBooking = (technicianId, ignoreBookingId = null) =>
    data.bookings.some(
      (booking) =>
        booking.id !== ignoreBookingId &&
        booking.technicianId === technicianId &&
        ['Assigned', 'Pending', 'New'].includes(booking.status),
    )

  const upsertTechnician = async (technician) => {
    await withMutating('technician', async () => {
      const payload = {
        name: technician.name,
        phone: technician.phone,
        email: technician.email,
        completedBookings: Number(technician.completedBookings || 0),
        pendingBookings: Number(technician.pendingBookings || 0),
        status: technician.status || 'Available',
        skills: technician.skills || [],
      }
      if (technician.id) await upsertDoc('technicians', technician.id, payload)
      else await createDoc('technicians', payload)
    })
    toast.success(`Technician ${technician.name} saved.`)
  }

  const deleteTechnician = async (technicianId) => {
    await withMutating('technicianDelete', async () => removeDoc('technicians', technicianId))
    toast.success('Technician removed.')
  }

  const toggleCustomerBlock = async (customerId, blocked) => {
    await withMutating('customerBlock', async () =>
      updateDocFields('customers', customerId, { blocked: !blocked }),
    )
    toast.success(!blocked ? 'Customer blocked.' : 'Customer unblocked.')
  }

  const deleteCustomer = async (customerId) => {
    await withMutating('customerDelete', async () => removeDoc('customers', customerId))
    toast.success('Customer deleted.')
  }

  const createCustomer = async (customer) => {
    await withMutating('customerCreate', async () => {
      const payload = {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        blocked: false,
        totalBookings: 0,
      }
      await createDoc('customers', payload)
    })
    toast.success('Customer created.')
  }

  const assignTechnician = async ({ bookingId, technicianId }) => {
    if (hasActiveBooking(technicianId, bookingId)) {
      throw new Error('This technician has an active booking. Assign only after completion.')
    }
    await withMutating('bookingAssign', async () =>
      updateDocFields('bookings', bookingId, { technicianId, status: 'Assigned' }),
    )
    toast.success('Technician assigned.')
  }

  const updateBookingStatus = async ({ bookingId, status }) => {
    await withMutating('bookingStatus', async () => updateDocFields('bookings', bookingId, { status }))
    toast.success('Booking updated.')
  }

  const createBooking = async (booking) => {
    if (booking.technicianId && hasActiveBooking(booking.technicianId)) {
      throw new Error('Selected technician is already handling another booking.')
    }

    await withMutating('bookingCreate', async () => {
      const scheduledAtDate = booking.scheduledAt instanceof Date ? booking.scheduledAt : new Date(booking.scheduledAt)
      if (Number.isNaN(scheduledAtDate.getTime())) throw new Error('Invalid booking date/time.')

      const payload = {
        customerId: booking.customerId,
        serviceId: booking.serviceId || '',
        serviceName: booking.serviceName,
        address: booking.address,
        notes: booking.notes || '',
        scheduledAt: Timestamp.fromDate(scheduledAtDate),
        durationMinutes: Number(booking.durationMinutes || 60),
        amount: Number(booking.amount || 0),
        technicianId: booking.technicianId || null,
        status: booking.technicianId ? 'Assigned' : 'New',
      }

      const id = await createDoc('bookings', payload)
      await upsertDoc('bookings', id, { bookingCode: `BK-${id.slice(-6).toUpperCase()}` })
    })
    toast.success('Booking created.')
  }

  const upsertService = async (service) => {
    await withMutating('service', async () => {
      const payload = {
        name: service.name,
        description: service.description,
        keyPoints: service.keyPoints?.filter(Boolean) || [],
        price: Number(service.price || 0),
        duration: Number(service.duration || 0),
        categoryId: service.categoryId || '',
        extraPoint: service.extraPoint || '',
        imageUrl: service.imageUrl || '',
        status: service.status || 'Active',
      }
      if (service.id) await upsertDoc('services', service.id, payload)
      else await createDoc('services', payload)
    })
    toast.success(`Service ${service.name} saved.`)
  }

  const deleteService = async (serviceId) => {
    await withMutating('serviceDelete', async () => removeDoc('services', serviceId))
    toast.success('Service deleted.')
  }

  const upsertCategory = async (category) => {
    await withMutating('category', async () => {
      const payload = { name: category.name, icon: category.icon || '' }
      if (category.id) await upsertDoc('categories', category.id, payload)
      else await createDoc('categories', payload)
    })
    toast.success(`Category ${category.name} saved.`)
  }

  const deleteCategory = async (categoryId) => {
    await withMutating('categoryDelete', async () => removeDoc('categories', categoryId))
    toast.success('Category deleted.')
  }

  const metrics = useMemo(() => {
    const completed = data.bookings.filter((booking) => booking.status === 'Completed')
    const pending = data.bookings.filter((booking) =>
      ['Pending', 'New', 'Assigned'].includes(booking.status),
    )
    const todayKey = new Date().toDateString()
    const todayBookings = data.bookings.filter(
      (booking) => {
        const raw = booking.scheduledAt?.toDate?.() || booking.dateTime || booking.scheduledAt
        if (!raw) return false
        return new Date(raw).toDateString() === todayKey
      },
    )
    const totalEarnings = completed.reduce((total, booking) => total + booking.amount, 0)
    return {
      totalOrdersCompleted: completed.length,
      pendingBookings: pending.length,
      totalEarnings,
      todaysBookings: todayBookings.length,
    }
  }, [data.bookings])

  const value = {
    ...data,
    metrics,
    theme,
    setTheme,
    session,
    authLoading,
    loading,
    mutating,
    login,
    logout,
    upsertTechnician,
    deleteTechnician,
    toggleCustomerBlock,
    deleteCustomer,
    createCustomer,
    assignTechnician,
    updateBookingStatus,
    createBooking,
    upsertService,
    deleteService,
    upsertCategory,
    deleteCategory,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export { AppContext }
