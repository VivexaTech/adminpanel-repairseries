import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
)

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null

/** Secondary app so `createUserWithEmailAndPassword` does not replace the signed-in admin session. */
const secondaryApp =
  isFirebaseConfigured && app ? initializeApp(firebaseConfig, 'RepairSeriesAdminSecondary') : null

export const firebaseApp = app
export const auth = app ? getAuth(app) : null
export const secondaryAuth = secondaryApp ? getAuth(secondaryApp) : null
export const db = app ? getFirestore(app) : null

export const analyticsPromise = app
  ? isAnalyticsSupported().then((supported) => (supported ? getAnalytics(app) : null))
  : Promise.resolve(null)
