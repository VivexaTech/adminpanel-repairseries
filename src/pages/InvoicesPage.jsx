import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, Modal, PageHeader, SearchInput } from '../components/ui'
import { DEFAULT_INVOICE_SETTINGS, normalizeInvoiceSettings } from '../constants/invoiceSettings'
import { useApp } from '../context/useApp'
import { isFirebaseConfigured } from '../firebase/config'
import { subscribeDoc } from '../services/firestore'
import { regenerateInvoice, resendInvoiceEmail } from '../services/invoiceFunctions'
import { currency, formatDateTime } from '../utils/helpers'

function invoiceCustomerLabel(invoice, customers) {
  const byId = customers?.find((c) => c.id === invoice.customerId)
  if (byId?.name) return byId.name
  return (
    invoice.customerName ||
    invoice.customerEmail ||
    invoice.customerPhone ||
    invoice.customerId ||
    '—'
  )
}

function invoicePdfUrl(invoice) {
  return String(invoice?.pdfUrl || invoice?.invoicePdfUrl || '').trim()
}

export function InvoicesPage() {
  const { invoices, customers, loading } = useApp()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [invoiceSettings, setInvoiceSettings] = useState({ ...DEFAULT_INVOICE_SETTINGS })
  const [busyKey, setBusyKey] = useState('')

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined
    const unsub = subscribeDoc(
      'settings',
      'invoice',
      (row) => setInvoiceSettings(normalizeInvoiceSettings(row || {})),
      () => {},
    )
    return () => unsub?.()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = [...(invoices || [])].sort((a, b) => {
      const aDate = a.createdAt?.toDate?.() || a.issuedAt?.toDate?.() || a.createdAt || a.issuedAt || 0
      const bDate = b.createdAt?.toDate?.() || b.issuedAt?.toDate?.() || b.createdAt || b.issuedAt || 0
      return new Date(bDate) - new Date(aDate)
    })
    if (!q) return rows
    return rows.filter((inv) => {
      const customer = invoiceCustomerLabel(inv, customers)
      const hay = [
        inv.id,
        inv.invoiceNumber,
        inv.bookingId,
        inv.bookingCode,
        customer,
        inv.customerEmail,
        inv.customerPhone,
        inv.status,
        inv.invoiceStatus,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [invoices, customers, search])

  const openPdf = (invoice) => {
    const url = invoicePdfUrl(invoice)
    if (!url) {
      toast.error('Invoice PDF is not ready yet.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const onDownloadPdf = (invoice) => {
    openPdf(invoice)
  }

  const onPrint = (invoice) => {
    openPdf(invoice)
    toast.message('Use the PDF viewer’s print button.')
  }

  const onCopyUrl = async (invoice) => {
    const url = invoicePdfUrl(invoice)
    if (!url) {
      toast.error('No Cloudinary URL on this invoice.')
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Cloudinary URL copied.')
    } catch {
      toast.error('Could not copy URL.')
    }
  }

  const onResendEmail = async (invoice) => {
    const key = `email:${invoice.id}`
    setBusyKey(key)
    try {
      const result = await resendInvoiceEmail({
        bookingId: invoice.bookingId,
        invoiceId: invoice.id,
      })
      if (result?.skipped) {
        toast.message(`Email skipped: ${result.reason || 'no email'}`)
      } else {
        toast.success('Invoice email sent.')
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to resend email.')
    } finally {
      setBusyKey('')
    }
  }

  const onRegenerate = async (invoice) => {
    if (!invoice.bookingId) {
      toast.error('Missing booking ID.')
      return
    }
    const key = `regen:${invoice.id}`
    setBusyKey(key)
    try {
      const result = await regenerateInvoice({
        bookingId: invoice.bookingId,
        sendEmail: true,
      })
      toast.success(
        result?.reused
          ? 'Invoice already up to date.'
          : `Invoice regenerated: ${result?.invoiceNumber || ''}`,
      )
    } catch (err) {
      toast.error(err?.message || 'Failed to regenerate invoice.')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        description="Single Cloudinary Tax Invoice PDF for every booking — view, download, print, resend, or regenerate."
        actions={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search invoice #, booking, customer…"
          />
        }
      />

      {loading.invoices ? (
        <Card>
          <p className="text-sm text-[var(--on-surface-variant)]">Loading invoices…</p>
        </Card>
      ) : null}

      {!loading.invoices && !filtered.length ? (
        <Card>
          <p className="text-sm text-[var(--on-surface-variant)]">No invoices found.</p>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {filtered.map((invoice) => {
          const customer = invoiceCustomerLabel(invoice, customers)
          const pdfUrl = invoicePdfUrl(invoice)
          const status = invoice.invoiceStatus || invoice.status || (pdfUrl ? 'issued' : 'pending')
          return (
            <Card key={invoice.id} className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-[var(--on-surface)]">
                    {invoice.invoiceNumber || invoice.id}
                  </h3>
                  <Badge tone={pdfUrl ? 'success' : status === 'failed' ? 'danger' : 'info'}>
                    {status}
                  </Badge>
                  {invoice.isRevisit ? <Badge tone="success">Revisit</Badge> : null}
                </div>
                <p className="text-sm text-[var(--on-surface-variant)]">
                  Booking: {invoice.bookingCode || invoice.bookingId || '—'}
                </p>
                <p className="text-sm text-[var(--on-surface-variant)]">Customer: {customer}</p>
                <p className="text-sm text-[var(--on-surface-variant)]">
                  Invoice date:{' '}
                  {formatDateTime(
                    invoice.generatedAt?.toDate?.() ||
                      invoice.createdAt?.toDate?.() ||
                      invoice.issuedAt?.toDate?.() ||
                      invoice.generatedAt ||
                      invoice.createdAt ||
                      invoice.issuedAt,
                  )}
                </p>
                {invoice.grandTotal != null || invoice.totalAmount != null || invoice.amount != null ? (
                  <p className="text-sm font-medium text-[var(--on-surface)]">
                    {currency(invoice.grandTotal ?? invoice.totalAmount ?? invoice.amount)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setSelected(invoice)}>
                  Details
                </Button>
                <Button variant="ghost" disabled={!pdfUrl} onClick={() => openPdf(invoice)}>
                  View Invoice
                </Button>
                <Button variant="ghost" disabled={!pdfUrl} onClick={() => onDownloadPdf(invoice)}>
                  Download PDF
                </Button>
                <Button variant="ghost" disabled={!pdfUrl} onClick={() => onPrint(invoice)}>
                  Print
                </Button>
                <Button variant="ghost" disabled={!pdfUrl} onClick={() => onCopyUrl(invoice)}>
                  Copy URL
                </Button>
                <Button
                  variant="ghost"
                  disabled={busyKey === `email:${invoice.id}` || !pdfUrl}
                  onClick={() => onResendEmail(invoice)}
                >
                  {busyKey === `email:${invoice.id}` ? 'Sending…' : 'Resend Email'}
                </Button>
                <Button
                  disabled={busyKey === `regen:${invoice.id}` || !invoice.bookingId}
                  onClick={() => onRegenerate(invoice)}
                >
                  {busyKey === `regen:${invoice.id}` ? 'Regenerating…' : 'Regenerate'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={Boolean(selected)}
        title={selected ? `Invoice ${selected.invoiceNumber || selected.id}` : 'Invoice'}
        onClose={() => setSelected(null)}
        className="max-w-3xl"
      >
        {selected ? (
          <div className="space-y-5 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <p>
                <span className="text-[var(--on-surface-variant)]">Booking:</span>{' '}
                {selected.bookingCode || selected.bookingId || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Customer:</span>{' '}
                {invoiceCustomerLabel(selected, customers)}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Email:</span>{' '}
                {selected.customerEmail || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Total:</span>{' '}
                {currency(selected.grandTotal ?? selected.totalAmount ?? selected.amount ?? 0)}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Service:</span>{' '}
                {selected.serviceName || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Technician:</span>{' '}
                {selected.technicianName || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Payment method:</span>{' '}
                {selected.paymentMethod || '—'}
              </p>
              <p>
                <span className="text-[var(--on-surface-variant)]">Payment status:</span>{' '}
                {selected.paymentStatus || '—'}
              </p>
              <p className="sm:col-span-2 break-all">
                <span className="text-[var(--on-surface-variant)]">Cloudinary URL:</span>{' '}
                {invoicePdfUrl(selected) || '—'}
              </p>
            </div>

            {Array.isArray(selected.lines) && selected.lines.length ? (
              <div>
                <h4 className="mb-2 text-base font-semibold text-[var(--on-surface)]">Items</h4>
                <ul className="space-y-1">
                  {selected.lines.map((line, i) => (
                    <li key={i} className="flex justify-between text-[var(--on-surface-variant)]">
                      <span>
                        {line.title || 'Service'} × {line.quantity ?? 1}
                      </span>
                      <span>{currency(line.amount ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.amountInWords ? (
              <p className="italic text-[var(--on-surface-variant)]">{selected.amountInWords}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={!invoicePdfUrl(selected)} onClick={() => openPdf(selected)}>
                View Invoice
              </Button>
              <Button variant="ghost" disabled={!invoicePdfUrl(selected)} onClick={() => onDownloadPdf(selected)}>
                Download PDF
              </Button>
              <Button variant="ghost" disabled={!invoicePdfUrl(selected)} onClick={() => onPrint(selected)}>
                Print
              </Button>
              <Button variant="ghost" disabled={!invoicePdfUrl(selected)} onClick={() => onCopyUrl(selected)}>
                Copy URL
              </Button>
              <Button
                variant="ghost"
                disabled={busyKey === `email:${selected.id}` || !invoicePdfUrl(selected)}
                onClick={() => onResendEmail(selected)}
              >
                Resend Email
              </Button>
              <Button
                disabled={busyKey === `regen:${selected.id}` || !selected.bookingId}
                onClick={() => onRegenerate(selected)}
              >
                Regenerate Invoice
              </Button>
            </div>
            <p className="text-xs text-[var(--on-surface-variant)]">
              Company defaults: {invoiceSettings.companyName} · GSTIN {invoiceSettings.gstin || '—'}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
