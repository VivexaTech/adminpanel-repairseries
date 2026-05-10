import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase/config'
import { getStoredTechnicianPayout } from '../utils/bookingStoredAmounts'

const ensureDb = () => {
  if (!isFirebaseConfigured || !db) throw new Error('Firebase is not configured.')
}

export const earningDocIdForBooking = (bookingId) => `earn_${String(bookingId)}`

/** @param {import('firebase/firestore').WriteBatch} batch */
export function applyTechnicianEarningToBatch(batch, technicianId, booking) {
  ensureDb()
  const amount = getStoredTechnicianPayout(booking)
  if (!technicianId || !booking?.id || !Number.isFinite(amount) || amount <= 0) return

  const ref = doc(db, 'technicians', String(technicianId), 'transactions', earningDocIdForBooking(booking.id))
  batch.set(
    ref,
    {
      type: 'earning',
      amount,
      bookingId: booking.id,
      serviceName: booking.serviceName || '',
      status: 'completed',
      createdAt: serverTimestamp(),
      technicianId: String(technicianId),
    },
    { merge: true },
  )
}

/**
 * Idempotent earning row per booking (stable doc id).
 * @param {object} booking — booking doc with finance fields; should include `status: 'Completed'` when applicable.
 */
export async function ensureTechnicianEarningForBooking(technicianId, booking) {
  ensureDb()
  if (!technicianId || !booking?.id) return
  const amount = getStoredTechnicianPayout(booking)
  if (!Number.isFinite(amount) || amount <= 0) return

  const ref = doc(db, 'technicians', String(technicianId), 'transactions', earningDocIdForBooking(booking.id))
  await setDoc(
    ref,
    {
      type: 'earning',
      amount,
      bookingId: booking.id,
      serviceName: booking.serviceName || '',
      status: 'completed',
      createdAt: serverTimestamp(),
      technicianId: String(technicianId),
    },
    { merge: true },
  )
}

export async function createTechnicianPayoutRecord({ technicianId, amount, paymentMode, note, adminId }) {
  ensureDb()
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid payout amount.')

  await addDoc(collection(db, 'technicians', String(technicianId), 'transactions'), {
    type: 'payout',
    amount: n,
    paymentMode: paymentMode != null ? String(paymentMode) : '',
    note: note != null ? String(note) : '',
    technicianId: String(technicianId),
    adminId: adminId != null ? String(adminId) : null,
    createdAt: serverTimestamp(),
  })
}

export function subscribeTechnicianTransactions(technicianId, onData, onError) {
  ensureDb()
  return onSnapshot(
    collection(db, 'technicians', String(technicianId), 'transactions'),
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData(rows, snapshot.docChanges())
    },
    onError,
  )
}
