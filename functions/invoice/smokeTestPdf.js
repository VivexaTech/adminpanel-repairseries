/**
 * Local smoke test for PDF rendering (does not upload or email).
 * Usage (from functions folder after npm install):
 *   node invoice/smokeTestPdf.js
 */
const fs = require('fs')
const path = require('path')
const { buildInvoiceData } = require('./buildInvoiceData')
const { renderInvoicePdf } = require('./renderPdf')

async function main() {
  const bookingId = 'smokeTestBooking001'
  const data = buildInvoiceData({
    bookingId,
    settingsRaw: {},
    booking: {
      bookingCode: 'BK-SMOKE1',
      customerId: 'cust1',
      technicianId: 'tech1',
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      customerEmail: 'customer@example.com',
      address: {
        fullAddress: 'Sample Address, Aligarh, UP 202001',
      },
      serviceName: 'AC Gas Refill',
      technicianName: 'Ravi Kumar',
      amount: 1499,
      baseAmount: 1499,
      visitingCharge: 0,
      addOnServices: [{ serviceName: 'Filter Clean', quantity: 1, price: 199 }],
      discountAmount: 50,
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      status: 'Completed',
      paidAt: new Date(),
      completedAt: new Date(),
      createdAt: new Date(),
      finalBookingAmount: 1648,
    },
  })

  const pdf = await renderInvoicePdf(data)
  const out = path.join(__dirname, '..', 'smoke-invoice.pdf')
  fs.writeFileSync(out, pdf)
  console.log('Wrote', out, `(${pdf.length} bytes)`)
  console.log('Invoice number:', data.invoiceNumber)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
