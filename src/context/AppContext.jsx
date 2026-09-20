import { createContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  Timestamp,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { toast } from 'sonner'
import {
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_RANKING_PENALTIES,
  normalizeBannerSection,
  normalizeComingSoonCategory,
} from '../constants/catalog'
import { normalizeHomeSectionPayload } from '../constants/homeSections'
import { DEFAULT_REVISIT_POLICY, normalizeRevisitPolicy } from '../constants/revisitPolicy'
import { normalizeScoreRewards } from '../constants/rankingScores'
import { auth, db, isFirebaseConfigured, secondaryAuth } from '../firebase/config'
import {
  createDoc,
  fetchDoc,
  removeDoc,
  subscribeCollection,
  subscribeDoc,
  setDocumentReplace,
  updateDocFields,
  upsertDoc,
} from '../services/firestore'
import { normalizeSchedulingSettings } from '../services/schedulingSettings'
import { parseAdditionalServiceCsvRow } from '../services/additionalServiceCsvImport'
import { parseServiceCsvRow } from '../services/serviceCsvImport'
import { enqueueBookingNotification } from '../services/bookingNotifications'
import { assignPartner, freezeBookingEconomics } from '../services/websiteApi'
import { geocodeAddressString } from '../services/geocode'
import { playNewBookingSiren, preloadAlertSounds } from '../utils/alertSounds'
import { formatBookingAddressForDisplay, normalizeBookingAddressForStorage } from '../utils/bookingAddress'
import { getBookingLatLng, getTechnicianLatLng, haversineDistanceKm, parseCoord, parseCoordLng } from '../utils/geo'
import { getSlotDescriptorsForBookingWindow, TIMEZONE } from '../utils/technicianSlots'
import { releaseBusySlotsForBooking, verifyBusySlotsFree } from '../services/technicianBusySlots'
import {
  applyTechnicianEarningToBatch,
  createTechnicianPayoutRecord,
  ensureTechnicianEarningForBooking,
} from '../services/technicianTransactions'
import {
  approvalLinesToAddOnRows,
  buildFinanceWritePatch,
  buildInitialBookingFinanceFields,
} from '../utils/bookingFinance'
import { getStoredBookingTotalDeduction } from '../utils/bookingStoredAmounts'
import { computeFinanceBreakdown } from '../utils/bookingFinance'
import { isBookingCompleted, parseSkillsInput } from '../utils/helpers'
import { ASSIGNABLE_ROLES, ROLES } from '../utils/rbac'
import { markSoundPlayed, wasSoundPlayed } from '../utils/soundDedupe'
import { isTechnicianAssignable } from '../utils/technicianVerification'

function technicianMatchesServiceCategory(technician, service) {
  if (!service?.categoryId) return true
  const target = String(service.categoryId).trim()
  const single = String(technician?.categoryId ?? '').trim()
  if (single && single === target) return true
  const arr = Array.isArray(technician?.categoryIds) ? technician.categoryIds : []
  return arr.some((id) => String(id).trim() === target)
}

function technicianHasValidLocation(technician) {
  const { lat: tLat, lng: tLng } = getTechnicianLatLng(technician)
  return tLat != null && tLng != null
}

function technicianDistanceKm(technician, bookingLatLng) {
  const { lat: tLat, lng: tLng } = getTechnicianLatLng(technician)
  const { lat: bLat, lng: bLng } = bookingLatLng || {}
  if (tLat == null || tLng == null || bLat == null || bLng == null) return null
  return haversineDistanceKm(tLat, tLng, bLat, bLng)
}

function localDateKey(value) {
  const date = value?.toDate?.() ? value.toDate() : value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function technicianDailyBookingCount(bookings, technicianId, dayKey, excludeBookingId = '') {
  return (bookings || []).filter((row) => {
    if (row.id === excludeBookingId) return false
    if (String(row.technicianId || '') !== String(technicianId || '')) return false
    if (['cancelled', 'completed'].includes(String(row.status || '').toLowerCase())) return false
    return localDateKey(row.scheduledAt || row.dateTime) === dayKey
  }).length
}

/** Bookings grow quickly — sync a recent window only (newest by createdAt). */
const BOOKINGS_SYNC_OPTIONS = {
  orderByField: 'createdAt',
  orderDirection: 'desc',
  limit: 500,
}

const ROLE_BINDINGS = {
  [ROLES.SUPER_ADMIN]: [
    { key: 'customers', collectionName: 'customers' },
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'bookings', collectionName: 'bookings', options: BOOKINGS_SYNC_OPTIONS },
    { key: 'services', collectionName: 'services' },
    { key: 'additionalServices', collectionName: 'additionalServices' },
    { key: 'categories', collectionName: 'categories' },
    { key: 'faqs', collectionName: 'faqs' },
    { key: 'offers', collectionName: 'offers' },
    { key: 'banners', collectionName: 'banners' },
    { key: 'homeSections', collectionName: 'homeSections' },
    { key: 'coupons', collectionName: 'coupons' },
    { key: 'adminUsers', collectionName: 'adminUsers' },
    { key: 'invoices', collectionName: 'invoices' },
  ],
  [ROLES.BOOKING_MANAGER]: [
    { key: 'bookings', collectionName: 'bookings', options: BOOKINGS_SYNC_OPTIONS },
    { key: 'customers', collectionName: 'customers' },
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'services', collectionName: 'services' },
    { key: 'categories', collectionName: 'categories' },
    { key: 'invoices', collectionName: 'invoices' },
  ],
  [ROLES.TECHNICIAN_MANAGER]: [
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'bookings', collectionName: 'bookings', options: BOOKINGS_SYNC_OPTIONS },
    { key: 'categories', collectionName: 'categories' },
  ],
  [ROLES.SERVICE_MANAGER]: [
    { key: 'services', collectionName: 'services' },
    { key: 'additionalServices', collectionName: 'additionalServices' },
    { key: 'categories', collectionName: 'categories' },
    { key: 'offers', collectionName: 'offers' },
    { key: 'banners', collectionName: 'banners' },
    { key: 'homeSections', collectionName: 'homeSections' },
    { key: 'coupons', collectionName: 'coupons' },
    { key: 'faqs', collectionName: 'faqs' },
  ],
  supportManager: [
    { key: 'bookings', collectionName: 'bookings', options: BOOKINGS_SYNC_OPTIONS },
    { key: 'customers', collectionName: 'customers' },
    { key: 'technicians', collectionName: 'technicians' },
    { key: 'services', collectionName: 'services' },
    { key: 'categories', collectionName: 'categories' },
  ],
}

const EMPTY_DATA = {
  customers: [],
  technicians: [],
  bookings: [],
  services: [],
  additionalServices: [],
  categories: [],
  faqs: [],
  offers: [],
  banners: [],
  homeSections: [],
  coupons: [],
  adminUsers: [],
  invoices: [],
}

const IDLE_LOADING = {
  customers: false,
  technicians: false,
  bookings: false,
  services: false,
  additionalServices: false,
  categories: false,
  faqs: false,
  offers: false,
  banners: false,
  homeSections: false,
  coupons: false,
  adminUsers: false,
  invoices: false,
  platformSettings: false,
  rankingSettings: false,
  appSettings: false,
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
    additionalServices: true,
    categories: true,
    faqs: true,
    offers: true,
    banners: true,
    homeSections: true,
    coupons: true,
    adminUsers: true,
    invoices: true,
    platformSettings: false,
    rankingSettings: false,
    appSettings: false,
  })
  const [mutating, setMutating] = useState({})
  const [data, setData] = useState({
    customers: [],
    technicians: [],
    bookings: [],
    services: [],
    additionalServices: [],
    categories: [],
    faqs: [],
    offers: [],
    banners: [],
    homeSections: [],
    coupons: [],
    adminUsers: [],
    invoices: [],
  })
  const [platformSettings, setPlatformSettings] = useState(null)
  const [rankingSettings, setRankingSettings] = useState(null)
  const [appSettings, setAppSettings] = useState(null)
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
    if (!isFirebaseConfigured || !db || !session?.id) {
      setPlatformSettings(null)
      setLoading((current) => ({ ...current, platformSettings: false }))
      return undefined
    }

    setLoading((current) => ({ ...current, platformSettings: true }))
    const unsub = subscribeDoc(
      'settings',
      'general',
      (docRow) => {
        if (!docRow) {
          setPlatformSettings(null)
        } else {
          setPlatformSettings({
            defaultTechnicianServiceRadiusKm: docRow.defaultTechnicianServiceRadiusKm,
            platformCommissionPercent: docRow.platformCommissionPercent,
            addonFeePercent: docRow.addonFeePercent,
            sparePartCommissionPercent: docRow.sparePartCommissionPercent,
            customerPlatformFeeType: docRow.customerPlatformFeeType,
            customerPlatformFeeValue: docRow.customerPlatformFeeValue,
            globalUpiId: docRow.globalUpiId,
            globalPaymentQr: docRow.globalPaymentQr,
            googleReviewUrl: docRow.googleReviewUrl,
            homeReviews: Array.isArray(docRow.homeReviews) ? docRow.homeReviews : [],
            serviceAreas: Array.isArray(docRow.serviceAreas) ? docRow.serviceAreas : [],
            updatedAt: docRow.updatedAt,
          })
        }
        setLoading((current) => ({ ...current, platformSettings: false }))
      },
      () => {
        toast.error('Could not load platform settings.')
        setLoading((current) => ({ ...current, platformSettings: false }))
      },
    )
    return () => unsub()
  }, [session?.id])

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !session?.id) {
      setRankingSettings(null)
      setLoading((current) => ({ ...current, rankingSettings: false }))
      return undefined
    }
    setLoading((current) => ({ ...current, rankingSettings: true }))
    const unsub = subscribeDoc(
      'settings',
      'ranking',
      (row) => {
        setRankingSettings(row || null)
        setLoading((current) => ({ ...current, rankingSettings: false }))
      },
      () => {
        setRankingSettings(null)
        setLoading((current) => ({ ...current, rankingSettings: false }))
      },
    )
    return () => unsub?.()
  }, [session?.id])

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !session?.id) {
      setAppSettings(null)
      setLoading((current) => ({ ...current, appSettings: false }))
      return undefined
    }

    setLoading((current) => ({ ...current, appSettings: true }))
    const unsub = subscribeDoc(
      'settings',
      'app',
      (row) => {
        const d = row || {}
        const str = (v) => (v == null ? '' : String(v).trim())
        setAppSettings({
          supportEmail: str(d.supportEmail || d.support_email),
          supportPhone: str(d.supportPhone || d.support_phone),
          aboutApp: str(d.aboutApp),
          customerTerms: str(d.customerTerms),
          customerPrivacyPolicy: str(d.customerPrivacyPolicy),
          partnerTerms: str(d.partnerTerms),
          partnerPrivacyPolicy: str(d.partnerPrivacyPolicy),
          customerTermsUpdatedAt: d.customerTermsUpdatedAt || null,
          customerPrivacyUpdatedAt: d.customerPrivacyUpdatedAt || null,
          partnerTermsUpdatedAt: d.partnerTermsUpdatedAt || null,
          partnerPrivacyUpdatedAt: d.partnerPrivacyUpdatedAt || null,
          updatedAt: d.updatedAt || null,
        })
        setLoading((current) => ({ ...current, appSettings: false }))
      },
      () => {
        setAppSettings(null)
        setLoading((current) => ({ ...current, appSettings: false }))
      },
    )
    return () => unsub?.()
  }, [session?.id])

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

    setLoading((current) => {
      const nextLoading = { ...IDLE_LOADING }
      bindings.forEach(({ key }) => {
        nextLoading[key] = true
      })
      return { ...nextLoading, platformSettings: current.platformSettings, rankingSettings: current.rankingSettings, appSettings: current.appSettings }
    })

    const unsubscribers = bindings.map(({ key, collectionName, options }) =>
      subscribeCollection(
        collectionName,
        (rows, changes) => {
          setData((current) => ({ ...current, [key]: rows }))
          setLoading((current) => ({ ...current, [key]: false }))

          if (collectionName === 'bookings') {
            for (const change of changes) {
              if (change.type === 'removed') continue
              const booking = { id: change.doc.id, ...change.doc.data() }
              if (isBookingCompleted(booking) && booking.technicianId) {
                ensureTechnicianEarningForBooking(String(booking.technicianId), booking).catch((err) =>
                  console.error('[ledger] ensure earning for completed booking', err),
                )
              }
            }
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
          toast.error(
            collectionName === 'bookings'
              ? 'Realtime sync failed for bookings (limited to newest 500 by createdAt).'
              : `Realtime sync failed for ${collectionName}.`,
          )
        },
        options || {},
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
      return await fn()
    } finally {
      setMutating((current) => ({ ...current, [key]: false }))
    }
  }

  const upsertTechnician = async (technician) => {
    await withMutating('technician', async () => {
      const tLat = parseCoord(technician.latitude)
      const tLng = parseCoord(technician.longitude)
      const defaultRadius = Number(platformSettings?.defaultTechnicianServiceRadiusKm)
      const fallbackRadius =
        Number.isFinite(defaultRadius) && defaultRadius > 0 ? defaultRadius : 10
      const categoryIds = Array.isArray(technician.categoryIds)
        ? technician.categoryIds.map((id) => String(id).trim()).filter(Boolean)
        : technician.categoryId
          ? [String(technician.categoryId).trim()].filter(Boolean)
          : []
      const payload = {
        name: technician.name,
        phone: technician.phone,
        email: technician.email,
        completedBookings: Number(technician.completedBookings || 0),
        pendingBookings: Number(technician.pendingBookings || 0),
        shiftStatus: technician.status || 'Available',
        skills: parseSkillsInput(technician.skills),
        categoryIds,
        categoryId: categoryIds[0] || String(technician.categoryId || '').trim(),
        areaAddress: technician.areaAddress || '',
        serviceRadius: Number(technician.serviceRadius) > 0 ? Number(technician.serviceRadius) : fallbackRadius,
        ...(tLat != null ? { latitude: tLat } : {}),
        ...(tLng != null ? { longitude: tLng } : {}),
      }
      
      // 👇 FIX: Use updateDocFields for existing technicians to preserve nested KYC/approval status
      if (technician.id) {
        await updateDocFields('technicians', technician.id, payload)
      } else {
        payload.accountStatus = 'pending'
        payload.verificationStatus = 'pending'
        await createDoc('technicians', payload)
      }
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

  const assertCanManageTechnicianVerification = () => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.TECHNICIAN_MANAGER) {
      throw new Error('You are not allowed to verify technicians.')
    }
  }

  const approveTechnician = async ({ technicianId }) => {
    if (!technicianId) throw new Error('Technician is required.')
    if (!db) throw new Error('Firebase is not configured.')
    assertCanManageTechnicianVerification()
    await withMutating('technicianVerification', async () => {
      await updateDoc(doc(db, 'technicians', technicianId), {
        accountStatus: 'active',
        verificationStatus: 'approved',
        status: 'active',
        'kyc.status': 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: session?.id ?? null,
        rejectionReason: deleteField(),
        rejectedAt: deleteField(),
        rejectedBy: deleteField(),
        updatedAt: serverTimestamp(),
      })
    })
    toast.success('Technician approved.')
  }

  const rejectTechnician = async ({ technicianId, reason }) => {
    if (!technicianId) throw new Error('Technician is required.')
    if (!db) throw new Error('Firebase is not configured.')
    assertCanManageTechnicianVerification()
    await withMutating('technicianVerification', async () => {
      await updateDoc(doc(db, 'technicians', technicianId), {
        accountStatus: 'inactive', 
        verificationStatus: 'rejected',
        status: 'rejected',
        'kyc.status': 'rejected',
        rejectionReason: String(reason ?? '').trim(),
        rejectedAt: serverTimestamp(),
        rejectedBy: session?.id ?? null,
        approvedAt: deleteField(),
        approvedBy: deleteField(),
        updatedAt: serverTimestamp(),
      })
    })
    toast.success('Technician rejected.')
  }

  const suspendTechnician = async ({ technicianId, suspended }) => {
    if (!technicianId) throw new Error('Technician is required.')
    if (!db) throw new Error('Firebase is not configured.')
    assertCanManageTechnicianVerification()
    await withMutating('technicianSuspend', async () => {
      if (suspended) {
        await updateDoc(doc(db, 'technicians', technicianId), {
          suspended: true,
          suspendedAt: serverTimestamp(),
          suspendedBy: session?.id ?? null,
          updatedAt: serverTimestamp(),
        })
      } else {
        await updateDoc(doc(db, 'technicians', technicianId), {
          suspended: false,
          suspendedAt: deleteField(),
          suspendedBy: deleteField(),
          updatedAt: serverTimestamp(),
        })
      }
    })
    toast.success(suspended ? 'Technician suspended.' : 'Suspension removed.')
  }

  const assignTechnician = async ({ bookingId, technicianId }) => {
    const booking = data.bookings.find((b) => b.id === bookingId)
    if (!booking) throw new Error('Booking not found.')
    const technician = data.technicians.find((t) => t.id === technicianId)
    if (!technician) throw new Error('Technician not found.')
    if (!isTechnicianAssignable(technician)) {
      throw new Error(
        technician.suspended === true
          ? 'This technician is suspended.'
          : 'This technician cannot be assigned until verified (approval pending or rejected).',
      )
    }
    const service = data.services.find((s) => s.id === booking.serviceId)
    if (!technicianMatchesServiceCategory(technician, service)) {
      throw new Error('This technician’s category must match the booking’s service category.')
    }
    const startDate = booking.scheduledAt?.toDate?.()
      ? booking.scheduledAt.toDate()
      : booking.dateTime
        ? new Date(booking.dateTime)
        : booking.scheduledAt instanceof Date
          ? booking.scheduledAt
          : booking.scheduledAt
            ? new Date(booking.scheduledAt)
            : null
    if (!startDate || Number.isNaN(startDate.getTime())) throw new Error('Invalid booking schedule.')

    const duration = Number(booking.durationMinutes || 60)
    const scheduling = normalizeSchedulingSettings(
      (await fetchDoc('settings', 'scheduling')) || {},
    )
    const descriptors = getSlotDescriptorsForBookingWindow(
      startDate,
      duration + scheduling.travelBufferMinutes,
    )
    if (!descriptors.length) {
      throw new Error('Booking time falls outside schedulable hourly slots (08:00–22:00 IST).')
    }
    if (
      technicianDailyBookingCount(
        data.bookings,
        technicianId,
        localDateKey(startDate),
        bookingId,
      ) >= scheduling.maximumDailyBookings
    ) {
      throw new Error('Technician has reached the configured daily booking limit.')
    }
    await withMutating('bookingAssign', async () => {
      await assignPartner({
        bookingId,
        mode: 'specific',
        technicianId,
        dateStr: localDateKey(startDate),
        slotIndex: descriptors[0].slotIndex,
        slotLabel: descriptors[0].slotLabel,
        reservedSlotIndices: descriptors.map((slot) => slot.slotIndex),
      })
      await updateDocFields('bookings', bookingId, {
        travelBufferMinutes: scheduling.travelBufferMinutes,
        availabilityEndsAt: Timestamp.fromMillis(
          startDate.getTime() +
            (duration + scheduling.travelBufferMinutes) * 60_000,
        ),
      })
    })
    toast.success('Technician assigned.')

    try {
      await enqueueBookingNotification({
        customerId: booking.customerId,
        bookingId,
        eventType: 'assigned',
        serviceName: booking.serviceName || '',
        technicianId: technicianId || '',
        audience: 'both',
      })
    } catch (err) {
      console.error('[FCM queue] assign', err)
      toast.warning('Assignment saved; push notification could not be queued.')
    }
  }

  const updateBookingStatus = async ({
    bookingId,
    status,
    cancelReason = '',
    cancelledBy = 'admin',
  }) => {
    const booking = data.bookings.find((b) => b.id === bookingId)
    const techId = booking?.technicianId ? String(booking.technicianId) : ''
    const isCancel = status === 'Cancelled' || status === 'Canceled'
    const isStart =
      status === 'InProgress' || status === 'Started' || status === 'Pending'

    await withMutating('bookingStatus', async () => {
      if (status === 'Completed' && techId && db) {
        const batch = writeBatch(db)
        batch.update(doc(db, 'bookings', bookingId), { status, updatedAt: serverTimestamp() })
        applyTechnicianEarningToBatch(batch, techId, { ...booking, status: 'Completed' })
        await batch.commit()
      } else if (isCancel) {
        await updateDocFields('bookings', bookingId, {
          status: 'Cancelled',
          cancelReason: String(cancelReason || '').trim() || 'Cancelled by admin',
          cancelledBy: String(cancelledBy || 'admin'),
          cancelledAt: serverTimestamp(),
        })
      } else {
        await updateDocFields('bookings', bookingId, { status })
      }
      const terminal = ['Completed', 'Cancelled', 'Canceled'].includes(status)
      if (terminal && techId) {
        await releaseBusySlotsForBooking(techId, bookingId)
      }
    })
    toast.success('Booking updated.')

    if (status === 'Completed') {
      try {
        await freezeBookingEconomics(bookingId)
      } catch (err) {
        console.warn('[freeze] booking economics', err?.message || err)
      }
    }

    if (!booking?.customerId) return
    const eventType =
      status === 'Completed'
        ? 'completed'
        : isStart
          ? 'started'
          : isCancel
            ? 'cancelled'
            : null
    if (!eventType) return
    try {
      await enqueueBookingNotification({
        customerId: booking.customerId,
        bookingId,
        eventType,
        serviceName: booking.serviceName || '',
        technicianId: booking.technicianId || '',
        audience: 'both',
      })
    } catch (err) {
      console.error('[FCM queue] status', err)
      toast.warning('Status saved; push notification could not be queued.')
    }
  }

  const unassignTechnician = async ({ bookingId }) => {
    const booking = data.bookings.find((b) => b.id === bookingId)
    if (!booking) throw new Error('Booking not found.')
    const status = String(booking.status || '')
    const unsafe = ['Started', 'InProgress', 'In Progress', 'Paused', 'Completed', 'Cancelled', 'Canceled'].includes(
      status,
    )
    if (unsafe) {
      throw new Error(`Cannot unassign while booking status is ${status || 'unknown'}.`)
    }
    const techId = booking.technicianId ? String(booking.technicianId) : ''
    if (!techId) throw new Error('No technician assigned.')

    await withMutating('bookingUnassign', async () => {
      await assignPartner({ bookingId, mode: 'unassign' })
      await updateDocFields('bookings', bookingId, {
        availabilityEndsAt: deleteField(),
        assignedAt: deleteField(),
      })
    })
    toast.success('Technician unassigned.')
  }

  const rescheduleBooking = async ({ bookingId, scheduledAt }) => {
    const booking = data.bookings.find((b) => b.id === bookingId)
    if (!booking) throw new Error('Booking not found.')
    const startDate = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt)
    if (Number.isNaN(startDate.getTime())) throw new Error('Invalid date/time.')

    const duration = Number(booking.durationMinutes || 60)
    const scheduling = normalizeSchedulingSettings(
      (await fetchDoc('settings', 'scheduling')) || {},
    )
    const descriptors = getSlotDescriptorsForBookingWindow(
      startDate,
      duration + scheduling.travelBufferMinutes,
    )
    if (!descriptors.length) {
      throw new Error('Booking time falls outside schedulable hourly slots (08:00–22:00 IST).')
    }

    const techId = booking.technicianId ? String(booking.technicianId) : ''
    await withMutating('bookingReschedule', async () => {
      await updateDocFields('bookings', bookingId, {
        scheduledAt: Timestamp.fromDate(startDate),
        dateTime: startDate.toISOString(),
        travelBufferMinutes: scheduling.travelBufferMinutes,
        reservedSlotIndices: descriptors.map((slot) => slot.slotIndex),
        serviceEndsAt: Timestamp.fromMillis(startDate.getTime() + duration * 60_000),
        availabilityEndsAt: Timestamp.fromMillis(
          startDate.getTime() + (duration + scheduling.travelBufferMinutes) * 60_000,
        ),
      })
      if (techId) {
        await assignPartner({
          bookingId,
          mode: 'specific',
          technicianId: techId,
          dateStr: descriptors[0].dateKey,
          slotIndex: descriptors[0].slotIndex,
          slotLabel: descriptors[0].slotLabel,
          reservedSlotIndices: descriptors.map((slot) => slot.slotIndex),
        })
      }
    })
    toast.success('Booking rescheduled.')
    if (booking.customerId) {
      try {
        await enqueueBookingNotification({
          customerId: booking.customerId,
          bookingId,
          eventType: 'rescheduled',
          serviceName: booking.serviceName || '',
        })
      } catch (err) {
        console.error('[FCM queue] reschedule', err)
        toast.warning('Reschedule saved; push notification could not be queued.')
      }
    }
  }

  const updateBookingPayment = async ({ bookingId, paymentStatus, clearPaymentRequest = false }) => {
    const booking = data.bookings.find((b) => b.id === bookingId)
    if (!booking) throw new Error('Booking not found.')

    const patch = {}
    if (paymentStatus != null) {
      const next = String(paymentStatus).trim().toLowerCase()
      if (!['paid', 'unpaid', 'refunded', ''].includes(next)) {
        throw new Error('Payment status must be paid, unpaid, refunded, or empty.')
      }
      if (next === '') patch.paymentStatus = deleteField()
      else {
        patch.paymentStatus = next
        if (next === 'paid') patch.paidAt = serverTimestamp()
      }
    }
    if (clearPaymentRequest) {
      patch.paymentRequest = deleteField()
    }
    if (!Object.keys(patch).length) throw new Error('Nothing to update.')

    await withMutating('bookingPayment', async () => {
      await updateDocFields('bookings', bookingId, patch)
    })
    toast.success(
      clearPaymentRequest && paymentStatus == null
        ? 'Payment request cleared.'
        : 'Payment status updated.',
    )
  }

  const updateBookingRevisitRemaining = async ({ bookingId, remaining }) => {
    const booking = data.bookings.find((b) => b.id === bookingId)
    if (!booking) throw new Error('Booking not found.')
    const n = Math.max(0, Math.round(Number(remaining)))
    if (!Number.isFinite(n)) throw new Error('Remaining revisits must be a number ≥ 0.')

    await withMutating('bookingRevisitRemaining', async () => {
      await updateDocFields('bookings', bookingId, {
        revisitRemaining: n,
        remainingRevisits: n,
        freeRevisitsRemaining: n,
      })
    })
    toast.success('Revisit remaining updated.')
  }

  const addCustomerSupportNote = async ({ customerId, text }) => {
    const noteText = String(text || '').trim()
    if (!noteText) throw new Error('Note text is required.')
    const customer = data.customers.find((c) => c.id === customerId)
    if (!customer) throw new Error('Customer not found.')

    const prev = Array.isArray(customer.supportNotes) ? customer.supportNotes : []
    const entry = {
      text: noteText,
      createdAt: new Date().toISOString(),
      adminName: String(session?.name || session?.email || 'Admin'),
      adminId: session?.id || null,
    }

    await withMutating('customerSupportNote', async () => {
      await updateDocFields('customers', customerId, {
        supportNotes: [...prev, entry],
      })
    })
    toast.success('Support note added.')
  }

  const recordTechnicianPayout = async ({ technicianId, amount, paymentMode, note, maxAmount }) => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('Amount must be greater than zero.')
    }
    const max = Number(maxAmount)
    if (!Number.isFinite(max)) {
      throw new Error('Unable to read remaining balance — refresh the page and try again.')
    }
    if (n > max + 0.01) {
      throw new Error('Payment cannot exceed the remaining balance.')
    }

    await withMutating('technicianPayout', async () => {
      await createTechnicianPayoutRecord({
        technicianId: String(technicianId),
        amount: n,
        paymentMode,
        note,
        adminId: session?.id ?? null,
      })
    })
    toast.success('Payout recorded', { description: 'Settlement has been saved.' })
  }

  const syncTechnicianLedgerFromBookings = async (technicianId) => {
    const techId = String(technicianId || '').trim()
    if (!techId) throw new Error('Technician id is required.')

    await withMutating('technicianLedgerSync', async () => {
      const completed = data.bookings.filter(
        (booking) => isBookingCompleted(booking) && String(booking.technicianId || '') === techId,
      )
      for (const booking of completed) {
        await ensureTechnicianEarningForBooking(techId, booking)
      }
    })
    toast.success('Ledger synced from completed bookings.')
  }

  const createBooking = async (booking) => {
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
      const visitingCharge = 0
      if (!Number.isFinite(servicePrice) || servicePrice < 0) throw new Error('Invalid service price.')
      if (!Number.isFinite(visitingCharge) || visitingCharge < 0) throw new Error('Invalid visiting charge.')
      const platformPctRaw = Number(platformSettings?.platformCommissionPercent)
      const platformPct =
        Number.isFinite(platformPctRaw) && platformPctRaw >= 0 && platformPctRaw <= 100
          ? platformPctRaw
          : 30
      const addonPctRaw = Number(platformSettings?.addonFeePercent)
      const addonPct =
        Number.isFinite(addonPctRaw) && addonPctRaw >= 0 && addonPctRaw <= 100 ? addonPctRaw : 10

      const financeFields = buildInitialBookingFinanceFields(
        platformPct,
        addonPct,
        servicePrice,
        visitingCharge,
      )

      const normalizedAddr = normalizeBookingAddressForStorage(booking.address)
      const addrForGeo = formatBookingAddressForDisplay(normalizedAddr)
      if (addrForGeo === '—') throw new Error('Address is required.')

      let lat = parseCoord(booking.latitude)
      let lng = parseCoordLng(booking.longitude)
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

      const durationMinutes = Number(booking.durationMinutes || 60)
      const scheduling = normalizeSchedulingSettings(
        (await fetchDoc('settings', 'scheduling')) || {},
      )
      const descriptors = getSlotDescriptorsForBookingWindow(
        scheduledAtDate,
        durationMinutes + scheduling.travelBufferMinutes,
      )
      if (!descriptors.length) {
        throw new Error('Booking time falls outside schedulable hourly slots (08:00–22:00 IST).')
      }

      const bookingLatLng = { lat, lng }

      if (booking.technicianId) {
        const pickTech = data.technicians.find((t) => t.id === booking.technicianId)
        if (!pickTech) throw new Error('Selected technician not found.')
        if (!isTechnicianAssignable(pickTech)) {
          throw new Error(
            pickTech.suspended === true
              ? 'Selected technician is suspended.'
              : 'Selected technician cannot be assigned until approved.',
          )
        }
        if (!technicianMatchesServiceCategory(pickTech, service)) {
          throw new Error('Selected technician’s category must match this service’s category.')
        }
        const v = await verifyBusySlotsFree(booking.technicianId, descriptors, null)
        if (!v.ok) throw new Error(v.message || 'Technician is not available for this time slot.')
      }

      const tryAutoAssign = async () => {
        if (booking.technicianId) {
          return { technicianId: booking.technicianId, assigned: true, status: 'Assigned' }
        }
        if (!service) {
          return { technicianId: null, assigned: false, status: 'Pending' }
        }
        const candidates = data.technicians.filter(
          (t) =>
            technicianMatchesServiceCategory(t, service) &&
            isTechnicianAssignable(t) &&
            technicianHasValidLocation(t),
        )
        const sorted = [...candidates].sort((a, b) => {
          const da = technicianDistanceKm(a, bookingLatLng)
          const db = technicianDistanceKm(b, bookingLatLng)
          if (da == null && db == null) return String(a.id).localeCompare(String(b.id))
          if (da == null) return 1
          if (db == null) return -1
          return da - db
        })
        for (const tech of sorted) {
          if (
            technicianDailyBookingCount(
              data.bookings,
              tech.id,
              localDateKey(scheduledAtDate),
            ) >= scheduling.maximumDailyBookings
          ) {
            continue
          }
          const v = await verifyBusySlotsFree(tech.id, descriptors, null)
          if (v.ok) return { technicianId: tech.id, assigned: true, status: 'Assigned' }
        }
        return { technicianId: null, assigned: false, status: 'Pending' }
      }

      autoAssigned = await tryAutoAssign()

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
        durationMinutes,
        travelBufferMinutes: scheduling.travelBufferMinutes,
        reservedSlotIndices: descriptors.map((slot) => slot.slotIndex),
        serviceEndsAt: Timestamp.fromMillis(
          scheduledAtDate.getTime() + durationMinutes * 60_000,
        ),
        availabilityEndsAt: Timestamp.fromMillis(
          scheduledAtDate.getTime() +
            (durationMinutes + scheduling.travelBufferMinutes) * 60_000,
        ),
        amount: servicePrice,
        visitingCharge,
        addOnServices: [],
        ...financeFields,
        technicianId: autoAssigned.technicianId || null,
        status: autoAssigned.status,
        ...(autoAssigned.assigned ? { assignedAt: serverTimestamp() } : {}),
        ...(lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          ? { latitude: lat, longitude: lng }
          : {}),
        revisitPolicy: normalizeRevisitPolicy(service?.revisitPolicy || DEFAULT_REVISIT_POLICY),
      }

      newBookingId = await createDoc('bookings', payload)
      await upsertDoc('bookings', newBookingId, { bookingCode: `BK-${newBookingId.slice(-6).toUpperCase()}` })
      if (autoAssigned.technicianId) {
        try {
          await assignPartner({
            bookingId: newBookingId,
            mode: 'specific',
            technicianId: autoAssigned.technicianId,
            dateStr: descriptors[0].dateKey,
            slotIndex: descriptors[0].slotIndex,
            slotLabel: descriptors[0].slotLabel,
            reservedSlotIndices: descriptors.map((slot) => slot.slotIndex),
          })
        } catch (err) {
          await removeDoc('bookings', newBookingId)
          throw err
        }
      }
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
            .filter((s) => s && (String(s.title || '').trim() || String(s.description || '').trim()))
            .map((s) => {
              const title = String(s.title || '').trim()
              const description = String(s.description || '').trim()
              const raw = s.image
              const img =
                raw == null || raw === '' ? null : String(raw).trim() || null
              return { title, description, image: img }
            })
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
              const title = String(v.title || v.name || '').trim()
              const price = Number(v.price)
              const image = String(v.image || '').trim()
              const status = String(v.status || 'Active').trim() || 'Active'
              if (!title || !Number.isFinite(price) || price < 0 || !image) return null
              return { id, title, price, image, status }
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
        revisitPolicy: normalizeRevisitPolicy(service.revisitPolicy || DEFAULT_REVISIT_POLICY),
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

  const normalizeAdditionalServiceType = (raw) => {
    const t = String(raw || '').trim().toLowerCase()
    return t === 'secondary' ? 'Secondary' : 'Main'
  }

  const normalizeAdditionalServiceStatus = (raw) => {
    const s = String(raw || '').trim().toLowerCase()
    return s === 'inactive' ? 'Inactive' : 'Active'
  }

  const upsertAdditionalService = async (item, options = {}) => {
    const title = String(item.title || '').trim()
    if (!title) throw new Error('Title is required.')
    const categoryId = String(item.categoryId || '').trim()
    if (!categoryId) throw new Error('Category is required.')
    const price = Number(item.price)
    if (!Number.isFinite(price) || price < 0) throw new Error('Price must be a non-negative number.')
    const type = normalizeAdditionalServiceType(item.type)
    if (!type) throw new Error('Type is required (Main or Secondary).')
    const status = normalizeAdditionalServiceStatus(item.status)

    let savedId = String(item.id || '').trim()
    await withMutating('additionalService', async () => {
      const payload = { title, price, categoryId, type, status }
      if (savedId) await upsertDoc('additionalServices', savedId, payload)
      else savedId = await createDoc('additionalServices', payload)
    })
    toast.success(options.successToast ?? `“${title}” saved.`)
    return savedId
  }

  const upsertComingSoonService = async (item, options = {}) => {
    const name = String(item.name || '').trim()
    if (!name) throw new Error('Service name is required.')
    const imageUrl = String(item.imageUrl || item.homeImage || '').trim()
    if (!imageUrl) throw new Error('Service image is required.')
    const previewStatus = normalizeAdditionalServiceStatus(item.previewStatus ?? item.status)

    let savedId = String(item.id || '').trim()
    await withMutating('comingSoonService', async () => {
      const comingSoonCategory = normalizeComingSoonCategory(item.comingSoonCategory)
      const displayOrder = Number(item.displayOrder)
      const payload = {
        name,
        imageUrl,
        homeImage: imageUrl,
        listImage: imageUrl,
        detailImage: imageUrl,
        status: 'Coming Soon',
        previewStatus,
        comingSoonCategory,
        displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
        price: 0,
        visitingCharge: 0,
        duration: 60,
        categoryId: '',
        hasVariations: false,
        variations: [],
        description: String(item.description || '').trim(),
      }
      if (savedId) await upsertDoc('services', savedId, payload)
      else savedId = await createDoc('services', payload)
    })
    toast.success(options.successToast ?? `“${name}” saved.`)
    return savedId
  }

  const convertComingSoonToActive = async (serviceId) => {
    const id = String(serviceId || '').trim()
    if (!id) throw new Error('Invalid service id.')
    const row = data.services.find((s) => s.id === id)
    if (!row) throw new Error('Service not found.')
    if (String(row.status || '') !== 'Coming Soon') {
      throw new Error('Only Coming Soon services can be converted.')
    }
    await withMutating('comingSoonConvert', async () => {
      await upsertDoc('services', id, {
        status: 'Inactive',
        previewStatus: 'Inactive',
      })
    })
    toast.success('Moved to Services (Inactive). Complete pricing and set Active when ready.')
  }

  const deleteComingSoonService = async (serviceId) => {
    const id = String(serviceId || '').trim()
    if (!id) throw new Error('Invalid service id.')
    await withMutating('comingSoonDelete', async () => removeDoc('services', id))
    toast.success('Coming soon service removed.')
  }

  const deleteAdditionalService = async (id) => {
    await withMutating('additionalServiceDelete', async () => removeDoc('additionalServices', id))
    toast.success('Additional service removed.')
  }

  const importAdditionalServicesFromCsv = async (rows, options = {}) => {
    const { onProgress } = options
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to import additional services.')
    }
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No valid rows to import.')

    return withMutating('additionalServiceCsvImport', async () => {
      const existingIds = new Set(data.additionalServices.map((s) => s.id))
      let imported = 0
      let updated = 0
      const errors = []
      const total = rows.length

      onProgress?.({ current: 0, total, phase: 'import' })

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i]
        const parsed = parseAdditionalServiceCsvRow(row, data.categories)
        if (!parsed.ok) {
          errors.push({ row: i + 2, reason: parsed.error })
          onProgress?.({ current: i + 1, total, phase: 'import' })
          continue
        }
        const wasExisting = parsed.id && existingIds.has(parsed.id)
        try {
          if (parsed.id) {
            await setDocumentReplace('additionalServices', parsed.id, parsed.payload)
          } else {
            const newId = await createDoc('additionalServices', parsed.payload)
            existingIds.add(newId)
          }
        } catch (e) {
          errors.push({ row: i + 2, reason: e?.message || 'Write failed.' })
          onProgress?.({ current: i + 1, total, phase: 'import' })
          continue
        }
        if (parsed.id) existingIds.add(parsed.id)
        if (wasExisting) updated += 1
        else imported += 1
        onProgress?.({ current: i + 1, total, phase: 'import' })
      }

      if (imported > 0) {
        toast.success('Additional services imported', { description: `${imported} new row(s).` })
      }
      if (updated > 0) {
        toast.success('Additional services updated', { description: `${updated} existing row(s).` })
      }
      if (errors.length) {
        toast.warning(`${errors.length} row(s) skipped.`, {
          description: errors
            .slice(0, 8)
            .map((s) => `Row ${s.row}: ${s.reason}`)
            .join(' · '),
        })
      }
      if (!imported && !updated && !errors.length) {
        toast.message('Nothing imported.')
      }
      return {
        imported,
        updated,
        skipped: errors.length,
        failedRows: errors.length,
        errors,
      }
    })
  }

  const upsertCategory = async (category) => {
    await withMutating('category', async () => {
      const payload = {
        name: category.name,
        icon: category.icon || '',
        videoUrl: String(category.videoUrl || '').trim(),
        videoEnabled: category.videoEnabled !== false,
      }
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
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage offers.')
    }
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
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage offers.')
    }
    await withMutating('offerDelete', async () => removeDoc('offers', offerId))
    toast.success('Offer removed.')
  }


  const upsertBanner = async (banner) => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage banners.')
    }
    const section = normalizeBannerSection(banner.section)
    if (!section) throw new Error('Section is required.')
    const mobileImage = String(banner.mobileImage || '').trim()
    const websiteImage = String(banner.websiteImage || '').trim()
    const image = String(banner.image || mobileImage || websiteImage).trim()
    if (!mobileImage && !websiteImage && !image) {
      throw new Error('Upload at least a mobile or website image.')
    }
    const title = String(banner.title || '').trim()
    const redirectLink = String(banner.redirectLink || '').trim()
    const displayOrder = Number(banner.displayOrder)
    const enabled = banner.enabled !== false && banner.active !== false

    const parseOptionalDate = (raw) => {
      if (raw === '' || raw == null) return null
      const d = raw instanceof Date ? raw : new Date(raw)
      if (Number.isNaN(d.getTime())) throw new Error('Invalid schedule date.')
      return d
    }
    const startAtDate = parseOptionalDate(banner.startAt)
    const endAtDate = parseOptionalDate(banner.endAt)
    if (startAtDate && endAtDate && endAtDate.getTime() < startAtDate.getTime()) {
      throw new Error('Banner end date must be after start date.')
    }

    await withMutating('banner', async () => {
      const payload = {
        title,
        section,
        mobileImage: mobileImage || image,
        websiteImage: websiteImage || image,
        image: image || mobileImage || websiteImage,
        redirectLink,
        displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
        enabled,
        active: enabled,
      }
      if (startAtDate) payload.startAt = Timestamp.fromDate(startAtDate)
      else if (banner.id) payload.startAt = deleteField()
      if (endAtDate) payload.endAt = Timestamp.fromDate(endAtDate)
      else if (banner.id) payload.endAt = deleteField()
      if (banner.id) await upsertDoc('banners', banner.id, payload)
      else await createDoc('banners', payload)
    })
    toast.success('Banner saved.')
  }

  const deleteBanner = async (bannerId) => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage banners.')
    }
    await withMutating('bannerDelete', async () => removeDoc('banners', bannerId))
    toast.success('Banner removed.')
  }

  const upsertHomeSection = async (section) => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage home sections.')
    }
    const payload = normalizeHomeSectionPayload(section)
    await withMutating('homeSection', async () => {
      if (section.id) await upsertDoc('homeSections', section.id, payload)
      else await createDoc('homeSections', payload)
    })
    toast.success('Home section saved.')
  }

  const deleteHomeSection = async (sectionId) => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage home sections.')
    }
    await withMutating('homeSectionDelete', async () => removeDoc('homeSections', sectionId))
    toast.success('Home section removed.')
  }

  const seedDefaultHomeSections = async (sections) => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage home sections.')
    }
    const list = Array.isArray(sections) ? sections : []
    if (!list.length) throw new Error('No default sections to seed.')
    await withMutating('homeSectionSeed', async () => {
      for (const row of list) {
        const payload = normalizeHomeSectionPayload(row)
        await createDoc('homeSections', payload)
      }
    })
    toast.success(`Added ${list.length} default home sections.`)
  }

  const updateRankingSettings = async (patch) => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.TECHNICIAN_MANAGER) {
      throw new Error('Only Super Admins or Technician Managers can update peak hour settings.')
    }
    if (!isFirebaseConfigured || !db) throw new Error('Firebase is not configured.')
    const peakWindows = Array.isArray(patch.peakWindows)
      ? patch.peakWindows.map((w, i) => ({
          startHour: Number(w.startHour),
          endHour: Number(w.endHour),
          label: String(w.label || `Peak ${i + 1}`).trim() || `Peak ${i + 1}`,
          enabled: w.enabled !== false,
        }))
      : DEFAULT_PEAK_WINDOWS
    const penalties = {
      normalLeave: Number(patch?.penalties?.normalLeave ?? DEFAULT_RANKING_PENALTIES.normalLeave),
      peakHourLeave: Number(patch?.penalties?.peakHourLeave ?? DEFAULT_RANKING_PENALTIES.peakHourLeave),
      emergencyLeaveRequiresApproval:
        patch?.penalties?.emergencyLeaveRequiresApproval ??
        DEFAULT_RANKING_PENALTIES.emergencyLeaveRequiresApproval,
    }
    const scoreRewards = normalizeScoreRewards({
      ...(rankingSettings?.scoreRewards || {}),
      ...(patch?.scoreRewards || {}),
    })
    await withMutating('rankingSettings', async () => {
      await upsertDoc('settings', 'ranking', {
        peakWindows,
        penalties,
        scoreRewards,
        silverThreshold: Number(patch.silverThreshold ?? 401),
        goldThreshold: Number(patch.goldThreshold ?? 781),
        blockOfflineDuringPeak: patch.blockOfflineDuringPeak !== false,
        peakHourSlotStart: Number(patch.peakHourSlotStart ?? 1),
        peakHourSlotEnd: Number(patch.peakHourSlotEnd ?? 3),
        peakHoursTarget: Number(patch.peakHoursTarget ?? patch?.peakHoursTargets?.silver ?? 34),
        weekendHoursTarget: Number(patch.weekendHoursTarget ?? 8),
        revisitFreeLimit: Number(patch.revisitFreeLimit ?? 20),
        revisitPctTargets: {
          gold: Number(patch?.revisitPctTargets?.gold ?? 6),
          silver: Number(patch?.revisitPctTargets?.silver ?? 8),
          bronze: Number(patch?.revisitPctTargets?.bronze ?? 10),
        },
        jobsTargets: {
          gold: Number(patch?.jobsTargets?.gold ?? 20),
          silver: Number(patch?.jobsTargets?.silver ?? 24),
          bronze: Number(patch?.jobsTargets?.bronze ?? 30),
        },
        peakHoursTargets: {
          gold: Number(patch?.peakHoursTargets?.gold ?? 30),
          silver: Number(patch?.peakHoursTargets?.silver ?? 34),
          bronze: Number(patch?.peakHoursTargets?.bronze ?? 38),
        },
      })
    })
    toast.success('Peak hour & scoring settings saved.')
  }

  const upsertCoupon = async (coupon) => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage coupons.')
    }
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

    const usageLimitRaw = coupon.usageLimit
    const usageLimit =
      usageLimitRaw === '' || usageLimitRaw == null ? null : Number(usageLimitRaw)
    if (usageLimit != null && (!Number.isFinite(usageLimit) || usageLimit < 0)) {
      throw new Error('Usage limit must be empty or ≥ 0.')
    }

    const perUserLimitRaw = coupon.perUserLimit
    const perUserLimit =
      perUserLimitRaw === '' || perUserLimitRaw == null ? null : Number(perUserLimitRaw)
    if (perUserLimit != null && (!Number.isFinite(perUserLimit) || perUserLimit < 1)) {
      throw new Error('Per-user limit must be empty or ≥ 1.')
    }

    const firstOrderOnly = Boolean(coupon.firstOrderOnly)

    const normalizeIdList = (raw) => {
      if (!Array.isArray(raw)) return []
      return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))]
    }
    const categoryIds = normalizeIdList(coupon.categoryIds)
    const serviceIds = normalizeIdList(coupon.serviceIds)

    const existing = coupon.id ? data.coupons.find((c) => c.id === coupon.id) : null
    const usageCountRaw = Number(existing?.usageCount ?? coupon.usageCount ?? 0)
    const usageCount = Number.isFinite(usageCountRaw) && usageCountRaw >= 0 ? usageCountRaw : 0

    const expiryTs = Timestamp.fromDate(expiryDate)

    await withMutating('coupon', async () => {
      const payload = {
        code,
        discountType,
        discountValue,
        // App-compatible fields (repair-series couponService reads these)
        value: discountValue,
        minOrderAmount,
        expiryDate: expiryTs,
        expiresAt: expiryTs,
        active,
        usageCount,
        firstOrderOnly,
      }
      if (discountType === 'percentage') {
        payload.discountPercent = discountValue
        if (coupon.id) payload.discountFlat = deleteField()
      } else {
        payload.discountFlat = discountValue
        if (coupon.id) payload.discountPercent = deleteField()
      }
      if (maxDiscount != null) payload.maxDiscount = maxDiscount
      else if (coupon.id) payload.maxDiscount = deleteField()
      if (usageLimit != null) payload.usageLimit = usageLimit
      else if (coupon.id) payload.usageLimit = deleteField()
      if (perUserLimit != null) payload.perUserLimit = perUserLimit
      else if (coupon.id) payload.perUserLimit = deleteField()
      // Empty arrays = no restriction (backward compatible with coupons that omit these fields)
      payload.categoryIds = categoryIds
      payload.serviceIds = serviceIds

      if (coupon.id) await upsertDoc('coupons', coupon.id, payload)
      else await createDoc('coupons', payload)
    })
    toast.success('Coupon saved.')
  }

  const deleteCoupon = async (couponId) => {
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to manage coupons.')
    }
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
      const merged = { ...booking, addOnServices: raw }
      const financePatch = buildFinanceWritePatch(merged)
      await updateDocFields('bookings', bookingId, { addOnServices: raw, ...financePatch })
    })
    toast.success('Add-on status updated.')
  }

  /**
   * Resolve technician-app extrasApprovalRequest (different schema from addOnApprovalRequest).
   */
  const resolveExtrasApprovalRequest = async ({ bookingId, approve }) => {
    let notifyCustomerId = ''
    let notifyServiceName = ''
    await withMutating('bookingApprovalRequest', async () => {
      const booking = data.bookings.find((b) => b.id === bookingId)
      if (!booking) throw new Error('Booking not found.')
      notifyCustomerId = String(booking.customerId || '')
      notifyServiceName = String(booking.serviceName || '')
      const req = booking.extrasApprovalRequest
      if (!req || String(req.status || '').toLowerCase() !== 'pending') {
        throw new Error('No pending extras approval from technician.')
      }
      if (approve) {
        const proposed = Array.isArray(req.proposedAddOnServices)
          ? req.proposedAddOnServices
          : Array.isArray(req.proposed_add_on_services)
            ? req.proposed_add_on_services
            : []
        const additional = Array.isArray(req.proposedAdditionalServices)
          ? req.proposedAdditionalServices
          : Array.isArray(req.proposed_additional_services)
            ? req.proposed_additional_services
            : []
        const rows = [
          ...proposed.map((x) => ({
            serviceId: x.serviceId || '',
            serviceName: String(x.serviceName || x.name || 'Extra').trim(),
            price: Number(x.price) || 0,
            serviceType: 'extra',
            approvalStatus: 'approved',
          })),
          ...additional.map((x) => ({
            serviceId: x.additionalServiceId || x.serviceId || '',
            serviceName: String(x.title || x.serviceName || x.name || 'Additional').trim(),
            price: Number(x.price) || 0,
            serviceType: 'additional',
            approvalStatus: 'approved',
          })),
        ].filter((r) => r.serviceName && Number.isFinite(r.price))
        const existing = Array.isArray(booking.addOnServices) ? booking.addOnServices : []
        const raw = [...existing, ...rows]
        const merged = { ...booking, addOnServices: raw }
        const financePatch = buildFinanceWritePatch(merged)
        const replacement = req.replacementService
        const patch = {
          addOnServices: raw,
          extrasApprovalRequest: deleteField(),
          ...financePatch,
        }
        if (replacement && Number(replacement.price) > 0) {
          patch.serviceId = replacement.serviceId || booking.serviceId
          patch.serviceName = replacement.serviceName || booking.serviceName
          patch.amount = Number(replacement.price)
          patch.baseAmount = Number(replacement.price)
        }
        await updateDocFields('bookings', bookingId, patch)
      } else {
        await updateDocFields('bookings', bookingId, {
          extrasApprovalRequest: {
            ...(typeof req === 'object' ? req : {}),
            status: 'rejected',
            resolvedAt: serverTimestamp(),
          },
        })
      }
    })
    toast.success(approve ? 'Technician extras approved.' : 'Technician extras rejected.')
    if (notifyCustomerId) {
      try {
        await enqueueBookingNotification({
          customerId: notifyCustomerId,
          bookingId,
          eventType: approve ? 'add_on_approved' : 'add_on_rejected',
          serviceName: notifyServiceName,
        })
      } catch (err) {
        console.error('[FCM queue] extras approval', err)
      }
    }
  }

  const resolveAddOnApprovalRequest = async ({ bookingId, requestId, approve }) => {
    const rid = String(requestId || '').trim()
    if (!rid) throw new Error('Request id is required.')
    let notifyCustomerId = ''
    let notifyServiceName = ''
    await withMutating('bookingApprovalRequest', async () => {
      const booking = data.bookings.find((b) => b.id === bookingId)
      if (!booking) throw new Error('Booking not found.')
      notifyCustomerId = String(booking.customerId || '')
      notifyServiceName = String(booking.serviceName || '')
      const req = booking.addOnApprovalRequest
      if (!req || String(req.status || '').toLowerCase() !== 'pending') {
        throw new Error('No pending add-on approval request.')
      }
      if (String(req.requestId || '').trim() !== rid) {
        throw new Error('This approval request is outdated. Refresh and try again.')
      }
      if (approve) {
        const rows = approvalLinesToAddOnRows(Array.isArray(req.lines) ? req.lines : [])
        if (!rows.length) throw new Error('Approval request has no line items.')
        const raw = [...(Array.isArray(booking.addOnServices) ? booking.addOnServices : []), ...rows]
        const merged = { ...booking, addOnServices: raw }
        const financePatch = buildFinanceWritePatch(merged)
        await updateDocFields('bookings', bookingId, {
          addOnServices: raw,
          addOnApprovalRequest: {
            ...(typeof req === 'object' ? req : {}),
            status: 'approved',
            resolvedAt: serverTimestamp(),
            lines: [],
          },
          ...financePatch,
        })
      } else {
        await updateDocFields('bookings', bookingId, {
          addOnApprovalRequest: {
            ...(typeof req === 'object' ? req : {}),
            status: 'rejected',
            resolvedAt: serverTimestamp(),
            lines: [],
          },
        })
      }
    })
    toast.success(approve ? 'Add-on request approved and applied.' : 'Add-on request rejected.')
    if (notifyCustomerId) {
      try {
        await enqueueBookingNotification({
          customerId: notifyCustomerId,
          bookingId,
          eventType: approve ? 'add_on_approved' : 'add_on_rejected',
          serviceName: notifyServiceName,
        })
      } catch (err) {
        console.error('[FCM queue] add-on approval', err)
      }
    }
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

  const updatePlatformGeneral = async ({
    defaultTechnicianServiceRadiusKm,
    platformCommissionPercent,
    addonFeePercent,
    sparePartCommissionPercent,
    customerPlatformFeeType,
    customerPlatformFeeValue,
    googleReviewUrl,
    homeReviews,
  }) => {
    if (session?.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Only Super Admins can update platform settings.')
    }
    if (!isFirebaseConfigured || !db) throw new Error('Firebase is not configured.')
    const r = Number(defaultTechnicianServiceRadiusKm)
    if (!Number.isFinite(r) || r <= 0) {
      throw new Error('Technician service radius must be a positive number.')
    }
    const c = Number(platformCommissionPercent)
    if (!Number.isFinite(c) || c < 0 || c > 100) {
      throw new Error('Service commission must be between 0 and 100.')
    }
    const a = Number(addonFeePercent)
    if (!Number.isFinite(a) || a < 0 || a > 100) {
      throw new Error('Additional service commission must be between 0 and 100.')
    }
    const spare = Number(
      sparePartCommissionPercent != null ? sparePartCommissionPercent : addonFeePercent,
    )
    if (!Number.isFinite(spare) || spare < 0 || spare > 100) {
      throw new Error('Spare part commission must be between 0 and 100.')
    }
    const feeType = String(customerPlatformFeeType || 'fixed').toLowerCase() === 'percent'
      ? 'percent'
      : 'fixed'
    const feeVal = Number(customerPlatformFeeValue)
    if (!Number.isFinite(feeVal) || feeVal < 0) {
      throw new Error('Customer platform fee must be 0 or more.')
    }
    if (feeType === 'percent' && feeVal > 100) {
      throw new Error('Customer platform fee percent must be between 0 and 100.')
    }
    await withMutating('platformSettings', async () => {
      const payload = {
        defaultTechnicianServiceRadiusKm: r,
        platformCommissionPercent: c,
        addonFeePercent: a,
        sparePartCommissionPercent: spare,
        customerPlatformFeeType: feeType,
        customerPlatformFeeValue: feeVal,
        financeSettingsUpdatedAt: new Date().toISOString(),
      }
      if (googleReviewUrl != null) {
        payload.googleReviewUrl = String(googleReviewUrl).trim()
      }
      if (homeReviews != null) {
        payload.homeReviews = Array.isArray(homeReviews)
          ? homeReviews
              .map((r) => ({
                name: String(r?.name || '').trim(),
                text: String(r?.text || r?.review || '').trim(),
                rating: Math.min(5, Math.max(1, Number(r?.rating) || 5)),
                area: String(r?.area || '').trim(),
                reviewDate: String(r?.reviewDate || r?.date || '').trim(),
              }))
              .filter((r) => r.name && r.text)
          : []
      }
      await upsertDoc('settings', 'general', payload)
    })
    toast.success('Platform settings saved.')
  }

  const updateGlobalPaymentSettings = async ({ globalUpiId, globalPaymentQr }) => {
    if (session?.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Only Super Admins can update platform settings.')
    }
    if (!isFirebaseConfigured || !db) throw new Error('Firebase is not configured.')
    const gid = String(globalUpiId ?? '')
      .trim()
      .toLowerCase()
    const gqr = String(globalPaymentQr ?? '').trim()
    await withMutating('platformSettings', async () => {
      await upsertDoc('settings', 'general', {
        globalUpiId: gid,
        globalPaymentQr: gqr,
      })
    })
    toast.success('Global payment settings saved.')
  }

  const updateAppPublicSettings = async (patch) => {
    if (session?.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Only Super Admins can update support and legal settings.')
    }
    if (!isFirebaseConfigured || !db) throw new Error('Firebase is not configured.')
    const str = (v) => (v == null ? '' : String(v).trim())
    await withMutating('appSettings', async () => {
      const payload = { updatedAt: serverTimestamp() }
      if (Object.prototype.hasOwnProperty.call(patch, 'supportPhone')) {
        payload.supportPhone = str(patch.supportPhone)
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'supportEmail')) {
        payload.supportEmail = str(patch.supportEmail)
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'aboutApp')) {
        payload.aboutApp = str(patch.aboutApp)
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'customerTerms')) {
        payload.customerTerms = str(patch.customerTerms)
        payload.customerTermsUpdatedAt = serverTimestamp()
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'customerPrivacyPolicy')) {
        payload.customerPrivacyPolicy = str(patch.customerPrivacyPolicy)
        payload.customerPrivacyUpdatedAt = serverTimestamp()
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'partnerTerms')) {
        payload.partnerTerms = str(patch.partnerTerms)
        payload.partnerTermsUpdatedAt = serverTimestamp()
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'partnerPrivacyPolicy')) {
        payload.partnerPrivacyPolicy = str(patch.partnerPrivacyPolicy)
        payload.partnerPrivacyUpdatedAt = serverTimestamp()
      }
      await upsertDoc('settings', 'app', payload)
    })
    toast.success('Support & legal settings saved.')
  }

  const updateServiceAreas = async (areas) => {
    if (session?.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Only Super Admins can manage service areas.')
    }
    if (!isFirebaseConfigured || !db) throw new Error('Firebase is not configured.')
    const list = Array.isArray(areas) ? areas : []
    const normalized = list
      .map((row, index) => {
        const name = String(row?.name || '').trim()
        const slug =
          String(row?.slug || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') ||
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
        const pincodePrefixes = Array.isArray(row?.pincodePrefixes)
          ? [...new Set(row.pincodePrefixes.map((p) => String(p || '').trim()).filter(Boolean))]
          : String(row?.pincodePrefixesText || '')
              .split(/[\s,]+/)
              .map((p) => p.trim())
              .filter(Boolean)
        return {
          id: String(row?.id || slug || `area-${index + 1}`),
          name,
          slug,
          active: row?.active !== false,
          pincodePrefixes,
        }
      })
      .filter((row) => row.name && row.slug)
    await withMutating('serviceAreas', async () => {
      await upsertDoc('settings', 'general', { serviceAreas: normalized })
    })
    toast.success('Service areas saved.')
    return normalized
  }

  const importServicesFromCsv = async (rows, options = {}) => {
    const { onProgress } = options
    if (session?.role !== ROLES.SUPER_ADMIN && session?.role !== ROLES.SERVICE_MANAGER) {
      throw new Error('You are not allowed to import services.')
    }
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No valid rows to import.')

    return withMutating('serviceCsvImport', async () => {
      const existingIds = new Set(data.services.map((s) => s.id))
      let imported = 0
      let updated = 0
      let variationCount = 0
      const errors = []
      const total = rows.length

      onProgress?.({ current: 0, total, phase: 'import' })

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i]
        const parsed = parseServiceCsvRow(row, data.categories)
        if (!parsed.ok) {
          errors.push({ row: i + 2, reason: parsed.error })
          onProgress?.({ current: i + 1, total, phase: 'import' })
          continue
        }
        const wasExisting = existingIds.has(parsed.id)
        try {
          await setDocumentReplace('services', parsed.id, parsed.payload)
        } catch (e) {
          errors.push({ row: i + 2, reason: e?.message || 'Write failed.' })
          onProgress?.({ current: i + 1, total, phase: 'import' })
          continue
        }
        existingIds.add(parsed.id)
        variationCount += parsed.variationCount
        if (wasExisting) updated += 1
        else imported += 1
        onProgress?.({ current: i + 1, total, phase: 'import' })
      }

      if (imported > 0) {
        toast.success('Service imported successfully', { description: `${imported} new service(s).` })
      }
      if (updated > 0) {
        toast.success('Existing service updated', { description: `${updated} service(s) updated.` })
      }
      if (errors.length) {
        toast.warning(`${errors.length} row(s) skipped.`, {
          description: errors
            .slice(0, 8)
            .map((s) => `Row ${s.row}: ${s.reason}`)
            .join(' · '),
        })
      }
      if (!imported && !updated && !errors.length) {
        toast.message('Nothing imported.')
      }
      return {
        imported,
        updated,
        skipped: errors.length,
        failedRows: errors.length,
        errors,
        variationCount,
      }
    })
  }

  const metrics = useMemo(() => {
    const completed = data.bookings.filter((booking) => isBookingCompleted(booking))
    const pending = data.bookings.filter((booking) =>
      ['Pending', 'New', 'Assigned', 'Started'].includes(booking.status),
    )
    const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
    const todayBookings = data.bookings.filter((booking) => {
      const raw = booking.scheduledAt?.toDate?.() || booking.dateTime || booking.scheduledAt
      if (!raw) return false
      const bookingKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(raw))
      return bookingKey === todayKey
    })
    const platformEarnings = completed.reduce(
      (total, booking) => total + getStoredBookingTotalDeduction(booking),
      0,
    )
    const cancelled = data.bookings.filter((b) => String(b.status).toLowerCase() === 'cancelled')
    let technicianEarnings = 0
    let companyEarnings = 0
    let visitingCharges = 0
    let platformFees = 0
    completed.forEach((b) => {
      const fin = computeFinanceBreakdown(b)
      technicianEarnings += fin.technicianFinalEarning
      companyEarnings += fin.companyEarnings
      visitingCharges += fin.visitingCharge
      platformFees += fin.platformFeeAmount
    })
    return {
      totalOrdersCompleted: completed.length,
      totalBookings: data.bookings.length,
      cancelledBookings: cancelled.length,
      pendingBookings: pending.length,
      platformEarnings,
      technicianEarnings,
      companyEarnings,
      visitingCharges,
      platformFees,
      todaysBookings: todayBookings.length,
    }
  }, [data.bookings])

  const value = {
    ...data,
    platformSettings,
    rankingSettings,
    appSettings,
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
    unassignTechnician,
    rescheduleBooking,
    updateBookingPayment,
    updateBookingRevisitRemaining,
    addCustomerSupportNote,
    approveTechnician,
    rejectTechnician,
    suspendTechnician,
    updateBookingStatus,
    recordTechnicianPayout,
    syncTechnicianLedgerFromBookings,
    createBooking,
    updateBookingAddOnApproval,
    resolveAddOnApprovalRequest,
    resolveExtrasApprovalRequest,
    backfillMissingBookingCoordinates,
    upsertService,
    deleteService,
    upsertCategory,
    deleteCategory,
    upsertFaq,
    deleteFaq,
    upsertOffer,
    deleteOffer,
    upsertBanner,
    deleteBanner,
    upsertHomeSection,
    deleteHomeSection,
    seedDefaultHomeSections,
    updateRankingSettings,
    upsertCoupon,
    deleteCoupon,
    updatePlatformGeneral,
    updateGlobalPaymentSettings,
    updateAppPublicSettings,
    updateServiceAreas,
    importServicesFromCsv,
    importAdditionalServicesFromCsv,
    upsertAdditionalService,
    deleteAdditionalService,
    upsertComingSoonService,
    convertComingSoonToActive,
    deleteComingSoonService,
    createAdminUser,
    updateAdminUser,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export { AppContext }