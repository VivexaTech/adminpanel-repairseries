import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase/config'

const ensureDb = () => {
  if (!isFirebaseConfigured || !db) throw new Error('Firebase is not configured.')
}

export const subscribeCollection = (collectionName, onData, onError) => {
  ensureDb()
  return onSnapshot(
    collection(db, collectionName),
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData(rows, snapshot.docChanges())
    },
    onError,
  )
}

export const createDoc = async (collectionName, data) => {
  ensureDb()
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export const upsertDoc = async (collectionName, id, data) => {
  ensureDb()
  const ref = doc(db, collectionName, id)
  await setDoc(
    ref,
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export const updateDocFields = async (collectionName, id, fields) => {
  ensureDb()
  const ref = doc(db, collectionName, id)
  await updateDoc(ref, { ...fields, updatedAt: serverTimestamp() })
}

export const removeDoc = async (collectionName, id) => {
  ensureDb()
  await deleteDoc(doc(db, collectionName, id))
}

export const getBookingsForDay = async ({ dayStart, dayEnd }) => {
  ensureDb()
  // Requires bookings documents to have `scheduledAt` (Timestamp).
  const q = query(
    collection(db, 'bookings'),
    where('scheduledAt', '>=', dayStart),
    where('scheduledAt', '<', dayEnd),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}
