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
import { enqueueBookingNotification } from '../services/bookingNotifications'
import { geocodeAddressString } from '../services/geocode'
import { playNewBookingSiren, preloadAlertSounds } from '../utils/alertSounds'
import { formatBookingAddressForDisplay, normalizeBookingAddressForStorage } from '../utils/bookingAddress'
import { getBookingLatLng, parseCoord } from '../utils/geo'
import {
  getBookingEarningSplit,
  isBookingCompleted,
  isBookingRevenueCounted,
} from '../utils/helpers'
import { ASSIGNABLE_ROLES, ROLES } from '../utils/rbac'
import { markSoundPlayed, wasSoundPlayed } from '../utils/soundDedupe'

function technicianMatchesServiceCategory(technician, service) {
  if (!service?.categoryId) return true
  const cid = String(technician?.categoryId ?? '').trim()
  return Boolean(cid) && cid === service.categoryId
}

const ROLE_BINDINGS = {
  [ROLES.SUPER_ADMIN]: [
    { key: 'customers', collectionName: 'customers' },
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'bookings', collectionName: 'bookings' },
    { key: 'services', collectionName: 'services' },
    { key: 'categories', collectionName: 'categories' },
    { key: 'faqs', collectionName: 'faqs' },
    { key: 'offers', collectionName: 'offers' },
    { key: 'coupons', collectionName: 'coupons' },
    { key: 'adminUsers', collectionName: 'adminUsers' },
  ],
  [ROLES.BOOKING_MANAGER]: [
    { key: 'bookings', collectionName: 'bookings' },
    { key: 'customers', collectionName: 'customers' },
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'services', collectionName: 'services' },
    { key: 'categories', collectionName: 'categories' },
  ],
  [ROLES.TECHNICIAN_MANAGER]: [
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'bookings', collectionName: 'bookings' },
    { key: 'categories', collectionName: 'categories' },
  ],
  [ROLES.SERVICE_MANAGER]: [
    { key: 'services', collectionName: 'services' },
    { key: 'categories', collectionName: 'categories' },
    { key: 'offers', collectionName: 'offers' },
    { key: 'coupons', collectionName: 'coupons' },
    { key: 'faqs', collectionName: 'faqs' },
  ],
}

const EMPTY_DATA = {
  customers: [],
  technicians: [],
  bookings: [],
  services: [],
  categories: [],
  faqs: [],
  offers: [],
  coupons: [],
  adminUsers: [],
}

const IDLE_LOADING = {
  customers: false,
  technicians: false,
  bookings: false,
  services: false,
  categories: false,
  faqs: false,
  offers: false,
  coupons: false,
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
    faqs: true,
    offers: true,
    coupons: true,
    adminUsers: true,
  })
  const [mutating, setMutating] = useState({})
  const [data, setData] = useState({
    customers: [],
    technicians: [],
    bookings: [],
    services: [],
    categories: [],
    faqs: [],
    offers: [],
    coupons: [],
    adminUsers: [],
  })
  const bookingsBootstrapped = useRef(false)
  const profileUnsubRef = useRef(null)

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
        ['Assigned', 'Pending', 'New', 'Started'].includes(booking.status),
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
        categoryId: String(technician.categoryId || '').trim(),
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

  const updateCustomerDetails = async ({ customerId, name, phone, role }) => {
    if (session?.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Only Super Admins can update customer details.')
    }
    const trimmedName = String(name || '').trim()
    const trimmedPhone = String(phone || '').trim().replace(/\s+/g, '')
    const trimmedRole = String(role || '').trim()
    if (!trimmedName) throw new Error('Name is required.')
    if (!/^\+?[0-9]{10,15}$/.test(trimmedPhone)) {
      throw new Error('Phone must be 10–15 digits (optional +).')
    }
    const dup = data.customers.some((c) => c.id !== customerId && String(c.phone || '').trim() === trimmedPhone)
    if (dup) throw new Error('Another customer already uses this phone number.')

    await withMutating('customerUpdate', async () =>
      updateDocFields('customers', customerId, {
        name: trimmedName,
        phone: trimmedPhone,
        role: trimmedRole,
      }),
    )
    toast.success('Customer updated.')
  }

  const assignTechnician = async ({ bookingId, technicianId }) => {
    if (hasActiveBooking(technicianId, bookingId)) {
      throw new Error('This technician has an active booking. Assign only after completion.')
    }

    const booking = data.bookings.find((b) => b.id === bookingId)
    if (!booking) throw new Error('Booking not found.')

    await withMutating('bookingAssign', async () => {
      const technician = data.technicians.find((t) => t.id === technicianId)
      if (!technician) throw new Error('Technician not found.')
      const service = data.services.find((s) => s.id === booking.serviceId)
      if (!technicianMatchesServiceCategory(technician, service)) {
        throw new Error('This technician’s category must match the booking’s service category.')
      }
      await updateDocFields('bookings', bookingId, { technicianId, status: 'Assigned' })
    })
    toast.success('Technician assigned.')

    try {
      await enqueueBookingNotification({
        customerId: booking.customerId,
        bookingId,
        eventType: 'assigned',
        serviceName: booking.serviceName || '',
      })
    } catch (err) {
      console.error('[FCM queue] assign', err)
      toast.warning('Assignment saved; push notification could not be queued.')
    }
  }

  const updateBookingStatus = async ({ bookingId, status }) => {
    const booking = data.bookings.find((b) => b.id === bookingId)

    await withMutating('bookingStatus', async () => updateDocFields('bookings', bookingId, { status }))
    toast.success('Booking updated.')

    if (!booking?.customerId) return
    const eventType =
      status === 'Completed'
        ? 'completed'
        : status === 'Started' || status === 'Pending'
          ? 'started'
          : null
    if (!eventType) return
    try {
      await enqueueBookingNotification({
        customerId: booking.customerId,
        bookingId,
        eventType,
        serviceName: booking.serviceName || '',
      })
    } catch (err) {
      console.error('[FCM queue] status', err)
      toast.warning('Status saved; push notification could not be queued.')
    }
  }

  const createBooking = async (booking) => {
    if (booking.technicianId && hasActiveBooking(booking.technicianId)) {
      throw new Error('Selected technician is already handling another booking.')
    }

    let newBookingId = ''
    let autoAssigned = { technicianId: null, assigned: false, status: 'Pending' }
    await withMutating('bookingCreate', async () => {
      const scheduledAtDate = booking.scheduledAt instanceof Date ? booking.scheduledAt : new Date(booking.scheduledAt)
      if (Number.isNaN(scheduledAtDate.getTime())) throw new Error('Invalid booking date/time.')

      const service =
        booking.serviceId ? data.services.find((s) => s.id === booking.serviceId) : null
      const variationId = String(booking.variationId ?? booking.serviceVariationId ?? '').trim()
      let selectedVariation = null
      let servicePrice = 0
      if (service?.hasVariations) {
        const vars = Array.isArray(service.variations) ? service.variations : []
        if (!variationId) throw new Error('Select a service variation for this booking.')
        selectedVariation = vars.find((v) => String(v?.id ?? '') === variationId)
        if (!selectedVariation) throw new Error('Invalid or unknown service variation.')
        servicePrice = Number(selectedVariation.price)
      } else {
        servicePrice = Number(service?.price ?? booking.amount ?? 0)
      }
      const visitingCharge = Number(service?.visitingCharge ?? booking.visitingCharge ?? 0)
      if (!Number.isFinite(servicePrice) || servicePrice < 0) throw new Error('Invalid service price.')
      if (!Number.isFinite(visitingCharge) || visitingCharge < 0) throw new Error('Invalid visiting charge.')
      const totalAmount = servicePrice + visitingCharge
      const technicianEarning = Math.round(totalAmount * 0.7)
      const platformCommission = totalAmount - technicianEarning

      const getTimeRangeMs = (b) => {
        const startDate = b?.scheduledAt?.toDate?.()
          ? b.scheduledAt.toDate()
          : b?.dateTime
            ? new Date(b.dateTime)
            : b?.scheduledAt instanceof Date
              ? b.scheduledAt
              : b?.scheduledAt
                ? new Date(b.scheduledAt)
                : null
        if (!startDate || Number.isNaN(startDate.getTime())) return null
        const duration = Number(b.durationMinutes ?? b.duration ?? 60)
        const start = startDate.getTime()
        return { start, end: start + duration * 60_000 }
      }
      const overlaps = (a, b) => a.start < b.end && a.end > b.start

      if (booking.technicianId) {
        const pickTech = data.technicians.find((t) => t.id === booking.technicianId)
        if (pickTech && !technicianMatchesServiceCategory(pickTech, service)) {
          throw new Error('Selected technician’s category must match this service’s category.')
        }
      }

      const tryAutoAssign = () => {
        if (booking.technicianId) return { technicianId: booking.technicianId, assigned: true, status: 'Assigned' }
        const target = { start: scheduledAtDate.getTime(), end: scheduledAtDate.getTime() + Number(booking.durationMinutes || 60) * 60_000 }
        const activeStatuses = new Set(['Assigned', 'Pending', 'New', 'Started'])
        const candidates = data.technicians.filter(
          (t) => t.status === 'Available' && technicianMatchesServiceCategory(t, service),
        )
        const scored = []
        for (const tech of candidates) {
          const techBookings = data.bookings
            .filter((b) => b.technicianId === tech.id && activeStatuses.has(b.status))
          const conflicts = techBookings.some((b) => {
            const r = getTimeRangeMs(b)
            if (!r) return false
            return overlaps(target, r)
          })
          if (conflicts) continue
          // least-busy heuristic: count active bookings on same day
          const dayKey = scheduledAtDate.toDateString()
          const busyCount = techBookings.filter((b) => {
            const r = getTimeRangeMs(b)
            if (!r) return false
            return new Date(r.start).toDateString() === dayKey
          }).length
          scored.push({ techId: tech.id, busyCount })
        }
        if (!scored.length) return { technicianId: null, assigned: false, status: 'Pending' }
        scored.sort((a, b) => a.busyCount - b.busyCount)
        return { technicianId: scored[0].techId, assigned: true, status: 'Assigned' }
      }

      autoAssigned = tryAutoAssign()

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
        serviceCategoryId: service?.categoryId || '',
        serviceVariationId: selectedVariation ? variationId : '',
        serviceVariationTitle: selectedVariation ? String(selectedVariation.title || '').trim() : '',
        address: normalizedAddr,
        notes: booking.notes || '',
        scheduledAt: Timestamp.fromDate(scheduledAtDate),
        durationMinutes: Number(booking.durationMinutes || 60),
        amount: servicePrice,
        visitingCharge,
        totalAmount,
        finalAmount: totalAmount,
        technicianEarning,
        platformCommission,
        technicianId: autoAssigned.technicianId || null,
        status: autoAssigned.status,
        ...(autoAssigned.assigned ? { assignedAt: serverTimestamp() } : {}),
        ...(lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          ? { latitude: lat, longitude: lng }
          : {}),
      }

      newBookingId = await createDoc('bookings', payload)
      await upsertDoc('bookings', newBookingId, { bookingCode: `BK-${newBookingId.slice(-6).toUpperCase()}` })
    })
    toast.success('Booking created.')

    if (newBookingId && booking.customerId) {
      try {
        await enqueueBookingNotification({
          customerId: booking.customerId,
          bookingId: newBookingId,
          eventType: 'created',
          serviceName: booking.serviceName || '',
        })
        if (autoAssigned.assigned) {
          await enqueueBookingNotification({
            customerId: booking.customerId,
            bookingId: newBookingId,
            eventType: 'assigned',
            serviceName: booking.serviceName || '',
          })
        }
      } catch (err) {
        console.error('[FCM queue] create', err)
        toast.warning('Booking saved; push notification could not be queued.')
      }
    }
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

  const upsertService = async (service, options = {}) => {
    let savedId = String(service.id || '').trim()
    await withMutating('service', async () => {
      const brands = Array.isArray(service.brands)
        ? service.brands
            .filter((b) => b && String(b.name || '').trim() && String(b.logoImage || '').trim())
            .map((b) => ({ name: String(b.name).trim(), logoImage: String(b.logoImage).trim() }))
        : []
      const processSteps = Array.isArray(service.processSteps)
        ? service.processSteps
            .filter((s) => s && String(s.title || '').trim() && String(s.description || '').trim())
            .map((s) => ({
              title: String(s.title).trim(),
              description: String(s.description).trim(),
              image: String(s.image || '').trim(),
            }))
        : []
      const homeImage = String(service.homeImage || service.imageUrl || '').trim()
      const listImage = String(service.listImage || '').trim() || homeImage
      const detailImage = String(service.detailImage || '').trim() || homeImage
      const visitingCharge = Number(service.visitingCharge || 0)
      if (!Number.isFinite(visitingCharge) || visitingCharge < 0) {
        throw new Error('Visiting charge must be a number (0 or more).')
      }
      const hasVariations = Boolean(service.hasVariations)
      const variations = hasVariations
        ? (Array.isArray(service.variations) ? service.variations : [])
            .map((v) => {
              if (!v || typeof v !== 'object') return null
              const id = String(v.id || '').trim() || `var-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
              const title = String(v.title || '').trim()
              const price = Number(v.price)
              const image = String(v.image || '').trim()
              if (!title || !Number.isFinite(price) || price < 0 || !image) return null
              return { id, title, price, image }
            })
            .filter(Boolean)
        : []
      if (hasVariations && variations.length === 0) {
        throw new Error('Add at least one complete variation (title, price, image).')
      }
      const payload = {
        name: service.name,
        description: service.description,
        keyPoints: service.keyPoints?.filter(Boolean) || [],
        hasVariations,
        variations: hasVariations ? variations : [],
        price: hasVariations ? 0 : Number(service.price || 0),
        visitingCharge,
        duration: Number(service.duration || 0),
        categoryId: service.categoryId || '',
        extraPoint: service.extraPoint || '',
        imageUrl: homeImage || String(service.imageUrl || '').trim(),
        homeImage,
        listImage,
        detailImage,
        brands,
        processSteps,
        status: service.status || 'Active',
      }
      if (!hasVariations && (!Number.isFinite(payload.price) || payload.price < 0)) {
        throw new Error('Invalid service price.')
      }
      if (savedId) await upsertDoc('services', savedId, payload)
      else savedId = await createDoc('services', payload)
    })
    toast.success(options.successToast ?? `Service ${service.name} saved.`)
    return savedId
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

  const upsertFaq = async (faq) => {
    const question = String(faq.question || '').trim()
    const answer = String(faq.answer || '').trim()
    if (!question) throw new Error('FAQ question is required.')
    if (!answer) throw new Error('FAQ answer is required.')
    await withMutating('faq', async () => {
      const payload = { question, answer }
      if (faq.id) await upsertDoc('faqs', faq.id, payload)
      else await createDoc('faqs', payload)
    })
    toast.success('FAQ saved.')
  }

  const deleteFaq = async (faqId) => {
    await withMutating('faqDelete', async () => removeDoc('faqs', faqId))
    toast.success('FAQ removed.')
  }

  const upsertOffer = async (offer) => {
    if (session?.role !== ROLES.SUPER_ADMIN) throw new Error('Only Super Admins can manage offers.')
    const image = String(offer.image || '').trim()
    if (!image) throw new Error('Offer image is required.')
    const title = String(offer.title || '').trim()
    const active = Boolean(offer.active)
    await withMutating('offer', async () => {
      const payload = { image, title, active }
      if (offer.id) await upsertDoc('offers', offer.id, payload)
      else await createDoc('offers', payload)
    })
    toast.success('Offer saved.')
  }

  const deleteOffer = async (offerId) => {
    if (session?.role !== ROLES.SUPER_ADMIN) throw new Error('Only Super Admins can manage offers.')
    await withMutating('offerDelete', async () => removeDoc('offers', offerId))
    toast.success('Offer removed.')
  }

  const upsertCoupon = async (coupon) => {
    if (session?.role !== ROLES.SUPER_ADMIN) throw new Error('Only Super Admins can manage coupons.')
    const code = String(coupon.code || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    if (!code) throw new Error('Coupon code is required.')

    const discountType = coupon.discountType === 'percentage' ? 'percentage' : 'flat'
    const discountValue = Number(coupon.discountValue)
    if (!Number.isFinite(discountValue) || discountValue <= 0) throw new Error('Discount value must be > 0.')

    const minOrderAmount = Number(coupon.minOrderAmount || 0)
    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) throw new Error('Min order must be 0 or more.')

    const maxDiscount =
      coupon.maxDiscount === '' || coupon.maxDiscount == null ? null : Number(coupon.maxDiscount)
    if (maxDiscount != null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) {
      throw new Error('Max discount must be empty or > 0.')
    }

    const expiryDate = coupon.expiryDate ? new Date(coupon.expiryDate) : null
    if (!expiryDate || Number.isNaN(expiryDate.getTime())) throw new Error('Expiry date is required.')

    const active = Boolean(coupon.active)

    await withMutating('coupon', async () => {
      const payload = {
        code,
        discountType,
        discountValue,
        minOrderAmount,
        ...(maxDiscount != null ? { maxDiscount } : {}),
        expiryDate: Timestamp.fromDate(expiryDate),
        active,
      }
      if (coupon.id) await upsertDoc('coupons', coupon.id, payload)
      else await createDoc('coupons', payload)
    })
    toast.success('Coupon saved.')
  }

  const deleteCoupon = async (couponId) => {
    if (session?.role !== ROLES.SUPER_ADMIN) throw new Error('Only Super Admins can manage coupons.')
    await withMutating('couponDelete', async () => removeDoc('coupons', couponId))
    toast.success('Coupon removed.')
  }

  const updateBookingAddOnApproval = async ({ bookingId, index, approvalStatus }) => {
    const next = String(approvalStatus || '')
      .trim()
      .toLowerCase()
    if (!['approved', 'pending', 'rejected'].includes(next)) {
      throw new Error('Invalid approval status.')
    }
    await withMutating('bookingAddOn', async () => {
      const booking = data.bookings.find((b) => b.id === bookingId)
      if (!booking) throw new Error('Booking not found.')
      const raw = Array.isArray(booking.addOnServices) ? [...booking.addOnServices] : []
      if (index < 0 || index >= raw.length) throw new Error('Add-on not found.')
      const prev = raw[index] && typeof raw[index] === 'object' ? { ...raw[index] } : {}
      raw[index] = { ...prev, approvalStatus: next }
      await updateDocFields('bookings', bookingId, { addOnServices: raw })
    })
    toast.success('Add-on status updated.')
  }

  const normalizePhone = (value) => String(value || '').trim().replace(/\s+/g, '')

  const createAdminUser = async ({ email, password, name, phone, role }) => {
    if (session?.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Only Super Admins can manage users.')
    }
    if (!secondaryAuth || !db) throw new Error('Firebase is not configured.')
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()
    const trimmedPhone = normalizePhone(phone)
    if (!trimmedEmail || !password || !trimmedName || !trimmedPhone) {
      throw new Error('Name, email, phone, and password are required.')
    }
    if (!/^\+?[0-9]{10,15}$/.test(trimmedPhone)) {
      throw new Error('Phone must be 10–15 digits (optional +).')
    }
    if (role === ROLES.SUPER_ADMIN) {
      const existing = data.adminUsers.filter((u) => u.role === ROLES.SUPER_ADMIN)
      if (existing.length > 0) {
        throw new Error('Only one Super Admin is allowed. Demote the existing Super Admin first.')
      }
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new Error('Invalid role.')
    }

    await withMutating('adminUserCreate', async () => {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, trimmedEmail, password)
      await updateProfile(cred.user, { displayName: trimmedName })
      await setDoc(doc(db, 'adminUsers', cred.user.uid), {
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
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
    if (fields.role != null) {
      if (!ASSIGNABLE_ROLES.includes(fields.role)) {
        throw new Error('Invalid role.')
      }
      if (fields.role === ROLES.SUPER_ADMIN) {
        const existing = data.adminUsers.filter((u) => u.role === ROLES.SUPER_ADMIN && u.id !== userId)
        if (existing.length > 0) {
          throw new Error('Only one Super Admin is allowed.')
        }
      }
      payload.role = fields.role
    }
    if (fields.status != null) payload.status = fields.status
    if (fields.phone != null) {
      const nextPhone = normalizePhone(fields.phone)
      if (!/^\+?[0-9]{10,15}$/.test(nextPhone)) throw new Error('Phone must be 10–15 digits (optional +).')
      payload.phone = nextPhone
    }
    if (fields.name != null) {
      const nextName = String(fields.name || '').trim()
      if (!nextName) throw new Error('Name is required.')
      payload.name = nextName
    }
    if (Object.keys(payload).length === 0) return

    await withMutating('adminUserUpdate', async () => updateDocFields('adminUsers', userId, payload))
    toast.success('User updated.')
  }

  const metrics = useMemo(() => {
    const completed = data.bookings.filter((booking) => isBookingCompleted(booking))
    const pending = data.bookings.filter((booking) =>
      ['Pending', 'New', 'Assigned', 'Started'].includes(booking.status),
    )
    const todayKey = new Date().toDateString()
    const todayBookings = data.bookings.filter(
      (booking) => {
        const raw = booking.scheduledAt?.toDate?.() || booking.dateTime || booking.scheduledAt
        if (!raw) return false
        return new Date(raw).toDateString() === todayKey
      },
    )
    const revenueBookings = data.bookings.filter((booking) => isBookingRevenueCounted(booking))
    const platformEarnings = revenueBookings.reduce((total, booking) => {
      const { platformCut } = getBookingEarningSplit(booking)
      return total + platformCut
    }, 0)
    return {
      totalOrdersCompleted: completed.length,
      pendingBookings: pending.length,
      platformEarnings,
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
    updateCustomerDetails,
    assignTechnician,
    updateBookingStatus,
    createBooking,
    updateBookingAddOnApproval,
    backfillMissingBookingCoordinates,
    upsertService,
    deleteService,
    upsertCategory,
    deleteCategory,
    upsertFaq,
    deleteFaq,
    upsertOffer,
    deleteOffer,
    upsertCoupon,
    deleteCoupon,
    createAdminUser,
    updateAdminUser,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export { AppContext }
