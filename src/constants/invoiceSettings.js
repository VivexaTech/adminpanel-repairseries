/** Company invoice / GST defaults stored in settings/invoice. */

export const DEFAULT_INVOICE_SETTINGS = Object.freeze({
  companyName: 'Repair Series',
  legalName: 'Repair Series',
  gstin: '09HLRPK3680M1Z3',
  pan: '',
  addressLine1: '1576/6, 1st Floor, Baghel Nagar Colony, Kher Bypass Road',
  addressLine2: 'Gali Number 8, Soot Mill Chauraha',
  city: 'Aligarh',
  state: 'Uttar Pradesh',
  pincode: '202001',
  phone: '7895720237',
  email: 'repairseries@gmail.com',
  website: '',
  logoUrl: '',
  udyamNumber: '',
  upiId: 'repairseries@upi',
  terms:
    'Goods/Services once delivered will not be taken back.\nWarranty is applicable only where mentioned.\nPayment is due immediately after completion of service.\nAll disputes are subject to Aligarh Jurisdiction only.\nThis is a computer-generated invoice and does not require a signature.',
  thankYouMessage: 'Thank You FOR CHOOSING REPAIR SERIES',
  invoicePrefix: 'INV',
  gstPercent: 18,
  gstEnabled: false,
})

export function normalizeInvoiceSettings(raw = {}) {
  const gst = Number(raw.gstPercent)
  return {
    companyName: String(raw.companyName || DEFAULT_INVOICE_SETTINGS.companyName).trim(),
    legalName: String(raw.legalName || raw.companyName || DEFAULT_INVOICE_SETTINGS.legalName).trim(),
    gstin: String(raw.gstin || DEFAULT_INVOICE_SETTINGS.gstin).trim(),
    pan: String(raw.pan || '').trim(),
    addressLine1: String(raw.addressLine1 || DEFAULT_INVOICE_SETTINGS.addressLine1).trim(),
    addressLine2: String(raw.addressLine2 || DEFAULT_INVOICE_SETTINGS.addressLine2).trim(),
    city: String(raw.city || DEFAULT_INVOICE_SETTINGS.city).trim(),
    state: String(raw.state || DEFAULT_INVOICE_SETTINGS.state).trim(),
    pincode: String(raw.pincode || DEFAULT_INVOICE_SETTINGS.pincode).trim(),
    phone: String(raw.phone || DEFAULT_INVOICE_SETTINGS.phone).trim(),
    email: String(raw.email || DEFAULT_INVOICE_SETTINGS.email).trim(),
    website: String(raw.website || '').trim(),
    logoUrl: String(raw.logoUrl || '').trim(),
    udyamNumber: String(raw.udyamNumber || raw.udyam || '').trim(),
    upiId: String(raw.upiId || DEFAULT_INVOICE_SETTINGS.upiId).trim(),
    terms: String(raw.terms || DEFAULT_INVOICE_SETTINGS.terms).trim(),
    thankYouMessage: String(
      raw.thankYouMessage || DEFAULT_INVOICE_SETTINGS.thankYouMessage,
    ).trim(),
    invoicePrefix: String(raw.invoicePrefix || DEFAULT_INVOICE_SETTINGS.invoicePrefix)
      .trim()
      .toUpperCase()
      .slice(0, 8),
    gstPercent: Number.isFinite(gst) && gst >= 0 ? gst : 18,
    gstEnabled: raw.gstEnabled === true || raw.gstEnabled === 'true',
  }
}
