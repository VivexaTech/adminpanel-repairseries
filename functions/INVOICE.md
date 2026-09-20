# Invoice PDF — Vercel only (no Firebase Cloud Functions)

Invoice generation runs on the **Next.js website** (Spark-safe / free Vercel functions):

- `POST /api/invoices/generate`
- `POST /api/invoices/resend-email`
- `GET /api/invoices/file?bookingId=` (authenticated redirect to Cloudinary)

Admin panel calls `VITE_WEBSITE_API_URL` (see `src/services/invoiceFunctions.js`).

Customer app calls `EXPO_PUBLIC_WEBSITE_API_URL`.

New invoice PDFs are stored on **Cloudinary**. Firestore stores the Cloudinary URL and invoice metadata only. Customers, partners, and admins open that URL (or the authenticated file endpoint, which redirects to it).

Existing Cloudinary **image** URLs continue to work.

See: `testing/src/lib/invoice/server/SPARK.md`
