/**
 * Renders a print-ready (A4) tax invoice from a structured invoice document
 * plus company settings (settings/invoice). Used for Print / Save-as-PDF in
 * the browser — no server-side PDF generation.
 */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inr(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '₹0.00'
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toDateLabel(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null)
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function companyAddress(settings) {
  return [
    settings.addressLine1,
    settings.addressLine2,
    [settings.city, settings.state, settings.pincode].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join('<br/>')
}

export function renderInvoiceHtml(invoice = {}, settings = {}) {
  const lines = Array.isArray(invoice.lines) && invoice.lines.length
    ? invoice.lines
    : [
        {
          title: invoice.serviceName || 'Service',
          quantity: 1,
          rate: invoice.subtotal ?? invoice.grandTotal ?? invoice.totalAmount ?? 0,
          amount: invoice.subtotal ?? invoice.grandTotal ?? invoice.totalAmount ?? 0,
        },
      ]

  const rows = lines
    .map(
      (line, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(line.title || 'Service')}</td>
          <td class="num">${esc(line.quantity ?? 1)}</td>
          <td class="num">${inr(line.rate ?? line.amount ?? 0)}</td>
          <td class="num">${inr(line.amount ?? 0)}</td>
        </tr>`,
    )
    .join('')

  const subtotal = invoice.subtotal ?? invoice.grandTotal ?? invoice.totalAmount ?? 0
  const discount = invoice.discount ?? 0
  const gstPercent = invoice.gstPercent ?? 0
  const gstAmount = invoice.gstAmount ?? 0
  const grandTotal = invoice.grandTotal ?? invoice.totalAmount ?? subtotal

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Invoice ${esc(invoice.invoiceNumber || invoice.id || '')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 32px; font-size: 13px; }
  .sheet { max-width: 800px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f4c81; padding-bottom: 16px; }
  .brand h1 { font-size: 22px; color: #0f4c81; }
  .brand p { color: #555; margin-top: 4px; line-height: 1.5; }
  .meta { text-align: right; }
  .meta h2 { font-size: 18px; letter-spacing: 2px; color: #0f4c81; }
  .meta p { margin-top: 4px; color: #555; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin: 20px 0; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
  .party p { line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #0f4c81; color: #fff; text-align: left; padding: 8px 10px; font-size: 12px; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; }
  .num { text-align: right; }
  .totals { margin-top: 12px; margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #0f4c81; margin-top: 6px; padding-top: 8px; font-size: 15px; font-weight: 700; color: #0f4c81; }
  .words { margin-top: 10px; font-style: italic; color: #555; }
  .terms { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e5e5; color: #777; font-size: 11px; line-height: 1.6; }
  .thanks { margin-top: 16px; text-align: center; color: #0f4c81; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #e8f5e9; color: #2e7d32; font-size: 11px; font-weight: 600; margin-top: 6px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <div class="brand">
      ${settings.logoUrl ? `<img src="${esc(settings.logoUrl)}" alt="logo" style="height:48px;margin-bottom:8px"/>` : ''}
      <h1>${esc(settings.companyName || 'Repair Series')}</h1>
      <p>
        ${companyAddress(settings)}
        ${settings.phone ? `<br/>Phone: ${esc(settings.phone)}` : ''}
        ${settings.email ? `<br/>Email: ${esc(settings.email)}` : ''}
        ${settings.gstin ? `<br/>GSTIN: ${esc(settings.gstin)}` : ''}
      </p>
    </div>
    <div class="meta">
      <h2>TAX INVOICE</h2>
      <p><strong>${esc(invoice.invoiceNumber || invoice.id || '')}</strong></p>
      <p>Date: ${esc(toDateLabel(invoice.paymentDate || invoice.createdAt) || '—')}</p>
      <p>Booking: ${esc(invoice.bookingCode || invoice.bookingId || '—')}</p>
      ${String(invoice.paymentStatus || '').toLowerCase() === 'paid' ? '<span class="badge">PAID</span>' : ''}
      ${invoice.isRevisit ? '<span class="badge">FREE REVISIT</span>' : ''}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Billed To</h3>
      <p>
        <strong>${esc(invoice.customerName || 'Customer')}</strong><br/>
        ${esc(invoice.customerAddress || '')}<br/>
        ${invoice.customerPhone ? `Phone: ${esc(invoice.customerPhone)}<br/>` : ''}
        ${invoice.customerEmail ? `Email: ${esc(invoice.customerEmail)}` : ''}
      </p>
    </div>
    <div class="party" style="text-align:right">
      <h3>Service Details</h3>
      <p>
        ${invoice.serviceName ? `Service: ${esc(invoice.serviceName)}<br/>` : ''}
        ${invoice.technicianName ? `Technician: ${esc(invoice.technicianName)}<br/>` : ''}
        ${invoice.serviceDate ? `Service date: ${esc(toDateLabel(invoice.serviceDate))}<br/>` : ''}
        ${invoice.paymentMethod ? `Payment: ${esc(invoice.paymentMethod)}` : ''}
      </p>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${inr(subtotal)}</span></div>
    ${Number(discount) > 0 ? `<div class="row"><span>Discount</span><span>− ${inr(discount)}</span></div>` : ''}
    ${Number(gstPercent) > 0 ? `<div class="row"><span>GST (${esc(gstPercent)}%)</span><span>${inr(gstAmount)}</span></div>` : ''}
    <div class="row grand"><span>Grand Total</span><span>${inr(grandTotal)}</span></div>
  </div>

  ${invoice.amountInWords ? `<p class="words">${esc(invoice.amountInWords)}</p>` : ''}

  <div class="terms">
    <strong>Terms &amp; Conditions</strong><br/>
    ${esc(settings.terms || 'This is a computer-generated tax invoice.')}
  </div>

  <p class="thanks">${esc(settings.thankYouMessage || 'Thank you for choosing Repair Series.')}</p>
</div>
</body>
</html>`
}
