import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Calendar, Copy, CreditCard, Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import { Button, Badge, Field, Input, Modal, Select, Card } from './ui'
import { TechnicianVerificationDrawer } from './TechnicianVerificationDrawer'
import { useApp } from '../context/useApp'
import { subscribeDoc } from '../services/firestore'
import { subscribeTechnicianKycSubdocs } from '../services/technicianKyc'
import { subscribeTechnicianBusySlots } from '../services/technicianBusySlots'
import { subscribeTechnicianTransactions } from '../services/technicianTransactions'
import {
  createdAtToDate,
  ledgerEarningTotalsIST,
  sortTransactionsNewestFirst,
  summarizeTechnicianTransactions,
} from '../utils/technicianLedger'
import { hourToSlotIndex, TIMEZONE } from '../utils/technicianSlots'
import {
  kycStatusBadge,
  normalizeShiftStatus,
  normalizeVerificationStatus,
  verificationAccountBadge,
} from '../utils/technicianVerification'
import { ROLES } from '../utils/rbac'
import { cn, currency, formatDateTime, formatSkillsDisplay } from '../utils/helpers'

const PAYMENT_MODES = [
  { value: '', label: 'Optional' },
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
]

function indiaClockFromDate(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const o = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  )
  return {
    dateKey: `${o.year}-${o.month}-${o.day}`,
    hour: Number(o.hour),
  }
}

function useTechnicianLiveStatus(technicianId, dbStatus) {
  const [slotBusy, setSlotBusy] = useState(false)

  useEffect(() => {
    if (!technicianId) return undefined
    return subscribeTechnicianBusySlots(
      technicianId,
      (docs) => {
        const now = new Date()
        const { dateKey, hour } = indiaClockFromDate(now)
        const idx = hourToSlotIndex(hour)
        if (idx == null) {
          setSlotBusy(false)
          return
        }
        const match = docs.find(
          (d) =>
            String(d.date || '') === dateKey &&
            Number(d.slotIndex) === idx &&
            String(d.status || '').toLowerCase() === 'busy',
        )
        setSlotBusy(Boolean(match))
      },
      () => {},
    )
  }, [technicianId])

  return useMemo(() => {
    const s = String(dbStatus || 'Available').trim()
    if (s === 'Offline') return { label: 'Offline', tone: 'danger', dot: '🔴' }
    if (slotBusy || s === 'Busy') return { label: 'Busy', tone: 'warning', dot: '🟠' }
    return { label: 'Available', tone: 'success', dot: '🟢' }
  }, [dbStatus, slotBusy])
}

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (!parts.length) return '?'
  return parts.map((p) => p[0]).join('').toUpperCase()
}

async function copyText(text, label) {
  const t = String(text || '').trim()
  if (!t) return
  try {
    await navigator.clipboard.writeText(t)
    toast.success('Copied', { description: label })
  } catch {
    toast.error('Copy failed')
  }
}

function DetailRow({ label, value, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--outline-variant)]/40 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium text-[var(--on-surface)]">{value ?? '—'}</p>
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  )
}

/** Read `upiId` directly from `kyc.bankDetails` */
function readUpiId(bankDetails) {
  if (!bankDetails || typeof bankDetails !== 'object') return ''
  const id = bankDetails.upiId
  if (id == null) return ''
  return String(id).trim()
}

function readBankDetails(bankDetails) {
  if (!bankDetails || typeof bankDetails !== 'object') return null
  return {
    accountHolderName: bankDetails.accountHolderName != null ? String(bankDetails.accountHolderName) : '',
    accountNumber: bankDetails.accountNumber != null ? String(bankDetails.accountNumber) : '',
    bankName: bankDetails.bankName != null ? String(bankDetails.bankName) : '',
    ifscCode: bankDetails.ifscCode != null ? String(bankDetails.ifscCode) : '',
  }
}

function bankDetailsComplete(b) {
  if (!b) return false
  return Boolean(
    String(b.accountHolderName || '').trim() &&
      String(b.accountNumber || '').trim() &&
      String(b.bankName || '').trim() &&
      String(b.ifscCode || '').trim(),
  )
}

function normalizeUpiId(value) {
  if (value == null) return ''
  return String(value).trim().toLowerCase()
}

export function TechnicianCard({
  technician,
  categoryLabel,
  bookingStats,
  onEdit,
  onSlotCalendar,
  onDelete,
  mutating,
}) {
  const { recordTechnicianPayout, platformSettings, session, suspendTechnician } = useApp()
  const shiftStatus = normalizeShiftStatus(technician)
  const statusUi = useTechnicianLiveStatus(technician.id, shiftStatus)

  const canSuspendStaff =
    session?.role === ROLES.SUPER_ADMIN || session?.role === ROLES.TECHNICIAN_MANAGER

  const accountBadgeUi = verificationAccountBadge(technician)
  const kycBadgeUi = kycStatusBadge(technician)
  const verificationKey = normalizeVerificationStatus(technician)
  const isPendingApproval = verificationKey === 'pending'
  const [rows, setRows] = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [txOpen, setTxOpen] = useState(false)
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [paymentMode, setPaymentMode] = useState('')
  // 👇 Updated to read from kyc.bankDetails instead of paymentDetails
  const [liveBankDetails, setLiveBankDetails] = useState(null)
  const [subdocBankDetails, setSubdocBankDetails] = useState(null)
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null)
  const [upiQrDataUrl, setUpiQrDataUrl] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)

  useEffect(() => {
    setTxLoading(true)
    const unsub = subscribeTechnicianTransactions(
      technician.id,
      (list) => {
        setRows(list)
        setTxLoading(false)
      },
      () => {
        setTxLoading(false)
        toast.error('Could not load transactions. Check Firestore rules or your network.')
      },
    )
    return () => unsub()
  }, [technician.id])

  useEffect(() => {
    if (!payOpen || !technician.id) {
      setSubdocBankDetails(null)
      return undefined
    }
    return subscribeTechnicianKycSubdocs(
      technician.id,
      ({ bankDetails: b }) => {
        setSubdocBankDetails(b && typeof b === 'object' ? b : null)
      },
      () => {},
    )
  }, [payOpen, technician.id])

  useEffect(() => {
    if (!payOpen || !technician.id) {
      setLiveBankDetails(null)
      setLiveUpdatedAt(null)
      return undefined
    }
    return subscribeDoc(
      'technicians',
      technician.id,
      (docRow) => {
        try {
          const b = docRow?.kyc?.bankDetails
          setLiveBankDetails(b && typeof b === 'object' ? b : null)
          setLiveUpdatedAt(docRow?.updatedAt)
        } catch {
          setLiveBankDetails(null)
          setLiveUpdatedAt(null)
        }
      },
      () => {
        toast.error('Could not load technician payment details.')
      },
    )
  }, [payOpen, technician.id])

  const summary = useMemo(() => summarizeTechnicianTransactions(rows), [rows])
  const sortedTx = useMemo(() => sortTransactionsNewestFirst(rows), [rows])
  const earningWindow = useMemo(() => ledgerEarningTotalsIST(rows), [rows])

  const skillsLine = formatSkillsDisplay(technician.skills)
  const phoneDisplay = String(technician.phone ?? '').trim() || '—'

  const photoUrl = String(
    technician.profilePhotoUrl || technician.photoURL || technician.avatarUrl || '',
  ).trim()

  const lastActiveRaw =
    technician.lastActiveAt?.toDate?.()?.getTime?.() != null
      ? technician.lastActiveAt.toDate()
      : technician.updatedAt?.toDate?.()?.getTime?.() != null
        ? technician.updatedAt.toDate()
        : null
  const lastActiveLabel = lastActiveRaw ? formatDateTime(lastActiveRaw) : '—'
  const openPay = () => {
    setAmountStr('')
    setNote('')
    setPaymentMode('')
    setPayOpen(true)
  }

  const submitPay = async (event) => {
    event.preventDefault()
    const n = Number(String(amountStr).replace(/,/g, '').trim())
    try {
      await recordTechnicianPayout({
        technicianId: technician.id,
        amount: n,
        paymentMode,
        note,
        maxAmount: summary.remaining,
      })
      setPayOpen(false)
    } catch (err) {
      toast.error(err?.message || 'Could not save payout.')
    }
  }

  const resolvedBankDetails = liveBankDetails || subdocBankDetails
  const bankSafe = readBankDetails(resolvedBankDetails)
  const hasBank = bankDetailsComplete(bankSafe)

  const techUpiNormalized = normalizeUpiId(readUpiId(resolvedBankDetails))
  const globalUpiNormalized = normalizeUpiId(platformSettings?.globalUpiId)
  const resolvedUpiId = techUpiNormalized || globalUpiNormalized
  const globalQrImageUrl = String(platformSettings?.globalPaymentQr ?? '').trim()

  const upiTechUri = useMemo(() => {
    if (!resolvedUpiId) return ''
    return `upi://pay?pa=${encodeURIComponent(resolvedUpiId)}&pn=${encodeURIComponent('Technician Payout')}&cu=INR`
  }, [resolvedUpiId])

  useEffect(() => {
    if (!payOpen || paymentMode !== 'UPI') {
      setUpiQrDataUrl(null)
      return
    }
    if (!upiTechUri) {
      setUpiQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(upiTechUri, {
      width: 180,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl) => {
        if (!cancelled) setUpiQrDataUrl(dataUrl)
      })
      .catch((err) => {
        console.error('[UPI QR generation]', err)
        if (!cancelled) setUpiQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [payOpen, paymentMode, upiTechUri])

  const hasResolvedUpi = resolvedUpiId.length > 0

  const payDetailsUpdated = useMemo(() => {
    const raw = liveUpdatedAt
    if (raw == null) return null
    const d = createdAtToDate(raw)
    if (!d || Number.isNaN(d.getTime())) return null
    try {
      return formatDateTime(d)
    } catch {
      return null
    }
  }, [liveUpdatedAt])

  return (
    <>
      <Card
        className={cn(
          'flex min-h-0 min-w-0 w-full max-w-none flex-col overflow-hidden p-0 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.35)]',
          isPendingApproval &&
            'ring-2 ring-amber-400/50 ring-offset-4 ring-offset-[color-mix(in_srgb,var(--surface-lowest)_100%,transparent)]',
          technician.suspended && !isPendingApproval ? 'opacity-[0.97] ring-2 ring-rose-500/20' : null,
        )}
      >
        <div className="border-b border-[var(--outline-variant)]/50 bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="relative shrink-0" aria-hidden={!photoUrl}>
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt=""
                  className="size-24 rounded-full border border-[var(--outline-variant)]/40 object-cover shadow-lg ring-4 ring-white/10"
                />
              ) : (
                <div className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] text-2xl font-bold text-white shadow-lg ring-4 ring-white/10">
                  {initialsFromName(technician.name)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 space-y-1.5">
                  <h3 className="text-xl font-semibold tracking-tight text-[var(--on-surface)]">{technician.name}</h3>
                  <p className="text-base font-medium text-[var(--on-surface)]">{phoneDisplay}</p>
                  <p className="text-sm leading-relaxed text-[var(--on-surface-variant)]">
                    <span className="font-medium text-[var(--on-surface)]/90">{categoryLabel ? `${categoryLabel} specialist` : 'Category not set'}</span>
                    {skillsLine ? (
                      <span className="block sm:mt-0.5 sm:inline sm:before:content-['·_']">{skillsLine}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--on-surface-variant)]">
                    Last active{' '}
                    <span className="font-semibold tabular-nums text-[var(--on-surface)]">{lastActiveLabel}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  <Badge tone={accountBadgeUi.tone} className="w-fit whitespace-nowrap self-start sm:self-end">
                    {accountBadgeUi.dot} {accountBadgeUi.label}
                  </Badge>
                  <Badge tone={kycBadgeUi.tone} className="w-fit whitespace-nowrap self-start sm:self-end">
                    {kycBadgeUi.label}
                  </Badge>
                  <Badge tone={statusUi.tone} className="w-fit whitespace-nowrap self-start sm:self-end">
                    {statusUi.dot} {statusUi.label}
                  </Badge>
                  {technician.suspended ? (
                    <Badge tone="danger" className="w-fit whitespace-nowrap self-start sm:self-end">
                      Suspended
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 px-5 py-5 sm:px-6">
          <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { k: 'Completed', v: bookingStats.completed, sub: 'bookings' },
              { k: 'Pending', v: bookingStats.pending, sub: 'bookings' },
              { k: 'This month', v: currency(earningWindow.month), sub: 'Ledger (IST)' },
              { k: 'Today', v: currency(earningWindow.today), sub: 'Ledger (IST)' },
            ].map((cell) => (
              <div
                key={cell.k}
                className="flex min-h-[92px] min-w-0 flex-col justify-center rounded-2xl border border-[var(--outline-variant)]/50 bg-[var(--surface-lowest)]/90 px-4 py-4 shadow-sm"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">
                  {cell.k}
                </p>
                <p className="mt-2 break-words text-lg font-semibold tabular-nums leading-tight text-[var(--on-surface)]">
                  {cell.v}
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-[var(--on-surface-variant)]">{cell.sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 px-5 pb-4 sm:px-6">
          <Button type="button" variant="secondary" className="h-11 min-h-[44px] px-5" onClick={() => setDetailsOpen(true)}>
            View Details
          </Button>
          <Button type="button" variant="ghost" className="h-11 min-h-[44px] px-5" onClick={onEdit}>
            Edit
          </Button>
          {canSuspendStaff ? (
            <Button
              type="button"
              variant={technician.suspended ? 'secondary' : 'danger'}
              className="h-11 min-h-[44px] px-5"
              disabled={Boolean(mutating?.technicianSuspend)}
              onClick={() => setSuspendOpen(true)}
            >
              {technician.suspended ? 'Lift suspension' : 'Suspend'}
            </Button>
          ) : null}
        </div>

        <div className="mx-5 mb-5 min-w-0 sm:mx-6">
          <div className="rounded-2xl border border-[var(--outline-variant)]/55 bg-[var(--surface-lowest)]/90 p-5 shadow-inner sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--on-surface-variant)]">
              Settlement &amp; ledger
            </p>
            {txLoading ? (
              <p className="mt-4 text-sm text-[var(--on-surface-variant)]">Loading ledger…</p>
            ) : (
              <>
                <div className="mt-4 space-y-3 text-sm leading-relaxed">
                  <p className="text-[var(--on-surface)]">
                    <span className="text-[var(--on-surface-variant)]">Total earning:</span>{' '}
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {currency(summary.totalEarned)}
                    </span>
                  </p>
                  <p className="text-[var(--on-surface)]">
                    <span className="text-[var(--on-surface-variant)]">Admin paid:</span>{' '}
                    <span className="font-medium text-rose-600 dark:text-rose-400">{currency(summary.totalPaid)}</span>
                  </p>
                  <p className="text-[var(--on-surface)]">
                    <span className="text-[var(--on-surface-variant)]">Remaining payout:</span>{' '}
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {currency(Math.max(0, summary.remaining))}
                    </span>
                  </p>
                  {summary.isOverpaid ? (
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      Warning: recorded payouts exceed ledger earnings — review transaction history.
                    </p>
                  ) : null}
                  <p className="pt-1 text-xs text-[var(--on-surface-variant)]">
                    Last settlement:{' '}
                    {summary.lastPayoutAt ? formatDateTime(summary.lastPayoutAt) : '— No payout yet'}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Button
                    type="button"
                    className="h-11 min-h-[44px] shrink-0 px-5 transition hover:brightness-110 active:scale-[0.99]"
                    onClick={openPay}
                    disabled={txLoading || mutating?.technicianPayout || summary.remaining <= 0.005}
                  >
                    Pay Now
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 min-h-[44px] shrink-0 px-5 transition active:scale-[0.99]"
                    onClick={() => setTxOpen(true)}
                  >
                    Transactions
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 min-h-[44px] shrink-0 gap-2 px-5 transition active:scale-[0.99]"
                    onClick={onSlotCalendar}
                  >
                    <Calendar className="size-4 opacity-80" />
                    Slot Calendar
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="h-11 min-h-[44px] shrink-0 gap-2 px-5 transition active:scale-[0.99]"
                    onClick={onDelete}
                    disabled={Boolean(mutating?.technicianDelete)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <TechnicianVerificationDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        technician={technician}
        categoryLabel={categoryLabel}
        bookingStats={bookingStats}
      />

      <Modal
        open={suspendOpen}
        title={technician.suspended ? 'Lift suspension?' : 'Suspend technician?'}
        onClose={() => !mutating?.technicianSuspend && setSuspendOpen(false)}
      >
        <p className="text-sm leading-relaxed text-[var(--on-surface-variant)]">
          {technician.suspended
            ? 'This technician will become eligible for new assignments again.'
            : 'Suspended technicians stop receiving new assignments until you lift the suspension.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={Boolean(mutating?.technicianSuspend)}
            onClick={() => setSuspendOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={technician.suspended ? 'secondary' : 'danger'}
            disabled={Boolean(mutating?.technicianSuspend)}
            onClick={async () => {
              try {
                await suspendTechnician({
                  technicianId: technician.id,
                  suspended: !technician.suspended,
                })
                setSuspendOpen(false)
              } catch (e) {
                toast.error(e?.message || 'Could not update suspension.')
              }
            }}
          >
            {mutating?.technicianSuspend ? 'Saving…' : 'Confirm'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={payOpen}
        title="Record payout"
        onClose={() => !mutating?.technicianPayout && setPayOpen(false)}
      >
        <form className="space-y-4" onSubmit={submitPay}>
          <p className="text-sm text-[var(--on-surface-variant)]">
            Outstanding balance:{' '}
            <strong className="text-[var(--on-surface)]">{currency(Math.max(0, summary.remaining))}</strong>
          </p>
          <Field label="Amount (₹)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="e.g. 2000"
              required
            />
          </Field>
          <Field label="Payment note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Weekly settlement, UPI reference…"
            />
          </Field>
          <Field label="Payment mode (optional)">
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              {PAYMENT_MODES.map((o) => (
                <option key={o.value === '' ? '_empty' : o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          {paymentMode === 'Bank Transfer' ? (
            <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-low)]/60 p-4 sm:p-5">
              <p className="text-sm font-semibold text-[var(--on-surface)]">Bank details</p>
              {hasBank && bankSafe ? (
                <div className="mt-3">
                  <DetailRow label="Account holder" value={bankSafe.accountHolderName} />
                  <DetailRow label="Bank name" value={bankSafe.bankName} />
                  <DetailRow
                    label="Account number"
                    value={bankSafe.accountNumber}
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3 text-xs"
                        onClick={() => copyText(bankSafe.accountNumber, 'Account number')}
                      >
                        <Copy className="size-3.5" />
                        Copy
                      </Button>
                    }
                  />
                  <DetailRow
                    label="IFSC"
                    value={bankSafe.ifscCode}
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3 text-xs"
                        onClick={() => copyText(bankSafe.ifscCode, 'IFSC')}
                      >
                        <Copy className="size-3.5" />
                        Copy
                      </Button>
                    }
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--on-surface-variant)]">
                  This technician has not added bank details yet.
                </p>
              )}
            </div>
          ) : null}

          {paymentMode === 'UPI' ? (
            <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-low)]/60 p-4 sm:p-5">
              <p className="text-sm font-semibold text-[var(--on-surface)]">UPI</p>

              {techUpiNormalized ? (
                <p className="mt-2 text-xs text-[var(--on-surface-variant)]">Source: technician profile</p>
              ) : globalUpiNormalized ? (
                <p className="mt-2 text-xs text-[var(--on-surface-variant)]">Source: platform default (Platform Settings)</p>
              ) : null}

              <div className="mt-4 flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
                <div className="min-w-0 flex-1 space-y-2">
                  {hasResolvedUpi ? (
                    <DetailRow
                      label="UPI ID"
                      value={resolvedUpiId}
                      actions={
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 shrink-0 px-3 text-xs"
                          onClick={() => copyText(resolvedUpiId, 'UPI ID')}
                        >
                          <Copy className="size-3.5" />
                          Copy
                        </Button>
                      }
                    />
                  ) : (
                    <p className="text-sm leading-relaxed text-[var(--on-surface-variant)]">
                      No UPI ID on file. Add payment details to this technician or set Global Payment under Platform Settings.
                    </p>
                  )}
                </div>

                <div className="flex w-full min-w-0 shrink-0 flex-col items-center gap-2 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)] p-4 shadow-inner lg:w-auto lg:max-w-[220px]">
                  {upiQrDataUrl ? (
                    <>
                      <img
                        src={upiQrDataUrl}
                        alt="UPI QR"
                        className="h-[180px] w-[180px] rounded-xl bg-white object-contain p-2"
                      />
                      <p className="text-center text-[11px] text-[var(--on-surface-variant)]">Scan to pay (UPI)</p>
                    </>
                  ) : globalQrImageUrl ? (
                    <>
                      <img
                        src={globalQrImageUrl}
                        alt="Platform payment QR"
                        className="h-[180px] w-[180px] rounded-xl bg-white object-contain p-2"
                      />
                      <p className="text-center text-[11px] text-[var(--on-surface-variant)]">Platform QR (uploaded)</p>
                    </>
                  ) : hasResolvedUpi ? (
                    <p className="px-2 text-center text-sm text-[var(--on-surface-variant)]">
                      QR preview is unavailable. Copy the UPI ID above or try again.
                    </p>
                  ) : (
                    <p className="px-2 text-center text-sm text-[var(--on-surface-variant)]">
                      Configure UPI under Platform Settings → Global payment settings when this technician has no UPI ID.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {payDetailsUpdated ? (
            <p className="text-xs text-[var(--on-surface-variant)]">Payment details last updated: {payDetailsUpdated}</p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPayOpen(false)}
              disabled={mutating?.technicianPayout}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutating?.technicianPayout} className="gap-2">
              <CreditCard className="size-4 opacity-90" />
              {mutating?.technicianPayout ? 'Saving…' : 'Mark as paid'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={txOpen}
        title={`Transactions — ${technician.name}`}
        onClose={() => setTxOpen(false)}
        bodyClassName="max-h-[70vh] overflow-y-auto pr-1"
      >
        {sortedTx.length === 0 ? (
          <p className="text-sm text-[var(--on-surface-variant)]">No transactions yet.</p>
        ) : (
          <ul className="space-y-3">
            {sortedTx.map((tx) => {
              const isEarn = String(tx.type).toLowerCase() === 'earning'
              const amt = Number(tx.amount)
              const line = isEarn ? `+ ${currency(amt)}` : `− ${currency(amt)}`
              const dt = createdAtToDate(tx.createdAt)
              const when = dt ? formatDateTime(dt) : '—'
              return (
                <li
                  key={tx.id}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    isEarn
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-rose-500/40 bg-rose-500/5',
                  )}
                >
                  <p
                    className={cn(
                      'font-semibold',
                      isEarn ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
                    )}
                  >
                    {line}
                  </p>
                  <p className="break-words text-[var(--on-surface)]">
                    {isEarn
                      ? `Booking complete${tx.serviceName ? ` · ${tx.serviceName}` : ''}${tx.bookingId ? ` · ${tx.bookingId}` : ''}`
                      : `Settlement${tx.paymentMode ? ` · ${tx.paymentMode}` : ''}${tx.note ? ` · ${tx.note}` : ''}`}
                  </p>
                  <p className="text-xs text-[var(--on-surface-variant)]">{when}</p>
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
    </>
  )
}