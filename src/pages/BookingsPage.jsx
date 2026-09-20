import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Modal, PageHeader, SearchInput, Select, Textarea, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { exportRows } from '../services/csv'
import {
  getStoredBookingTotalAmount,
  getStoredBookingTotalDeduction,
  getStoredTechnicianPayout,
} from '../utils/bookingStoredAmounts'
import {
  currency,
  formatDateTime,
  getBookingApprovedAddOns,
  getBookingBaseAmount,
  getBookingPendingAddOns,
  getBookingVisitingCharge,
  normalizeBookingAddOnServices,
  formatSkillsDisplay,
} from '../utils/helpers'
import {
  addressToFormString,
  bookingAddressSearchText,
  formatBookingAddressForDisplay,
  formatBookingAddressShort,
  normalizeBookingAddressForStorage,
} from '../utils/bookingAddress'
import { ROLES } from '../utils/rbac'
import { verifyBusySlotsFree } from '../services/technicianBusySlots'
import { getSlotDescriptorsForBookingWindow } from '../utils/technicianSlots'
import { geocodeAddressString } from '../services/geocode'
import { getBookingLatLng, getTechnicianLatLng, haversineDistanceKm, parseCoord, parseCoordLng } from '../utils/geo'
import { isTechnicianAssignable } from '../utils/technicianVerification'
import { BookingWorkProofSection } from '../components/BookingWorkProofSection'
import { downloadInvoicePdf, regenerateInvoice } from '../services/invoiceFunctions'

async function openBookingInvoicePdf(booking) {
  const stored = String(booking?.invoicePdfUrl || '').trim()
  if (/res\.cloudinary\.com/i.test(stored)) {
    window.open(stored, '_blank', 'noopener,noreferrer')
    return stored
  }
  await downloadInvoicePdf({
    bookingId: booking.id,
    fileName: booking.invoiceNumber ? `${booking.invoiceNumber}.pdf` : undefined,
  })
  return stored
}
import {
  DEFAULT_SCHEDULING_SETTINGS,
  subscribeSchedulingSettings,
} from '../services/schedulingSettings'

const statusPriority = {
  New: 1,
  Assigned: 2,
  Pending: 2,
  InProgress: 3,
  Started: 3,
  Paused: 3,
  Completed: 5,
  Cancelled: 6,
  Canceled: 6,
}

function bookingStatusTone(status) {
  const s = String(status || '')
  if (s === 'Completed') return 'success'
  if (s === 'Assigned' || s === 'InProgress' || s === 'Started') return 'info'
  if (s === 'Paused' || s === 'Pending') return 'warning'
  if (s === 'Cancelled' || s === 'Canceled') return 'danger'
  return 'warning'
}

function bookingListTitle(booking) {
  return String(booking.bookingCode || booking.id || 'Booking').trim()
}

function toDateTimeLocal(ts) {
  const d = ts?.toDate?.() ? ts.toDate() : ts instanceof Date ? ts : ts ? new Date(ts) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getTechnicianRankingScore(technician) {
  const n = Number(
    technician?.rankingScore ?? technician?.performanceScore ?? technician?.score ?? technician?.totalScore,
  )
  return Number.isFinite(n) ? n : 0
}

function technicianDistanceKm(technician, bookingLatLng) {
  const { lat: tLat, lng: tLng } = getTechnicianLatLng(technician)
  const { lat: bLat, lng: bLng } = bookingLatLng || {}
  if (tLat == null || tLng == null || bLat == null || bLng == null) return null
  return haversineDistanceKm(tLat, tLng, bLat, bLng)
}

function isCancellableStatus(status) {
  const s = String(status || '').toLowerCase().replace(/\s+/g, '')
  return !['completed', 'cancelled', 'canceled'].includes(s)
}

function canUnassignStatus(status) {
  const s = String(status || '').toLowerCase().replace(/\s+/g, '')
  return ['new', 'assigned', 'pending'].includes(s)
}

function AddonServicesList({ addOns }) {
  if (!addOns.length) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">None</p>
  }
  return (
    <ul className="space-y-1.5">
      {addOns.map((a, i) => (
        <li
          key={`${a.serviceName}-${i}-${a.approvalStatus}`}
          className="flex justify-between gap-3 text-sm text-slate-700 dark:text-slate-200"
        >
          <span className="min-w-0 flex-1 truncate">
            <span className="mr-2 rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {a.serviceType === 'additional' ? 'Additional' : 'Extra'}
            </span>
            {a.serviceName}
            {a.approvalStatus && a.approvalStatus !== 'approved' ? (
              <Badge tone={a.approvalStatus === 'pending' ? 'warning' : 'neutral'}>
                {a.approvalStatus}
              </Badge>
            ) : null}
          </span>
          <span className="shrink-0 tabular-nums font-medium">{currency(a.price)}</span>
        </li>
      ))}
    </ul>
  )
}

function BookingPricingSection({
  booking,
  compact = false,
  showAddOnActions = false,
  onSetAddOnStatus,
  mutatingAddOn = false,
  onResolveApprovalRequest,
  mutatingApprovalRequest = false,
  onResolveExtrasApproval = null,
}) {
  const storedTotal = getStoredBookingTotalAmount(booking)
  const storedDeduction = getStoredBookingTotalDeduction(booking)
  const storedPayout = getStoredTechnicianPayout(booking)
  const approvedNorm = getBookingApprovedAddOns(booking)
  const pendingNorm = getBookingPendingAddOns(booking)
  const baseAmount = getBookingBaseAmount(booking)
  const visiting = getBookingVisitingCharge(booking)
  const baseName = booking.serviceName || 'Base service'
  const variationTitle = String(booking.serviceVariationTitle || '').trim()
  const rawAddOns = Array.isArray(booking.addOnServices) ? booking.addOnServices : []

  const extraApproved = approvedNorm.filter((x) => x.serviceType !== 'additional')
  const additionalApproved = approvedNorm.filter((x) => x.serviceType === 'additional')
  const extraSum = extraApproved.reduce((s, x) => s + x.price, 0)
  const additionalSum = additionalApproved.reduce((s, x) => s + x.price, 0)

  const ar = booking.addOnApprovalRequest
  const batchPending =
    ar &&
    String(ar.status || '').toLowerCase() === 'pending' &&
    Array.isArray(ar.lines) &&
    ar.lines.length > 0

  const extrasReq = booking.extrasApprovalRequest
  const extrasPending = extrasReq && String(extrasReq.status || '').toLowerCase() === 'pending'
  const extrasLines = [
    ...(Array.isArray(extrasReq?.proposedAddOnServices) ? extrasReq.proposedAddOnServices : []),
    ...(Array.isArray(extrasReq?.proposed_add_on_services) ? extrasReq.proposed_add_on_services : []),
    ...(Array.isArray(extrasReq?.proposedAdditionalServices)
      ? extrasReq.proposedAdditionalServices
      : []),
    ...(Array.isArray(extrasReq?.proposed_additional_services)
      ? extrasReq.proposed_additional_services
      : []),
  ]

  const commission = (
    <div className="space-y-2 text-slate-600 dark:text-slate-400">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Amounts on this booking in Firestore — not recalculated in the admin panel.
      </p>
      <p className="flex justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
        <span>Total booking amount</span>
        <span className="tabular-nums">{currency(storedTotal)}</span>
      </p>
      <p className="flex justify-between text-sm">
        <span>Total deduction</span>
        <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
          {currency(storedDeduction)}
        </span>
      </p>
      <p className="flex justify-between text-sm">
        <span>Technician earning</span>
        <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
          {currency(storedPayout)}
        </span>
      </p>
    </div>
  )

  const priceBlockInner = (
    <>
      <p className="mt-1 flex justify-between gap-2 text-slate-800 dark:text-slate-100">
        <span className="min-w-0 truncate">{baseName}</span>
        <span className="shrink-0 tabular-nums font-semibold">{currency(baseAmount)}</span>
      </p>
      {variationTitle ? (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Selected variation: <span className="font-medium text-slate-800 dark:text-slate-200">{variationTitle}</span>
        </p>
      ) : null}
      {visiting > 0 ? (
        <p className="mt-1 flex justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span>Visiting charge</span>
          <span className="tabular-nums">{currency(visiting)}</span>
        </p>
      ) : null}
    </>
  )

  const techExtrasBlock = extrasPending ? (
    <div className="rounded-xl border border-orange-300/80 bg-orange-50/70 p-3 dark:border-orange-500/30 dark:bg-orange-950/25">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-200">
        Technician extras (awaiting approval)
      </p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        From the technician app (`extrasApprovalRequest`). Approve to apply to the booking total.
      </p>
      <ul className="mt-2 space-y-1.5">
        {extrasLines.length ? (
          extrasLines.map((line, idx) => (
            <li
              key={`extras-${idx}`}
              className="flex justify-between gap-2 text-sm text-slate-800 dark:text-slate-100"
            >
              <span className="min-w-0 truncate">
                {(line.serviceName || line.title || line.name || 'Item').trim()}
              </span>
              <span className="shrink-0 tabular-nums">{currency(line.price)}</span>
            </li>
          ))
        ) : (
          <li className="text-sm text-slate-600">Pending extras (see booking details / customer app).</li>
        )}
      </ul>
      {extrasReq?.replacementService ? (
        <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
          Replacement service:{' '}
          <span className="font-semibold">
            {extrasReq.replacementService.serviceName || extrasReq.replacementService.serviceId}
          </span>
        </p>
      ) : null}
      {onResolveExtrasApproval ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            disabled={mutatingApprovalRequest}
            onClick={() => onResolveExtrasApproval({ approve: true })}
          >
            Approve extras
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-xs text-red-700 dark:text-red-300"
            disabled={mutatingApprovalRequest}
            onClick={() => onResolveExtrasApproval({ approve: false })}
          >
            Reject extras
          </Button>
        </div>
      ) : null}
    </div>
  ) : null

  const batchApprovalBlock = batchPending ? (
    <div className="rounded-xl border border-violet-300/80 bg-violet-50/70 p-3 dark:border-violet-500/30 dark:bg-violet-950/25">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
        Pending customer approval (batch)
      </p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Technician submitted these items for approval. They are not billed until the customer (or an admin below)
        approves.
      </p>
      <ul className="mt-2 space-y-1.5">
        {ar.lines.map((line, idx) => (
          <li key={`batch-${idx}`} className="flex justify-between gap-2 text-sm text-slate-800 dark:text-slate-100">
            <span className="min-w-0">
              <span className="mr-2 rounded bg-violet-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-900 dark:bg-violet-800 dark:text-violet-100">
                {String(line.serviceType || 'extra').toLowerCase() === 'additional' ? 'Additional' : 'Extra'}
              </span>
              {(line.serviceName || line.title || '').trim() || 'Item'}
            </span>
            <span className="shrink-0 tabular-nums">{currency(line.price)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between text-sm font-semibold text-slate-900 dark:text-white">
        <span>Proposed new total</span>
        <span className="tabular-nums text-violet-700 dark:text-violet-300">
          {currency(ar.proposedFinalAmount ?? storedTotal)}
        </span>
      </p>
      {onResolveApprovalRequest ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            disabled={mutatingApprovalRequest}
            onClick={() => onResolveApprovalRequest({ requestId: ar.requestId, approve: true })}
          >
            Approve request
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-xs text-red-700 dark:text-red-300"
            disabled={mutatingApprovalRequest}
            onClick={() => onResolveApprovalRequest({ requestId: ar.requestId, approve: false })}
          >
            Reject request
          </Button>
        </div>
      ) : null}
    </div>
  ) : null

  const addOnSections = (
    <>
      {techExtrasBlock}
      {batchApprovalBlock}
      {(extraSum > 0 || additionalSum > 0) && (
        <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-400">
          {extraSum > 0 ? (
            <p className="flex justify-between">
              <span>Extra services (approved)</span>
              <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">{currency(extraSum)}</span>
            </p>
          ) : null}
          {additionalSum > 0 ? (
            <p className="flex justify-between">
              <span>Additional services (approved)</span>
              <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">
                {currency(additionalSum)}
              </span>
            </p>
          ) : null}
        </div>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Add-ons (approved — counted in total)
        </p>
        <div className="mt-1">
          <AddonServicesList addOns={approvedNorm} />
        </div>
      </div>
      {pendingNorm.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Legacy line-level pending (per row)
          </p>
          <ul className="mt-1 space-y-2">
            {rawAddOns.map((item, index) => {
              const [norm] = normalizeBookingAddOnServices({ addOnServices: [item] })
              if (!norm || norm.approvalStatus !== 'pending') return null
              return (
                <li
                  key={`pend-${index}`}
                  className="flex flex-col gap-2 rounded-lg border border-amber-200/80 bg-amber-50/50 p-2 dark:border-amber-500/20 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm text-slate-800 dark:text-slate-100">
                    {norm.serviceName} · {currency(norm.price)}
                  </span>
                  {showAddOnActions && onSetAddOnStatus ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs"
                        disabled={mutatingAddOn}
                        onClick={() => onSetAddOnStatus(index, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs text-red-700 dark:text-red-300"
                        disabled={mutatingAddOn}
                        onClick={() => onSetAddOnStatus(index, 'rejected')}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </>
  )

  if (compact) {
    return (
      <div className="mt-1 space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Service & pricing
          </p>
          {priceBlockInner}
        </div>
        {addOnSections}
        <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 px-3 py-2.5 dark:border-blue-500/25 dark:bg-blue-950/25">
          {commission}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-slate-600 dark:bg-slate-800/40">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Service & pricing
        </h4>
        <div className="mt-2">{priceBlockInner}</div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-slate-600 dark:bg-slate-800/40">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Add-ons
        </h4>
        <div className="mt-3 space-y-4">{addOnSections}</div>
      </div>
      <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 p-4 dark:border-blue-500/25 dark:bg-blue-950/25">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Totals (Firestore)
        </h4>
        <div className="mt-3">{commission}</div>
      </div>
    </div>
  )
}

export function BookingsPage() {
  const [schedulingSettings, setSchedulingSettings] = useState(DEFAULT_SCHEDULING_SETTINGS)
  useEffect(() => {
    const unsubscribe = subscribeSchedulingSettings(setSchedulingSettings, () => {})
    return () => unsubscribe?.()
  }, [])

  const {
    bookings,
    customers,
    technicians,
    services,
    categories,
    session,
    assignTechnician,
    unassignTechnician,
    rescheduleBooking,
    updateBookingPayment,
    updateBookingStatus,
    createBooking,
    updateBookingAddOnApproval,
    resolveAddOnApprovalRequest,
    resolveExtrasApprovalRequest,
    backfillMissingBookingCoordinates,
    loading,
    mutating,
    rankingSettings,
  } = useApp()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalState, setModalState] = useState({ mode: null, booking: null })
  const [selectedTechnician, setSelectedTechnician] = useState('')
  const [rescheduleAt, setRescheduleAt] = useState('')
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
    variationId: '',
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

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  const assignableRoster = useMemo(() => technicians.filter(isTechnicianAssignable), [technicians])

  const selectedCreateService = createForm.serviceId ? serviceMap[createForm.serviceId] : null

  const sortedBookings = useMemo(
    () =>
      bookings
        .filter((booking) => {
          if (statusFilter !== 'all') {
            const st = String(booking.status || '')
            if (statusFilter === 'InProgress') {
              if (!['InProgress', 'Started', 'Paused'].includes(st)) return false
            } else if (st !== statusFilter) {
              return false
            }
          }
          const cust = customerMap[booking.customerId]
          const addOnNames = Array.isArray(booking.addOnServices)
            ? booking.addOnServices
                .map((a) => (a && typeof a === 'object' ? a.serviceName ?? a.name : ''))
                .join(' ')
            : ''
          return [
            booking.id,
            booking.bookingCode,
            booking.serviceName,
            booking.serviceVariationTitle,
            booking.customerId,
            cust?.name,
            cust?.phone,
            cust?.email,
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
    [bookings, search, statusFilter, customerMap],
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
      variationId: '',
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
      if (!createOpen) {
        setCreateAvailability({ loading: false, busyTechIds: new Set(), error: '' })
        return
      }
      const start = parseDateTimeLocal(createForm.scheduledAt)
      const service = serviceMap[createForm.serviceId]
      const durationMinutes = Number(service?.duration || 60)
      if (!start || !service) {
        setCreateAvailability({ loading: false, busyTechIds: new Set(), error: '' })
        return
      }

      const descriptors = getSlotDescriptorsForBookingWindow(
        start,
        durationMinutes + schedulingSettings.travelBufferMinutes,
      )
      if (!descriptors.length) {
        setCreateAvailability({
          loading: false,
          busyTechIds: new Set(assignableRoster.map((t) => t.id)),
          error: 'Selected time is outside schedulable slots (08:00–22:00 IST).',
        })
        return
      }

      setCreateAvailability({ loading: true, busyTechIds: new Set(), error: '' })
      try {
        const addrLine = createForm.address.trim()
        const normalizedAddr = normalizeBookingAddressForStorage(addrLine)
        const addrForGeo = formatBookingAddressForDisplay(normalizedAddr)
        let lat = parseCoord(createForm.latitude)
        let lng = parseCoordLng(createForm.longitude)
        if ((lat == null || lng == null) && addrForGeo !== '—') {
          try {
            const geo = await geocodeAddressString(addrForGeo)
            lat = geo.lat
            lng = geo.lng
          } catch {
            /* optional geocode */
          }
        }
        const busy = new Set()
        const candidates = assignableRoster.filter((t) => {
          if (!service?.categoryId) return true
          return String(t.categoryId || '').trim() === service.categoryId
        })
        for (const t of candidates) {
          const v = await verifyBusySlotsFree(t.id, descriptors, null)
          if (!v.ok) busy.add(t.id)
        }
        setCreateAvailability({ loading: false, busyTechIds: busy, error: '' })
      } catch {
        setCreateAvailability({
          loading: false,
          busyTechIds: new Set(),
          error: 'Could not verify technician slots. Check your connection and Firestore rules.',
        })
      }
    }
    run()
  }, [
    createOpen,
    createForm.scheduledAt,
    createForm.serviceId,
    createForm.address,
    createForm.latitude,
    createForm.longitude,
    serviceMap,
    assignableRoster,
    schedulingSettings.travelBufferMinutes,
  ])

  const baseCreateTechnicians = useMemo(
    () => assignableRoster.filter((t) => !createAvailability.busyTechIds.has(t.id)),
    [assignableRoster, createAvailability.busyTechIds],
  )

  const createAvailableTechnicians = useMemo(() => {
    const svc = selectedCreateService
    return baseCreateTechnicians.filter((t) => {
      if (!svc?.categoryId) return true
      return String(t.categoryId || '').trim() === svc.categoryId
    })
  }, [baseCreateTechnicians, selectedCreateService])

  useEffect(() => {
    const s = selectedCreateService
    if (!s?.hasVariations || !createForm.variationId) return
    const v = (s.variations || []).find((x) => String(x.id) === String(createForm.variationId))
    if (v == null) return
    const nextAmount = String(v.price ?? '')
    setCreateForm((c) => (c.amount === nextAmount ? c : { ...c, amount: nextAmount }))
  }, [selectedCreateService, createForm.variationId])

  useEffect(() => {
    const loadAvailability = async () => {
      if (modalState.mode !== 'assign' || !modalState.booking) {
        setAvailability({ loading: false, busyTechIds: new Set(), error: '' })
        return
      }
      const booking = modalState.booking
      const bookingStart = booking.scheduledAt?.toDate?.()
        ? booking.scheduledAt.toDate()
        : booking.dateTime
          ? new Date(booking.dateTime)
          : null

      if (!bookingStart || Number.isNaN(bookingStart.getTime())) {
        setAvailability({ loading: false, busyTechIds: new Set(), error: '' })
        return
      }

      const service = serviceMap[booking.serviceId]
      const durationMinutes = Number(booking.durationMinutes || 60)
      const descriptors = getSlotDescriptorsForBookingWindow(
        bookingStart,
        durationMinutes + schedulingSettings.travelBufferMinutes,
      )
      if (!descriptors.length) {
        setAvailability({
          loading: false,
          busyTechIds: new Set(assignableRoster.map((t) => t.id)),
          error: 'Booking time is outside schedulable slots (08:00–22:00 IST).',
        })
        return
      }

      setAvailability({ loading: true, busyTechIds: new Set(), error: '' })
      try {
        const busy = new Set()
        const bookingId = booking.id
        const candidates = assignableRoster.filter((t) => {
          if (service?.categoryId && String(t.categoryId || '').trim() !== service.categoryId) return false
          return true
        })
        for (const t of candidates) {
          const v = await verifyBusySlotsFree(t.id, descriptors, bookingId)
          if (!v.ok) busy.add(t.id)
        }
        setAvailability({ loading: false, busyTechIds: busy, error: '' })
      } catch {
        setAvailability({
          loading: false,
          busyTechIds: new Set(),
          error: 'Could not verify technician slots. Check your connection and Firestore rules.',
        })
      }
    }

    loadAvailability()
  }, [
    modalState.mode,
    modalState.booking,
    assignableRoster,
    serviceMap,
    schedulingSettings.travelBufferMinutes,
  ])

  useEffect(() => {
    if (!createForm.technicianId) return
    const stillOk = createAvailableTechnicians.some((t) => t.id === createForm.technicianId)
    if (!stillOk) setCreateForm((c) => ({ ...c, technicianId: '' }))
  }, [createForm.technicianId, createAvailableTechnicians])

  const baseAssignTechnicians = useMemo(
    () => assignableRoster.filter((technician) => !availability.busyTechIds.has(technician.id)),
    [assignableRoster, availability.busyTechIds],
  )

  const assignBookingService = modalState.booking?.serviceId
    ? serviceMap[modalState.booking.serviceId]
    : null

  const availableTechnicians = useMemo(() => {
    const svc = assignBookingService
    const filtered = baseAssignTechnicians.filter((t) => {
      if (!svc?.categoryId) return true
      return String(t.categoryId || '').trim() === svc.categoryId
    })
    const bookingLatLng = modalState.booking ? getBookingLatLng(modalState.booking) : { lat: null, lng: null }
    const hasRanking =
      Boolean(rankingSettings?.peakWindows?.length) ||
      filtered.some((t) => getTechnicianRankingScore(t) > 0)
    if (!hasRanking) return filtered
    return [...filtered].sort((a, b) => {
      const scoreDiff = getTechnicianRankingScore(b) - getTechnicianRankingScore(a)
      if (scoreDiff !== 0) return scoreDiff
      const da = technicianDistanceKm(a, bookingLatLng)
      const db = technicianDistanceKm(b, bookingLatLng)
      if (da == null && db == null) return String(a.name || '').localeCompare(String(b.name || ''))
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
  }, [baseAssignTechnicians, assignBookingService, modalState.booking, rankingSettings])

  useEffect(() => {
    if (!modalState.booking?.id) return
    const live = bookings.find((b) => b.id === modalState.booking.id)
    if (live && live !== modalState.booking) {
      setModalState((cur) => (cur.booking ? { ...cur, booking: live } : cur))
    }
  }, [bookings, modalState.booking])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Booking Management"
        description="Prioritize new work, assign staff quickly, and keep scheduling clear."
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search code, customer, service..."
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-w-[140px]"
            >
              <option value="all">All statuses</option>
              <option value="New">New</option>
              <option value="Assigned">Assigned</option>
              <option value="InProgress">In progress</option>
              <option value="Paused">Paused</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
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
        {!loading.bookings && sortedBookings.length === 0 ? (
          <Card>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">No bookings found</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Try another search or status filter, or create a booking.
            </p>
          </Card>
        ) : null}
        {sortedBookings.map((booking) => (
          <Card key={booking.id} className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {bookingListTitle(booking)}
                </h3>
                <Badge tone={bookingStatusTone(booking.status)}>
                  {booking.status || 'Unknown'}
                </Badge>
                {booking.isRevisit === true ? <Badge tone="info">Revisit</Badge> : null}
                {booking.extrasApprovalRequest?.status === 'pending' ? (
                  <Badge tone="warning">Extras pending</Badge>
                ) : null}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Service: {booking.serviceName}
              </p>
              {booking.serviceVariationTitle ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Variation: {booking.serviceVariationTitle}
                </p>
              ) : null}
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
              <BookingPricingSection
                booking={booking}
                compact
                onResolveApprovalRequest={async ({ requestId, approve }) => {
                  try {
                    await resolveAddOnApprovalRequest({ bookingId: booking.id, requestId, approve })
                  } catch (e) {
                    toast.error(e.message)
                  }
                }}
                onResolveExtrasApproval={async ({ approve }) => {
                  try {
                    await resolveExtrasApprovalRequest({ bookingId: booking.id, approve })
                  } catch (e) {
                    toast.error(e.message)
                  }
                }}
                mutatingApprovalRequest={Boolean(mutating.bookingApprovalRequest)}
              />
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
              {booking.technicianId && canUnassignStatus(booking.status) ? (
                <Button
                  variant="ghost"
                  disabled={Boolean(mutating.bookingUnassign)}
                  onClick={async () => {
                    if (!window.confirm('Unassign technician and set status back to New?')) return
                    try {
                      await unassignTechnician({ bookingId: booking.id })
                    } catch (e) {
                      toast.error(e.message)
                    }
                  }}
                >
                  Unassign
                </Button>
              ) : null}
              {isCancellableStatus(booking.status) ? (
                <Button
                  variant="danger"
                  disabled={Boolean(mutating.bookingStatus)}
                  onClick={async () => {
                    const reason = window.prompt(
                      'Cancel reason (shown for support / customer context):',
                      'Cancelled by admin',
                    )
                    if (reason == null) return
                    if (!window.confirm('Cancel this booking? Customer will be notified.')) return
                    try {
                      await updateBookingStatus({
                        bookingId: booking.id,
                        status: 'Cancelled',
                        cancelReason: reason,
                        cancelledBy: session?.email || session?.id || 'admin',
                      })
                    } catch (e) {
                      toast.error(e.message)
                    }
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              {booking.status === 'Assigned' ? (
                <Button
                  variant="secondary"
                  disabled={Boolean(mutating.bookingStatus)}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'Mark this booking InProgress? Prefer technician OTP flow when possible.',
                      )
                    ) {
                      return
                    }
                    try {
                      await updateBookingStatus({
                        bookingId: booking.id,
                        status: 'InProgress',
                      })
                    } catch (e) {
                      toast.error(e.message)
                    }
                  }}
                >
                  Mark started
                </Button>
              ) : null}
              {booking.status !== 'Completed' &&
              booking.status !== 'New' &&
              booking.status !== 'Cancelled' &&
              booking.status !== 'Canceled' ? (
                <Button
                  variant="ghost"
                  disabled={Boolean(mutating.bookingStatus)}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'Mark this booking Completed? This may affect technician earnings.',
                      )
                    ) {
                      return
                    }
                    try {
                      await updateBookingStatus({ bookingId: booking.id, status: 'Completed' })
                    } catch (e) {
                      toast.error(e.message)
                    }
                  }}
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
        onClose={() => {
          setModalState({ mode: null, booking: null })
          setRescheduleAt('')
        }}
        className={modalState.mode === 'details' ? 'max-w-4xl' : undefined}
      >
        {modalState.booking ? (
          modalState.mode === 'details' ? (
            <div className="space-y-6 text-sm">
              <div className="grid gap-6 md:grid-cols-2">
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
                  {modalState.booking.serviceVariationTitle ? (
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">Variation: </span>
                      {modalState.booking.serviceVariationTitle}
                    </p>
                  ) : null}
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
                  <p className="text-slate-700 dark:text-slate-300">
                    <span className="text-slate-500 dark:text-slate-400">Technician: </span>
                    {modalState.booking.technicianId
                      ? technicians.find((t) => t.id === modalState.booking.technicianId)?.name ||
                        modalState.booking.technicianId
                      : '—'}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">
                    <span className="text-slate-500 dark:text-slate-400">Payment: </span>
                    {modalState.booking.paymentStatus || '—'}
                  </p>
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-600 dark:bg-slate-800/40">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Payment ops
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['paid', 'unpaid', 'refunded'].map((status) => (
                        <Button
                          key={status}
                          type="button"
                          variant="ghost"
                          className="text-xs capitalize"
                          disabled={Boolean(mutating.bookingPayment)}
                          onClick={async () => {
                            try {
                              await updateBookingPayment({
                                bookingId: modalState.booking.id,
                                paymentStatus: status,
                              })
                            } catch (e) {
                              toast.error(e.message)
                            }
                          }}
                        >
                          Mark {status}
                        </Button>
                      ))}
                      {modalState.booking.paymentRequest ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-xs text-amber-700 dark:text-amber-300"
                          disabled={Boolean(mutating.bookingPayment)}
                          onClick={async () => {
                            try {
                              await updateBookingPayment({
                                bookingId: modalState.booking.id,
                                clearPaymentRequest: true,
                              })
                            } catch (e) {
                              toast.error(e.message)
                            }
                          }}
                        >
                          Clear payment request
                        </Button>
                      ) : null}
                    </div>
                    {modalState.booking.paymentRequest ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Stuck request:{' '}
                        {typeof modalState.booking.paymentRequest === 'object'
                          ? String(modalState.booking.paymentRequest.status || 'pending')
                          : 'present'}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-600 dark:bg-slate-800/40">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Reschedule
                    </p>
                    <Field label="New date & time">
                      <Input
                        type="datetime-local"
                        value={
                          rescheduleAt ||
                          toDateTimeLocal(
                            modalState.booking.scheduledAt?.toDate?.() ||
                              modalState.booking.dateTime ||
                              modalState.booking.scheduledAt,
                          )
                        }
                        onChange={(e) => setRescheduleAt(e.target.value)}
                      />
                    </Field>
                    <Button
                      type="button"
                      disabled={Boolean(mutating.bookingReschedule)}
                      onClick={async () => {
                        const value =
                          rescheduleAt ||
                          toDateTimeLocal(
                            modalState.booking.scheduledAt?.toDate?.() ||
                              modalState.booking.dateTime ||
                              modalState.booking.scheduledAt,
                          )
                        if (!value) {
                          toast.error('Pick a date and time.')
                          return
                        }
                        try {
                          await rescheduleBooking({
                            bookingId: modalState.booking.id,
                            scheduledAt: value,
                          })
                          setRescheduleAt('')
                        } catch (e) {
                          toast.error(e.message)
                        }
                      }}
                    >
                      {mutating.bookingReschedule ? 'Saving…' : 'Save schedule'}
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2 rounded-xl border border-orange-200/70 bg-orange-50/60 p-3 dark:border-orange-500/20 dark:bg-orange-500/10">
                    <p className="text-xs font-semibold uppercase tracking-wider text-orange-800 dark:text-orange-200">
                      Invoice
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">Status: </span>
                      {modalState.booking.invoiceStatus ||
                        (modalState.booking.invoicePdfUrl ? 'issued' : '—')}
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">Number: </span>
                      {modalState.booking.invoiceNumber || '—'}
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">Date: </span>
                      {formatDateTime(
                        modalState.booking.invoiceCreatedAt?.toDate?.() ||
                          modalState.booking.invoiceCreatedAt,
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="ghost"
                        disabled={!modalState.booking.invoicePdfUrl}
                        onClick={() =>
                          void openBookingInvoicePdf(modalState.booking).catch((e) =>
                            toast.error(e.message || 'Could not open invoice'),
                          )
                        }
                      >
                        View Invoice
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!modalState.booking.invoicePdfUrl}
                        onClick={() =>
                          void openBookingInvoicePdf(modalState.booking).catch((e) =>
                            toast.error(e.message || 'Could not open invoice'),
                          )
                        }
                      >
                        Download PDF
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!modalState.booking.invoicePdfUrl}
                        onClick={async () => {
                          try {
                            const stored = String(modalState.booking.invoicePdfUrl || '').trim()
                            if (/res\.cloudinary\.com/i.test(stored)) {
                              await navigator.clipboard.writeText(stored)
                            } else {
                              const result = await regenerateInvoice({
                                bookingId: modalState.booking.id,
                                sendEmail: false,
                              })
                              await navigator.clipboard.writeText(result?.pdfUrl || stored)
                            }
                            toast.success('Invoice URL copied')
                          } catch {
                            toast.error('Could not copy URL')
                          }
                        }}
                      >
                        Copy URL
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!modalState.booking.invoicePdfUrl && !modalState.booking.invoiceId}
                        onClick={async () => {
                          try {
                            const { resendInvoiceEmail } = await import('../services/invoiceFunctions')
                            await resendInvoiceEmail({
                              bookingId: modalState.booking.id,
                              invoiceId: modalState.booking.invoiceId,
                            })
                            toast.success('Invoice email resent')
                          } catch (e) {
                            toast.error(e.message || 'Resend failed')
                          }
                        }}
                      >
                        Resend Email
                      </Button>
                      <Button
                        onClick={async () => {
                          try {
                            const { regenerateInvoice } = await import('../services/invoiceFunctions')
                            const result = await regenerateInvoice({
                              bookingId: modalState.booking.id,
                              sendEmail: true,
                            })
                            toast.success(
                              result?.invoiceNumber
                                ? `Invoice ${result.invoiceNumber} ready`
                                : 'Invoice regenerated',
                            )
                          } catch (e) {
                            toast.error(e.message || 'Regenerate failed')
                          }
                        }}
                      >
                        Regenerate Invoice
                      </Button>
                    </div>
                  </div>
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
              <BookingWorkProofSection booking={modalState.booking} />
              <BookingPricingSection
                booking={modalState.booking}
                showAddOnActions
                mutatingAddOn={Boolean(mutating.bookingAddOn)}
                mutatingApprovalRequest={Boolean(mutating.bookingApprovalRequest)}
                onResolveApprovalRequest={async ({ requestId, approve }) => {
                  try {
                    await resolveAddOnApprovalRequest({
                      bookingId: modalState.booking.id,
                      requestId,
                      approve,
                    })
                  } catch (e) {
                    toast.error(e.message)
                  }
                }}
                onResolveExtrasApproval={async ({ approve }) => {
                  try {
                    await resolveExtrasApprovalRequest({
                      bookingId: modalState.booking.id,
                      approve,
                    })
                  } catch (e) {
                    toast.error(e.message)
                  }
                }}
                onSetAddOnStatus={async (index, status) => {
                  try {
                    await updateBookingAddOnApproval({
                      bookingId: modalState.booking.id,
                      index,
                      approvalStatus: status,
                    })
                  } catch (e) {
                    toast.error(e.message)
                  }
                }}
              />
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
                Only technicians whose category matches this booking’s service, are within radius, have all hourly
                slots free for this window (see busySlots in Firestore), and are verified (approved, not suspended) are listed.
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
                {availableTechnicians.map((technician) => {
                  const score = getTechnicianRankingScore(technician)
                  const dist = technicianDistanceKm(technician, getBookingLatLng(modalState.booking))
                  const distLabel = dist == null ? '' : ` • ${dist.toFixed(1)} km`
                  const scoreLabel = score > 0 || rankingSettings?.peakWindows?.length ? ` • score ${score}` : ''
                  return (
                    <option key={technician.id} value={technician.id}>
                      {technician.name} • {categoryMap[technician.categoryId] || '—'}
                      {scoreLabel}
                      {distLabel}
                    </option>
                  )
                })}
              </Select>
              {!availability.loading && !availability.error && availableTechnicians.length === 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">No technician available for this slot.</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setModalState({ mode: null, booking: null })}>
                  Cancel
                </Button>
                <Button
                  disabled={!selectedTechnician || availability.loading || Boolean(mutating.bookingAssign)}
                  onClick={async () => {
                    try {
                      await assignTechnician({
                        bookingId: modalState.booking.id,
                        technicianId: selectedTechnician,
                      })
                      setModalState({ mode: null, booking: null })
                    } catch (e) {
                      toast.error(e.message)
                    }
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

              if (service.hasVariations) {
                if (!String(createForm.variationId || '').trim()) {
                  toast.error('Select a service variation.')
                  return
                }
              } else if (!Number.isFinite(Number(createForm.amount)) || Number(createForm.amount) < 0) {
                toast.error('Enter a valid service price.')
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
                amount: Number(createForm.amount || 0),
                visitingCharge: Number(service.visitingCharge || 0),
                technicianId: technicianId || null,
                variationId: createForm.variationId || '',
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
                const svc = serviceMap[serviceId]
                setCreateForm((c) => ({
                  ...c,
                  serviceId,
                  variationId: '',
                  amount: svc?.hasVariations ? '' : svc ? String(svc.price || 0) : c.amount,
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

          {selectedCreateService?.hasVariations ? (
            <Field label="Variation">
              <Select
                value={createForm.variationId}
                onChange={(e) => setCreateForm((c) => ({ ...c, variationId: e.target.value }))}
                required
              >
                <option value="">Select variation</option>
                {(selectedCreateService.variations || []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} — {currency(Number(v.price))}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

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
                  {t.name} • {categoryMap[t.categoryId] || '—'} • {formatSkillsDisplay(t.skills) || '—'}
                </option>
              ))}
            </Select>
            {!createAvailability.loading &&
            !createAvailability.error &&
            createForm.scheduledAt &&
            createForm.serviceId &&
            createAvailableTechnicians.length === 0 ? (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                No technician available for this slot.
              </p>
            ) : null}
          </Field>

          <Field
            label={selectedCreateService?.hasVariations ? 'Service price (from variation)' : 'Service price'}
          >
            <Input
              type="number"
              min="0"
              value={createForm.amount}
              onChange={(e) => setCreateForm((c) => ({ ...c, amount: e.target.value }))}
              placeholder={selectedCreateService?.hasVariations ? 'Pulled from selected variation' : 'Enter booking price'}
              disabled={Boolean(selectedCreateService?.hasVariations)}
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
