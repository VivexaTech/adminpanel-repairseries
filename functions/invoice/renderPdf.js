const PDFDocument = require('pdfkit')
const QRCode = require('qrcode')
const { BRAND } = require('./defaults')

function inr(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function drawRoundedRect(doc, x, y, w, h, r, fill, stroke) {
  doc.save()
  doc.roundedRect(x, y, w, h, r)
  if (fill) doc.fill(fill)
  if (stroke) {
    doc.strokeColor(stroke).lineWidth(0.8).stroke()
  }
  doc.restore()
}

function drawHeaderBar(doc, pageWidth, margin) {
  doc.save()
  doc.rect(0, 0, pageWidth, 6).fill(BRAND.orange)
  doc.restore()
}

function drawFooterBar(doc, pageWidth, pageHeight, invoice) {
  const h = 28
  const y = pageHeight - h
  doc.save()
  doc.rect(0, y, pageWidth, h).fill(BRAND.banner)
  doc.fillColor(BRAND.white).font('Helvetica').fontSize(8)
  const parts = [
    invoice.companyPhone ? `☎ ${invoice.companyPhone}` : '',
    invoice.companyEmail ? `✉ ${invoice.companyEmail}` : '',
    invoice.settings?.city
      ? `📍 ${invoice.settings.city}, ${invoice.settings.state} - ${invoice.settings.pincode}`
      : '',
  ].filter(Boolean)
  doc.text(parts.join('    •    '), 36, y + 10, {
    width: pageWidth - 72,
    align: 'center',
  })
  doc.restore()
}

function drawLogoMark(doc, x, y) {
  doc.save()
  doc.roundedRect(x, y, 42, 42, 8).fill(BRAND.orange)
  doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(16)
  doc.text('RS', x, y + 13, { width: 42, align: 'center' })
  doc.restore()
  doc.fillColor(BRAND.orange).font('Helvetica-Bold').fontSize(9)
  doc.text('REPAIR SERIES', x - 8, y + 46, { width: 58, align: 'center' })
}

async function buildQrPng(upiId, amount, note) {
  if (!upiId) return null
  const params = new URLSearchParams({
    pa: upiId,
    pn: 'Repair Series',
    cu: 'INR',
  })
  if (amount > 0) params.set('am', String(amount))
  if (note) params.set('tn', String(note).slice(0, 80))
  const uri = `upi://pay?${params.toString()}`
  return QRCode.toBuffer(uri, {
    type: 'png',
    width: 140,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}

/**
 * Renders the single canonical Repair Series Tax Invoice PDF (A4).
 */
async function renderInvoicePdf(invoice) {
  const qrBuffer = await buildQrPng(
    invoice.upiId,
    invoice.grandTotal,
    invoice.invoiceNumber || invoice.bookingId,
  )

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 40, left: 36, right: 36 },
      info: {
        Title: `Tax Invoice ${invoice.invoiceNumber || ''}`,
        Author: 'Repair Series',
        Subject: 'Tax Invoice',
      },
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageWidth = doc.page.width
    const pageHeight = doc.page.height
    const margin = 36
    const contentWidth = pageWidth - margin * 2

    drawHeaderBar(doc, pageWidth, margin)

    // Logo + title row
    drawLogoMark(doc, margin, 22)
    doc.fillColor(BRAND.orange).font('Helvetica-Bold').fontSize(22)
    doc.text('REPAIR SERIES', margin + 70, 24, {
      width: contentWidth - 70,
      align: 'right',
    })

    const bannerW = 160
    const bannerX = pageWidth - margin - bannerW
    doc.save()
    doc.rect(bannerX, 50, bannerW, 22).fill(BRAND.banner)
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(11)
    doc.text('TAX INVOICE', bannerX, 55, { width: bannerW, align: 'center' })
    doc.restore()

    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8.5)
    doc.text(invoice.companyAddress || '', margin, 82, {
      width: contentWidth,
      align: 'center',
      lineGap: 1.5,
    })

    const contactY = 108
    doc.fillColor(BRAND.text).font('Helvetica').fontSize(8.5)
    const contactLine = [
      invoice.companyPhone ? `☎  ${invoice.companyPhone}` : '',
      invoice.companyEmail ? `✉  ${invoice.companyEmail}` : '',
      invoice.gstin ? `GSTIN: ${invoice.gstin}` : '',
    ]
      .filter(Boolean)
      .join('     |     ')
    doc.text(contactLine, margin, contactY, {
      width: contentWidth,
      align: 'center',
    })

    doc
      .moveTo(margin, contactY + 16)
      .lineTo(pageWidth - margin, contactY + 16)
      .strokeColor(BRAND.orange)
      .lineWidth(1.5)
      .stroke()

    // Bill To + Invoice Details cards
    const cardY = contactY + 28
    const cardGap = 14
    const cardW = (contentWidth - cardGap) / 2
    const cardH = 92

    drawRoundedRect(doc, margin, cardY, cardW, cardH, 8, BRAND.cream, BRAND.line)
    doc.save()
    doc.roundedRect(margin, cardY, cardW, 20, 8).fill(BRAND.orange)
    doc.rect(margin, cardY + 10, cardW, 10).fill(BRAND.orange)
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(9)
    doc.text('BILL TO', margin + 10, cardY + 6)
    doc.restore()

    doc.fillColor(BRAND.text).font('Helvetica').fontSize(8.5)
    let by = cardY + 28
    const billRows = [
      ['Customer Name', invoice.customerName],
      ['Mobile', invoice.customerPhone],
      ['Address', invoice.customerAddress],
    ]
    for (const [label, value] of billRows) {
      doc.font('Helvetica-Bold').fillColor(BRAND.muted).text(`${label}:`, margin + 10, by, {
        continued: false,
        width: 78,
      })
      doc
        .font('Helvetica')
        .fillColor(BRAND.text)
        .text(value || '—', margin + 88, by, {
          width: cardW - 98,
          height: label === 'Address' ? 28 : 12,
        })
      by += label === 'Address' ? 30 : 14
    }

    const rightX = margin + cardW + cardGap
    drawRoundedRect(doc, rightX, cardY, cardW, cardH, 8, BRAND.cream, BRAND.line)
    doc.save()
    doc.roundedRect(rightX, cardY, cardW, 20, 8).fill(BRAND.orange)
    doc.rect(rightX, cardY + 10, cardW, 10).fill(BRAND.orange)
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(9)
    doc.text('INVOICE DETAILS', rightX + 10, cardY + 6)
    doc.restore()

    doc.fillColor(BRAND.text).font('Helvetica').fontSize(8.5)
    let dy = cardY + 28
    const detailRows = [
      ['Bill No.', invoice.invoiceNumber],
      ['Date', invoice.invoiceDate],
      ['Payment Mode', invoice.paymentMethod],
      ['Service Date', invoice.serviceDate],
      ['Booking ID', invoice.bookingCode || invoice.bookingId],
    ]
    if (invoice.paymentId) detailRows.push(['Payment ID', invoice.paymentId])
    if (invoice.technicianName) {
      detailRows.push(['Technician', invoice.technicianName])
    }
    for (const [label, value] of detailRows.slice(0, 5)) {
      doc.font('Helvetica-Bold').fillColor(BRAND.muted).text(`${label}:`, rightX + 10, dy, {
        width: 82,
      })
      doc
        .font('Helvetica')
        .fillColor(BRAND.text)
        .text(value || '—', rightX + 92, dy, { width: cardW - 102 })
      dy += 13
    }

    // Line items table
    const tableTop = cardY + cardH + 16
    const col = {
      sr: margin,
      particular: margin + 36,
      qty: margin + contentWidth - 170,
      rate: margin + contentWidth - 120,
      amount: margin + contentWidth - 60,
    }
    const rowH = 18
    const headerH = 22
    const minRows = Math.max(6, (invoice.lines || []).length)

    doc.save()
    doc.rect(margin, tableTop, contentWidth, headerH).fill(BRAND.orange)
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(8.5)
    doc.text('Sr.', col.sr + 6, tableTop + 7)
    doc.text('Particulars', col.particular, tableTop + 7)
    doc.text('Qty', col.qty, tableTop + 7, { width: 28, align: 'center' })
    doc.text('Rate (₹)', col.rate, tableTop + 7, { width: 52, align: 'right' })
    doc.text('Amount (₹)', col.amount, tableTop + 7, {
      width: 54,
      align: 'right',
    })
    doc.restore()

    const lines = Array.isArray(invoice.lines) ? invoice.lines : []
    let y = tableTop + headerH
    for (let i = 0; i < minRows; i += 1) {
      const line = lines[i]
      if (i % 2 === 1) {
        doc.save()
        doc.rect(margin, y, contentWidth, rowH).fill(BRAND.rowAlt)
        doc.restore()
      }
      doc
        .strokeColor(BRAND.line)
        .lineWidth(0.4)
        .rect(margin, y, contentWidth, rowH)
        .stroke()

      doc.fillColor(BRAND.text).font('Helvetica').fontSize(8)
      doc.text(String(i + 1), col.sr + 6, y + 5, { width: 24 })
      if (line) {
        doc.text(line.title || 'Service', col.particular, y + 5, {
          width: col.qty - col.particular - 6,
        })
        doc.text(String(line.quantity ?? 1), col.qty, y + 5, {
          width: 28,
          align: 'center',
        })
        doc.text(inr(line.rate), col.rate, y + 5, { width: 52, align: 'right' })
        doc.text(inr(line.amount), col.amount, y + 5, {
          width: 54,
          align: 'right',
        })
      }
      y += rowH
    }

    // Amount in words + totals
    const totalsTop = y + 12
    const wordsW = contentWidth * 0.55
    const totalsW = contentWidth * 0.42
    const totalsX = pageWidth - margin - totalsW

    drawRoundedRect(doc, margin, totalsTop, wordsW, 58, 6, BRAND.cream, BRAND.line)
    doc.save()
    doc.roundedRect(margin, totalsTop, wordsW, 18, 6).fill(BRAND.orange)
    doc.rect(margin, totalsTop + 10, wordsW, 8).fill(BRAND.orange)
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(8)
    doc.text('AMOUNT IN WORDS', margin + 10, totalsTop + 5)
    doc.restore()
    doc.fillColor(BRAND.text).font('Helvetica-Oblique').fontSize(8.5)
    doc.text(invoice.amountInWords || 'Rupees Zero Only', margin + 10, totalsTop + 26, {
      width: wordsW - 20,
    })

    const totalRows = [
      ['Sub Total', `₹ ${inr(invoice.subtotal)}`],
      [
        `GST${invoice.gstPercent ? ` (${invoice.gstPercent}%)` : ''}`,
        `₹ ${inr(invoice.gstAmount)}`,
      ],
      ['Discount', `₹ ${inr(invoice.discount)}`],
    ]
    let ty = totalsTop
    for (const [label, value] of totalRows) {
      doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8.5)
      doc.text(label, totalsX, ty + 2, { width: totalsW * 0.55 })
      doc.fillColor(BRAND.text).font('Helvetica-Bold')
      doc.text(value, totalsX + totalsW * 0.45, ty + 2, {
        width: totalsW * 0.55,
        align: 'right',
      })
      ty += 14
    }
    doc.save()
    doc.roundedRect(totalsX, ty, totalsW, 22, 4).fill(BRAND.orange)
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(10)
    doc.text('GRAND TOTAL', totalsX + 8, ty + 6)
    doc.text(`₹ ${inr(invoice.grandTotal)}`, totalsX + totalsW * 0.4, ty + 6, {
      width: totalsW * 0.55,
      align: 'right',
    })
    doc.restore()

    // Terms + Scan & Pay
    const bottomY = Math.max(totalsTop + 70, ty + 36)
    const termsW = contentWidth * 0.58
    doc.fillColor(BRAND.orange).font('Helvetica-Bold').fontSize(9)
    doc.text('Terms & Conditions', margin, bottomY)
    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(7.5)
    const terms = Array.isArray(invoice.terms) ? invoice.terms : []
    let termY = bottomY + 14
    terms.slice(0, 5).forEach((term, idx) => {
      doc.text(`${idx + 1}. ${term}`, margin, termY, { width: termsW - 8 })
      termY += 11
    })

    const payX = margin + termsW + 10
    const payW = contentWidth - termsW - 10
    doc.fillColor(BRAND.orange).font('Helvetica-Bold').fontSize(9)
    doc.text('SCAN & PAY', payX, bottomY, { width: payW, align: 'center' })
    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(7.5)
    doc.text(`UPI ID: ${invoice.upiId || '—'}`, payX, bottomY + 12, {
      width: payW,
      align: 'center',
    })
    if (qrBuffer) {
      doc.image(qrBuffer, payX + (payW - 78) / 2, bottomY + 24, {
        width: 78,
        height: 78,
      })
    }
    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(7)
    doc.text('GPay  •  PhonePe  •  Paytm', payX, bottomY + 108, {
      width: payW,
      align: 'center',
    })

    // Signatures + thank you
    const sigY = Math.max(termY, bottomY + 120) + 18
    doc
      .moveTo(margin, sigY)
      .lineTo(margin + 140, sigY)
      .strokeColor(BRAND.line)
      .lineWidth(1)
      .stroke()
    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8)
    doc.text('Customer Signature', margin, sigY + 6, { width: 140, align: 'center' })

    doc.fillColor(BRAND.orange).font('Helvetica-Bold').fontSize(9)
    doc.text('★ ★ ★', margin, sigY - 2, { width: contentWidth, align: 'center' })
    doc.fillColor(BRAND.banner).font('Helvetica-Bold').fontSize(8)
    doc.text('Thank You', margin, sigY + 10, { width: contentWidth, align: 'center' })
    doc.fillColor(BRAND.orange).font('Helvetica-Bold').fontSize(9)
    doc.text(invoice.thankYouMessage || 'FOR CHOOSING REPAIR SERIES', margin, sigY + 22, {
      width: contentWidth,
      align: 'center',
    })

    const authX = pageWidth - margin - 140
    doc
      .moveTo(authX, sigY)
      .lineTo(authX + 140, sigY)
      .strokeColor(BRAND.line)
      .lineWidth(1)
      .stroke()
    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8)
    doc.text('Authorized Signature', authX, sigY + 6, { width: 140, align: 'center' })
    doc.fillColor(BRAND.orange).font('Helvetica-Bold').fontSize(8)
    doc.text('REPAIR SERIES', authX, sigY + 18, { width: 140, align: 'center' })

    drawFooterBar(doc, pageWidth, pageHeight, invoice)
    doc.end()
  })
}

module.exports = { renderInvoicePdf }
