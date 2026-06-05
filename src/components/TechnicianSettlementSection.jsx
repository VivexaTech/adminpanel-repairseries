import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button, Field, Input, Modal, Select } from './ui'
import { useApp } from '../context/useApp'
import { currency, formatDateTime } from '../utils/helpers'
import { subscribeTechnicianTransactions } from '../services/technicianTransactions'
import {
  createdAtToDate,
  sortTransactionsNewestFirst,
  summarizeTechnicianTransactions,
} from '../utils/technicianLedger'

const PAYMENT_MODES = [
  { value: '', label: 'Select karein (optional)' },
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
]

export function TechnicianSettlementSection({ technician }) {
  const { recordTechnicianPayout, syncTechnicianLedgerFromBookings, mutating } = useApp()
  const [rows, setRows] = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [txOpen, setTxOpen] = useState(false)
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [paymentMode, setPaymentMode] = useState('')

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
        toast.error('Transactions load nahi ho paye. Firestore rules / network check karein.')
      },
    )
    return () => unsub()
  }, [technician.id])

  const summary = useMemo(() => summarizeTechnicianTransactions(rows), [rows])
  const sortedTx = useMemo(() => sortTransactionsNewestFirst(rows), [rows])

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
      toast.error(err?.message || 'Payout save nahi hua.')
    }
  }

  return (
    <>
      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-600/60 dark:bg-slate-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Settlement & ledger
        </p>
        {txLoading ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Ledger load ho raha hai…</p>
        ) : (
          <>
            <div className="mt-2 space-y-1 text-sm">
              <p className="text-slate-700 dark:text-slate-200">
                <span className="text-slate-500 dark:text-slate-400">Total earning (ledger):</span>{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {currency(summary.totalEarned)}
                </span>
              </p>
              <p className="text-slate-700 dark:text-slate-200">
                <span className="text-slate-500 dark:text-slate-400">Admin ne pay kiya:</span>{' '}
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  {currency(summary.totalPaid)}
                </span>
              </p>
              <p className="text-slate-700 dark:text-slate-200">
                <span className="text-slate-500 dark:text-slate-400">Remaining payment (abhi dena hai):</span>{' '}
                <span className="font-bold text-amber-700 dark:text-amber-300">
                  {currency(Math.max(0, summary.remaining))}
                </span>
              </p>
              {summary.isOverpaid ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  Warning: payout, earnings se zyada lag rahe hain — history check karein.
                </p>
              ) : null}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Last settlement:{' '}
                {summary.lastPayoutAt ? formatDateTime(summary.lastPayoutAt) : '— abhi tak koi payout nahi'}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                className="px-3 py-1.5 text-xs"
                onClick={openPay}
                disabled={txLoading || mutating.technicianPayout || summary.remaining <= 0.005}
              >
                Pay Now
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="px-3 py-1.5 text-xs"
                onClick={() => setTxOpen(true)}
              >
                View Transactions
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="px-3 py-1.5 text-xs"
                disabled={Boolean(mutating.technicianLedgerSync)}
                onClick={async () => {
                  try {
                    await syncTechnicianLedgerFromBookings(technician.id)
                  } catch (e) {
                    toast.error(e?.message || 'Sync fail.')
                  }
                }}
              >
                {mutating.technicianLedgerSync ? 'Sync…' : 'Sync earnings (purane bookings)'}
              </Button>
            </div>
          </>
        )}
      </div>

      <Modal
        open={payOpen}
        title="Payout — Kitna amount pay kiya?"
        onClose={() => !mutating.technicianPayout && setPayOpen(false)}
      >
        <form className="space-y-4" onSubmit={submitPay}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Abhi dena baaki: <strong>{currency(Math.max(0, summary.remaining))}</strong>
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
              placeholder="Weekly settlement, UPI ref…"
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
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPayOpen(false)}
              disabled={mutating.technicianPayout}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutating.technicianPayout}>
              {mutating.technicianPayout ? 'Saving…' : 'Mark as Paid'}
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
          <p className="text-sm text-slate-500 dark:text-slate-400">Abhi koi transaction nahi.</p>
        ) : (
          <ul className="space-y-3">
            {sortedTx.map((tx) => {
              const isEarn = String(tx.type).toLowerCase() === 'earning'
              const amt = Number(tx.amount)
              const line = isEarn ? `+ ${currency(amt)}` : `- ${currency(amt)}`
              const dt = createdAtToDate(tx.createdAt)
              const when = dt ? formatDateTime(dt) : '—'
              return (
                <li
                  key={tx.id}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    isEarn
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-rose-500/40 bg-rose-500/5'
                  }`}
                >
                  <p
                    className={`font-semibold ${
                      isEarn ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {line}
                  </p>
                  <p className="text-slate-700 dark:text-slate-200">
                    {isEarn
                      ? `Booking complete${tx.serviceName ? ` · ${tx.serviceName}` : ''}${tx.bookingId ? ` · ${tx.bookingId}` : ''}`
                      : `Settlement paid${tx.paymentMode ? ` · ${tx.paymentMode}` : ''}${tx.note ? ` · ${tx.note}` : ''}`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{when}</p>
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
    </>
  )
}
