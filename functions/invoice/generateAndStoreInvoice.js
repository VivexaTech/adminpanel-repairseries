const { FieldValue } = require('firebase-admin/firestore')
const { buildInvoiceData } = require('./buildInvoiceData')
const { renderInvoicePdf } = require('./renderPdf')
const { uploadInvoicePdfToCloudinary } = require('./uploadCloudinary')
const { sendInvoiceEmail } = require('./sendEmail')

/**
 * Central invoice orchestration — single source of truth for PDF generation.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} options
 * @param {string} options.bookingId
 * @param {object} [options.booking]
 * @param {boolean} [options.force=false] regenerate even if invoice PDF exists
 * @param {boolean} [options.sendEmail=true]
 * @param {object} options.secrets cloudinary + resend config
 */
async function generateAndStoreInvoice(db, options) {
  const bookingId = String(options.bookingId || '').trim()
  if (!bookingId) throw new Error('bookingId is required')

  const bookingRef = db.doc(`bookings/${bookingId}`)
  const bookingSnap = options.booking
    ? null
    : await bookingRef.get()
  const booking = options.booking || (bookingSnap?.exists ? bookingSnap.data() : null)
  if (!booking) throw new Error('Booking not found')

  const invoiceId = `inv_${bookingId}`
  const invoiceRef = db.doc(`invoices/${invoiceId}`)
  const existingSnap = await invoiceRef.get()
  const existing = existingSnap.exists ? existingSnap.data() : null
  const existingPdf = String(existing?.pdfUrl || existing?.invoicePdfUrl || '').trim()

  if (existingPdf && !options.force) {
    // Never generate a duplicate when PDF already exists
    if (!booking.invoicePdfUrl || !booking.invoiceId) {
      await bookingRef.set(
        {
          invoiceId,
          invoiceNumber: existing.invoiceNumber || '',
          invoicePdfUrl: existingPdf,
          invoiceStatus: existing.status || 'issued',
          invoiceCreatedAt: existing.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }
    return {
      reused: true,
      invoiceId,
      invoiceNumber: existing.invoiceNumber || '',
      pdfUrl: existingPdf,
      email: { skipped: true, reason: 'already_exists' },
    }
  }

  const settingsSnap = await db.doc('settings/invoice').get()
  const settingsRaw = settingsSnap.exists ? settingsSnap.data() : {}

  // Keep invoice number stable on regenerate unless missing
  const forceInvoiceNumber =
    options.force && existing?.invoiceNumber ? existing.invoiceNumber : undefined

  const invoiceData = buildInvoiceData({
    booking,
    bookingId,
    settingsRaw,
    forceInvoiceNumber,
  })

  const pdfBuffer = await renderInvoicePdf(invoiceData)
  const uploaded = await uploadInvoicePdfToCloudinary(pdfBuffer, {
    folder: invoiceData.folder,
    publicId: invoiceData.publicId,
    fileName: invoiceData.fileName,
    config: options.secrets.cloudinary,
  })

  const now = FieldValue.serverTimestamp()
  const firestoreInvoice = {
    bookingId,
    bookingCode: invoiceData.bookingCode,
    invoiceNumber: invoiceData.invoiceNumber,
    customerId: invoiceData.customerId,
    technicianId: invoiceData.technicianId,
    customerName: invoiceData.customerName,
    customerPhone: invoiceData.customerPhone,
    customerEmail: invoiceData.customerEmail,
    customerAddress: invoiceData.customerAddress,
    serviceName: invoiceData.serviceName,
    technicianName: invoiceData.technicianName,
    bookingDate: invoiceData.bookingDate,
    serviceDate: invoiceData.serviceDate,
    invoiceDate: invoiceData.invoiceDate,
    paymentDate: invoiceData.paymentDate,
    paymentMethod: invoiceData.paymentMethod,
    paymentStatus: invoiceData.paymentStatus,
    paymentId: invoiceData.paymentId,
    lines: invoiceData.lines,
    subtotal: invoiceData.subtotal,
    discount: invoiceData.discount,
    gstPercent: invoiceData.gstPercent,
    gstAmount: invoiceData.gstAmount,
    grandTotal: invoiceData.grandTotal,
    amountInWords: invoiceData.amountInWords,
    currency: 'INR',
    isRevisit: invoiceData.isRevisit,
    status: 'issued',
    invoiceStatus: 'issued',
    source: 'cloud_function',
    companyName: invoiceData.companyName,
    companyAddress: invoiceData.companyAddress,
    companyPhone: invoiceData.companyPhone,
    companyEmail: invoiceData.companyEmail,
    gstin: invoiceData.gstin,
    gstNumber: invoiceData.gstin,
    upiId: invoiceData.upiId,
    terms: invoiceData.terms,
    thankYouMessage: invoiceData.thankYouMessage,
    pdfUrl: uploaded.url,
    invoicePdfUrl: uploaded.url,
    pdfPath: uploaded.publicId,
    pdfPublicId: uploaded.publicId,
    pdfBytes: uploaded.bytes,
    fileName: invoiceData.fileName,
    generatedAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...(options.force ? { regeneratedAt: now } : {}),
  }

  await invoiceRef.set(firestoreInvoice, { merge: true })

  await bookingRef.set(
    {
      invoiceId,
      invoiceNumber: invoiceData.invoiceNumber,
      invoicePdfUrl: uploaded.url,
      invoiceStatus: 'issued',
      invoiceCreatedAt: now,
      updatedAt: now,
    },
    { merge: true },
  )

  const invoiceForEmail = { ...invoiceData, pdfUrl: uploaded.url }
  let emailResult = { skipped: true, reason: 'send_disabled' }
  if (options.sendEmail !== false) {
    try {
      emailResult = await sendInvoiceEmail({
        invoice: invoiceForEmail,
        pdfBuffer,
        config: options.secrets.resend,
      })
      await invoiceRef.set(
        {
          emailSentAt: emailResult.skipped ? null : now,
          emailStatus: emailResult.skipped ? 'skipped' : 'sent',
          emailSkipReason: emailResult.skipped ? emailResult.reason || null : null,
          emailId: emailResult.id || null,
          updatedAt: now,
        },
        { merge: true },
      )
    } catch (err) {
      emailResult = {
        skipped: false,
        error: String(err?.message || err),
      }
      await invoiceRef.set(
        {
          emailStatus: 'failed',
          emailError: emailResult.error,
          updatedAt: now,
        },
        { merge: true },
      )
    }
  }

  return {
    reused: false,
    invoiceId,
    invoiceNumber: invoiceData.invoiceNumber,
    pdfUrl: uploaded.url,
    email: emailResult,
  }
}

module.exports = { generateAndStoreInvoice }
