import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase/config'

const ensureDb = () => {
  if (!isFirebaseConfigured || !db) throw new Error('Firebase is not configured.')
}

/**
 * @param {import('../utils/technicianSlots.js').SlotDescriptor[]} descriptors
 * @param {string | null} [ignoreBookingId] Treat busy docs owned by this booking as free (re-reserve).
 */
export async function verifyBusySlotsFree(technicianId, descriptors, ignoreBookingId = null) {
  ensureDb()
  for (const d of descriptors) {
    const ref = doc(db, 'technicians', technicianId, 'busySlots', d.slotDocId)
    const snap = await getDoc(ref)
    if (!snap.exists()) continue
    const data = snap.data()
    if (String(data?.status || '').toLowerCase() !== 'busy') continue
    const bid = String(data.bookingId || '')
    if (ignoreBookingId && bid && bid === String(ignoreBookingId)) continue
    return { ok: false, slot: d, message: `Slot ${d.slotLabel} is already busy.` }
  }
  return { ok: true }
}

/**
 * Atomic reserve of all hourly busy docs for a booking.
 * @param {import('../utils/technicianSlots.js').SlotDescriptor[]} descriptors
 */
export async function reserveBusySlotsForBooking(technicianId, bookingId, descriptors, reason = 'booking') {
  ensureDb()
  const bid = String(bookingId)
  await runTransaction(db, async (tx) => {
    for (const d of descriptors) {
      const ref = doc(db, 'technicians', technicianId, 'busySlots', d.slotDocId)
      const snap = await tx.get(ref)
      if (snap.exists()) {
        const data = snap.data()
        if (String(data?.status || '').toLowerCase() === 'busy') {
          const existing = String(data.bookingId || '')
          if (existing === bid) continue
          throw new Error(`Slot ${d.slotLabel} is not available for this technician.`)
        }
      }
    }
    for (const d of descriptors) {
      const ref = doc(db, 'technicians', technicianId, 'busySlots', d.slotDocId)
      tx.set(ref, {
        date: d.dateKey,
        slot: d.slotLabel,
        slotIndex: d.slotIndex,
        status: 'busy',
        reason,
        bookingId: bid,
        createdAt: serverTimestamp(),
      })
    }
  })
}

export async function releaseBusySlotsForBooking(technicianId, bookingId) {
  if (!technicianId || !bookingId) return
  ensureDb()
  const q = query(
    collection(db, 'technicians', technicianId, 'busySlots'),
    where('bookingId', '==', String(bookingId)),
  )
  const snap = await getDocs(q)
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}

export function subscribeTechnicianBusySlots(technicianId, onData, onError) {
  ensureDb()
  return onSnapshot(
    collection(db, 'technicians', technicianId, 'busySlots'),
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData(rows, snapshot.docChanges())
    },
    onError,
  )
}
