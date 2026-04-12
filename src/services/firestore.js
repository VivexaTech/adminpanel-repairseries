import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
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

export const subscribeChatMessages = (chatId, onData, onError) => {
  ensureDb()
  const q = query(collection(db, 'supportChats', chatId, 'messages'), orderBy('timestamp', 'asc'))
  return onSnapshot(
    q,
    (snapshot) => {
      try {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        onData(rows)
      } catch (err) {
        console.error('[subscribeChatMessages] map', chatId, err)
        onError?.(err)
      }
    },
    (err) => {
      console.error('[subscribeChatMessages]', chatId, err)
      onError?.(err)
    },
  )
}

export const sendSupportMessage = async (chatId, { message, senderRole }) => {
  ensureDb()
  const chatRef = doc(db, 'supportChats', chatId)
  await setDoc(chatRef, { updatedAt: serverTimestamp() }, { merge: true })
  await addDoc(collection(db, 'supportChats', chatId, 'messages'), {
    message,
    senderRole,
    timestamp: serverTimestamp(),
  })
  await setDoc(
    chatRef,
    {
      lastMessage: message,
      lastMessageAt: serverTimestamp(),
      lastSenderRole: senderRole,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
