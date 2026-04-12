import { createContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { Timestamp, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { auth, db, isFirebaseConfigured, secondaryAuth } from '../firebase/config'
import {
  createDoc,
  removeDoc,
  subscribeCollection,
  updateDocFields,
  upsertDoc,
} from '../services/firestore'
import { geocodeAddressString } from '../services/geocode'
import { playChatMessageSound, playNewBookingSiren, preloadAlertSounds } from '../utils/alertSounds'
import { formatBookingAddressForDisplay, normalizeBookingAddressForStorage } from '../utils/bookingAddress'
import { getBookingLatLng, parseCoord } from '../utils/geo'
import { ROLES } from '../utils/rbac'
import { markSoundPlayed, wasSoundPlayed } from '../utils/soundDedupe'

const ROLE_BINDINGS = {
  [ROLES.SUPER_ADMIN]: [
    { key: 'customers', collectionName: 'customers' },
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'bookings', collectionName: 'bookings' },
    { key: 'services', collectionName: 'services' },
    { key: 'categories', collectionName: 'categories' },
    { key: 'supportChats', collectionName: 'supportChats' },
    { key: 'adminUsers', collectionName: 'adminUsers' },
  ],
  [ROLES.BOOKING_MANAGER]: [
    { key: 'bookings', collectionName: 'bookings' },
    { key: 'customers', collectionName: 'customers' },
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'services', collectionName: 'services' },
  ],
  [ROLES.TECHNICIAN_MANAGER]: [
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'bookings', collectionName: 'bookings' },
  ],
  [ROLES.SUPPORT_MANAGER]: [{ key: 'supportChats', collectionName: 'supportChats' }],
}

const EMPTY_DATA = {
  customers: [],
  technicians: [],
  bookings: [],
  services: [],
  categories: [],
  supportChats: [],
  adminUsers: [],
}

const IDLE_LOADING = {
  customers: false,
  technicians: false,
  bookings: false,
  services: false,
  categories: false,
  supportChats: false,
  adminUsers: false,
}

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
    supportChats: true,
    adminUsers: true,
  })
  const [mutating, setMutating] = useState({})
  const [data, setData] = useState({
    customers: [],
    technicians: [],
    bookings: [],
    services: [],
    categories: [],
    supportChats: [],
    adminUsers: [],
  })
  const bookingsBootstrapped = useRef(false)
  const supportChatLastTs = useRef({})
  const profileUnsubRef = useRef(null)
  const [supportReadVersion, setSupportReadVersion] = useState(0)

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('repair-series-theme', theme)
  }, [theme])

  useEffect(() => {
    if (session?.id) preloadAlertSounds()
  }, [session?.id])

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) {
      setAuthLoading(false)
      return undefined
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (profileUnsubRef.current) {
        profileUnsubRef.current()
        profileUnsubRef.current = null
      }

      if (!user) {
        setSession(null)
        setAuthLoading(false)
        return
      }

      setAuthLoading(true)
      const unsubProfile = onSnapshot(
        doc(db, 'adminUsers', user.uid),
        (snap) => {
          if (!snap.exists()) {
            toast.error('No admin profile linked to this account. Ask a Super Admin to create adminUsers/{yourUid} in Firestore.')
            signOut(auth)
            setSession(null)
            setAuthLoading(false)
            return
          }
          const d = snap.data()
          const status = d.status === 'active' || d.status === 'inactive' ? d.status : 'inactive'
          if (status !== 'active') {
            toast.error('This account is inactive.')
            signOut(auth)
            setSession(null)
            setAuthLoading(false)
            return
          }
          const role = d.role
          if (!role || !ROLE_BINDINGS[role]) {
            toast.error('Invalid admin profile (unknown or missing role).')
            signOut(auth)
            setSession(null)
            setAuthLoading(false)
            return
          }
          setSession({
            id: user.uid,
            name: d.name || user.displayName || 'Admin',
            email: user.email || d.email || '',
            role,
            status,
          })
          setAuthLoading(false)
        },
        () => {
          toast.error('Could not load admin profile (check Firestore rules and network).')
          signOut(auth)
          setSession(null)
          setAuthLoading(false)
        },
      )
      profileUnsubRef.current = unsubProfile
    })

    return () => {
      unsubAuth()
      if (profileUnsubRef.current) {
        profileUnsubRef.current()
        profileUnsubRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return undefined

    if (!session?.id || !session.role) {
      setData({ ...EMPTY_DATA })
      setLoading({ ...IDLE_LOADING })
      bookingsBootstrapped.current = false
      return undefined
    }

    const bindings = ROLE_BINDINGS[session.role]
    if (!bindings) {
      toast.error('Unknown admin role.')
      signOut(auth)
      return undefined
    }

    setData({ ...EMPTY_DATA })
    bookingsBootstrapped.current = false

    const nextLoading = { ...IDLE_LOADING }
    bindings.forEach(({ key }) => {
      nextLoading[key] = true
    })
    setLoading(nextLoading)

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
                  const bookingStatus = booking.status || 'New'
                  if (bookingStatus !== 'New') return
                  const id = change.doc.id
                  const soundKey = `booking-new-${id}`
                  if (!wasSoundPlayed(soundKey)) {
                    markSoundPlayed(soundKey)
                    playNewBookingSiren()
                  }
                  const addrLine = formatBookingAddressForDisplay(booking.address)
                  const addrShort = addrLine === '—' ? '' : addrLine.slice(0, 48)
                  toast.info('New booking', {
                    description: `${booking.serviceName || 'Service'} • ${id}${addrShort ? ` • ${addrShort}` : ''}`,
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

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [session?.id, session?.role])

  useEffect(() => {
    const prev = supportChatLastTs.current
    const next = {}
    data.supportChats.forEach((chat) => {
      const ts = chat.lastMessageAt?.toMillis?.() || 0
      next[chat.id] = ts
      const oldTs = prev[chat.id] ?? 0
      if (Object.keys(prev).length > 0 && ts > oldTs && chat.lastSenderRole === 'user') {
        const key = `support-msg-${chat.id}-${ts}`
        if (!wasSoundPlayed(key)) {
          markSoundPlayed(key)
          playChatMessageSound()
        }
        toast.message('New support message', {
          description: chat.userName || chat.userId || chat.id,
        })
      }
    })
    if (Object.keys(prev).length === 0) {
      supportChatLastTs.current = next
      return
    }
    supportChatLastTs.current = next
  }, [data.supportChats])

  const getSupportReadMillis = (chatId) => {
    try {
      return Number(localStorage.getItem(`repair-series-support-read-${chatId}`) || 0)
    } catch {
      return 0
    }
  }

  const markSupportChatRead = (chatId, lastMessageMillis = Date.now()) => {
    try {
      localStorage.setItem(`repair-series-support-read-${chatId}`, String(lastMessageMillis))
    } catch {
      // ignore
    }
    setSupportReadVersion((v) => v + 1)
  }

  const supportUnreadTotal = useMemo(() => {
    let n = 0
    for (const chat of data.supportChats) {
      const lastAt = chat.lastMessageAt?.toMillis?.() || 0
      const readAt = getSupportReadMillis(chat.id)
      if (chat.lastSenderRole === 'user' && lastAt > readAt) n += 1
    }
    return n
  }, [data.supportChats, supportReadVersion])

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
      const tLat = parseCoord(technician.latitude)
      const tLng = parseCoord(technician.longitude)
      const payload = {
        name: technician.name,
        phone: technician.phone,
        email: technician.email,
        completedBookings: Number(technician.completedBookings || 0),
        pendingBookings: Number(technician.pendingBookings || 0),
        status: technician.status || 'Available',
        skills: technician.skills || [],
        areaAddress: technician.areaAddress || '',
        serviceRadius: Number(technician.serviceRadius) > 0 ? Number(technician.serviceRadius) : 10,
        ...(tLat != null ? { latitude: tLat } : {}),
        ...(tLng != null ? { longitude: tLng } : {}),
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

    await withMutating('bookingAssign', async () => {
      const booking = data.bookings.find((b) => b.id === bookingId)
      if (!booking) throw new Error('Booking not found.')
      const technician = data.technicians.find((t) => t.id === technicianId)
      if (!technician) throw new Error('Technician not found.')
      await updateDocFields('bookings', bookingId, { technicianId, status: 'Assigned' })
    })
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

      const normalizedAddr = normalizeBookingAddressForStorage(booking.address)
      const addrForGeo = formatBookingAddressForDisplay(normalizedAddr)
      if (addrForGeo === '—') throw new Error('Address is required.')

      let lat = parseCoord(booking.latitude)
      let lng = parseCoord(booking.longitude)
      if (lat == null || lng == null) {
        try {
          const geo = await geocodeAddressString(addrForGeo)
          lat = geo.lat
          lng = geo.lng
        } catch {
          lat = null
          lng = null
        }
      }

      const payload = {
        customerId: booking.customerId,
        serviceId: booking.serviceId || '',
        serviceName: booking.serviceName,
        address: normalizedAddr,
        notes: booking.notes || '',
        scheduledAt: Timestamp.fromDate(scheduledAtDate),
        durationMinutes: Number(booking.durationMinutes || 60),
        amount: Number(booking.amount || 0),
        technicianId: booking.technicianId || null,
        status: booking.technicianId ? 'Assigned' : 'New',
        ...(lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          ? { latitude: lat, longitude: lng }
          : {}),
      }

      const id = await createDoc('bookings', payload)
      await upsertDoc('bookings', id, { bookingCode: `BK-${id.slice(-6).toUpperCase()}` })
    })
    toast.success('Booking created.')
  }

  const backfillMissingBookingCoordinates = async () => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.BOOKING_MANAGER) {
      throw new Error('You are not allowed to update bookings.')
    }
    const useGoogle = Boolean(import.meta.env.VITE_GOOGLE_GEOCODING_API_KEY)

    await withMutating('bookingGeocodeBackfill', async () => {
      const targets = data.bookings.filter((b) => {
        const { lat, lng } = getBookingLatLng(b)
        return lat == null || lng == null
      })
      let ok = 0
      let skipped = 0
      for (const b of targets) {
        try {
          const addr = formatBookingAddressForDisplay(b.address)
          if (addr === '—') {
            skipped += 1
            continue
          }
          const { lat, lng } = await geocodeAddressString(addr)
          await updateDocFields('bookings', b.id, { latitude: lat, longitude: lng })
          ok += 1
          if (!useGoogle) await new Promise((r) => setTimeout(r, 1100))
        } catch {
          skipped += 1
        }
      }
      toast.success(
        ok ? `Geocoded ${ok} booking(s).` : 'No bookings were updated.',
        skipped ? { description: `${skipped} skipped or failed.` } : undefined,
      )
    })
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

  const createAdminUser = async ({ email, password, name, role }) => {
    if (session?.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Only Super Admins can manage users.')
    }
    if (!secondaryAuth || !db) throw new Error('Firebase is not configured.')
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()
    if (!trimmedEmail || !password || !trimmedName) throw new Error('Name, email, and password are required.')

    await withMutating('adminUserCreate', async () => {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, trimmedEmail, password)
      await updateProfile(cred.user, { displayName: trimmedName })
      await setDoc(doc(db, 'adminUsers', cred.user.uid), {
        name: trimmedName,
        email: trimmedEmail,
        role,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
    toast.success('Admin user created. They can sign in with the email and password you set.')
  }

  const updateAdminUser = async (userId, fields) => {
    if (session?.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Only Super Admins can manage users.')
    }
    if (userId === session.id) {
      if (fields.status === 'inactive') throw new Error('You cannot deactivate your own account.')
      if (fields.role != null && fields.role !== session.role) {
        throw new Error('You cannot change your own role.')
      }
    }
    const payload = {}
    if (fields.role != null) payload.role = fields.role
    if (fields.status != null) payload.status = fields.status
    if (Object.keys(payload).length === 0) return

    await withMutating('adminUserUpdate', async () => updateDocFields('adminUsers', userId, payload))
    toast.success('User updated.')
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
    supportUnreadTotal,
    markSupportChatRead,
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
    backfillMissingBookingCoordinates,
    upsertService,
    deleteService,
    upsertCategory,
    deleteCategory,
    createAdminUser,
    updateAdminUser,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export { AppContext }
