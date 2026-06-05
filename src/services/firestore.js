import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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

/** Realtime listener for a single document. */
export const subscribeDoc = (collectionName, docId, onData, onError) => {
  ensureDb()
  const ref = doc(db, collectionName, docId)
  return onSnapshot(
    ref,
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)
    },
    onError,
  )
}

export const fetchDoc = async (collectionName, docId) => {
  ensureDb()
  const snapshot = await getDoc(doc(db, collectionName, docId))
  if (!snapshot.exists()) return null
  return { id: snapshot.id, ...snapshot.data() }
}

/**
 * Replaces the document at `id` (no merge).
 * Preserves `createdAt` when updating if not supplied in `data`.
 * Uses `data.createdAt` / `data.updatedAt` when provided (e.g. CSV import).
 */
export const setDocumentReplace = async (collectionName, id, data) => {
  ensureDb()
  const ref = doc(db, collectionName, id)
  const existing = await getDoc(ref)
  const existingData = existing.exists() ? existing.data() : null

  const incomingCreated = data.createdAt
  const incomingUpdated = data.updatedAt
  const { createdAt: _dropC, updatedAt: _dropU, ...rest } = data

  const createdAt =
    incomingCreated != null
      ? incomingCreated
      : existingData?.createdAt != null
        ? existingData.createdAt
        : serverTimestamp()

  const updatedAt = incomingUpdated != null ? incomingUpdated : serverTimestamp()

  await setDoc(ref, {
    ...rest,
    createdAt,
    updatedAt,
  })
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
