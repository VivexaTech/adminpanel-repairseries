/**
 * Repair Series Cloud Functions
 *
 * SPARK (FREE) PLAN: Do NOT deploy invoice / background billing features here.
 * Invoice PDF + Resend email run on Next.js API routes:
 *   POST /api/invoices/generate
 *   POST /api/invoices/resend-email
 *
 * The FCM helper below also requires Blaze if deployed as a Cloud Function.
 * Prefer client-side Firestore listeners for in-app updates on Spark.
 *
 * This file intentionally exports no Cloud Functions so `firebase deploy --only functions`
 * does not create paid-plan resources for invoices.
 */

// Intentionally empty — Spark-compatible. Invoice logic lives in the website Next.js APIs.
module.exports = {};
