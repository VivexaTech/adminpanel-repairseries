# LEGACY — do not use on Firebase Spark

Invoice generation was moved to the **Next.js website** (Spark-safe):

- `POST /api/invoices/generate`
- `POST /api/invoices/resend-email`

See: `website/src/lib/invoice/server/SPARK.md`

`functions/index.js` exports nothing so Cloud Functions are not required for invoices.
