# Invoice PDF — Vercel only (no Firebase Cloud Functions)

Invoice generation runs on the **Next.js website** (Spark-safe / free Vercel functions):

- `POST /api/invoices/generate`
- `POST /api/invoices/resend-email`

Admin panel calls `VITE_WEBSITE_API_URL` (see `src/services/invoiceFunctions.js`).

Customer app calls `EXPO_PUBLIC_WEBSITE_API_URL`.

See: `repair-series-website/src/lib/invoice/server/SPARK.md`
