import { doc, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase/config'

/**
 * Realtime listen to technicians/{id}/kyc/bankDetails and technicians/{id}/kyc/aadhaar
 */
export function subscribeTechnicianKycSubdocs(technicianId, onData, onError = () => {}) {
  if (!isFirebaseConfigured || !db || !technicianId) {
    onData({ bankDetails: null, aadhaar: null })
    return () => {}
  }

  let bankDetails = null
  let aadhaar = null

  const emit = () => onData({ bankDetails, aadhaar })

  const bankRef = doc(db, 'technicians', technicianId, 'kyc', 'bankDetails')
  const aadhaarRef = doc(db, 'technicians', technicianId, 'kyc', 'aadhaar')

  const unsub1 = onSnapshot(
    bankRef,
    (snap) => {
      bankDetails = snap.exists() ? { id: snap.id, ...snap.data() } : null
      emit()
    },
    onError,
  )

  const unsub2 = onSnapshot(
    aadhaarRef,
    (snap) => {
      aadhaar = snap.exists() ? { id: snap.id, ...snap.data() } : null
      emit()
    },
    onError,
  )

  return () => {
    unsub1()
    unsub2()
  }
}
