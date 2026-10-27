import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PrintButton } from '@/components/site/print-button'
import { getInvoiceForViewer } from '@/lib/invoice'

/**
 * Printable GST tax invoice for a confirmed booking.
 *
 * Access (owner session, staff, or the guest booking-access cookie) and
 * invoiceability are decided by getInvoiceForViewer — null means 404, so the
 * page never confirms that a booking exists to someone who can't see it.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Tax invoice',
  robots: { index: false, follow: false },
}

const IST = 'Asia/Kolkata'

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Invoices show paise even though bookings are whole rupees — tax splits can be fractional. */
function money(n: number): string {
  return `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const humanize = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const invoice = await getInvoiceForViewer(id)
  if (!invoice) notFound()

  const { seller, buyer, booking, lines, totals, payments } = invoice
  const hasRoom = Boolean(booking.checkInDate || booking.roomName)
  const hasTable = Boolean(booking.bookingDate || booking.tableNo)

  return (
    <div className="invoice-page bg-muted/40 px-4 py-8 print:bg-white print:p-0">
      {/* Print just the invoice sheet, on A4, without the site chrome. */}
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
          #invoice-sheet {
            position: absolute; left: 0; top: 0; width: 100%;
            margin: 0 !important; padding: 0 !important;
            box-shadow: none !important; border: 0 !important;
          }
          html, body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tr, .avoid-break { break-inside: avoid; }
        }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/booking-confirmed/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Back to booking
          </Link>
        </Button>
        <PrintButton />
      </div>

      <article
        id="invoice-sheet"
        className="mx-auto max-w-[210mm] rounded-lg border border-border bg-white p-6 text-[13px] leading-relaxed text-zinc-900 shadow-sm sm:p-10"
      >
        {/* ---------------- header ---------------- */}
        <header className="flex flex-col gap-6 border-b border-zinc-200 pb-6 sm:flex-row sm:items-start sm:justify-between print:flex-row">
          <div className="min-w-0">
            <p className="text-xl font-bold">{seller.name}</p>
            {seller.legalName && seller.legalName !== seller.name && (
              <p className="text-zinc-600">{seller.legalName}</p>
            )}
            <p className="mt-1 whitespace-pre-line text-zinc-600">{seller.address}</p>
            <p className="text-zinc-600">{seller.phone} · {seller.email}</p>
            {seller.gstin && (
              <p className="mt-1 font-medium">
                GSTIN: <span className="font-mono">{seller.gstin}</span>
              </p>
            )}
          </div>
          <div className="sm:text-right print:text-right">
            <p className="text-lg font-bold uppercase tracking-wider">Tax invoice</p>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 sm:justify-end print:justify-end">
              <dt className="text-zinc-500">Invoice no.</dt>
              <dd className="font-mono font-semibold">{invoice.invoiceNo}</dd>
              <dt className="text-zinc-500">Date</dt>
              <dd>{fmtDate(invoice.issuedAt)}</dd>
              <dt className="text-zinc-500">Booking</dt>
              <dd className="font-mono">{booking.reference}</dd>
            </dl>
          </div>
        </header>

        {/* ---------------- parties / stay ---------------- */}
        <section className="grid gap-6 border-b border-zinc-200 py-6 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Billed to</p>
            <p className="font-semibold">{buyer.name}</p>
            <p className="break-all text-zinc-600">{buyer.email}</p>
            {buyer.phone && <p className="text-zinc-600">{buyer.phone}</p>}
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Booking details</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-zinc-500">Type</dt>
              <dd>{humanize(booking.type).replace('Room table', 'Room + table')}</dd>
              {hasRoom && (
                <>
                  {booking.roomName && (
                    <>
                      <dt className="text-zinc-500">Room</dt>
                      <dd>{booking.roomName}{booking.roomNo ? ` (No. ${booking.roomNo})` : ''}</dd>
                    </>
                  )}
                  <dt className="text-zinc-500">Stay</dt>
                  <dd>{fmtDate(booking.checkInDate)} → {fmtDate(booking.checkOutDate)}</dd>
                </>
              )}
              {hasTable && (
                <>
                  <dt className="text-zinc-500">Table</dt>
                  <dd>
                    {booking.tableNo ? `Table ${booking.tableNo}` : 'Table'}
                    {booking.bookingDate ? ` · ${fmtDateTime(booking.bookingDate)}` : ''}
                  </dd>
                </>
              )}
              <dt className="text-zinc-500">Guests</dt>
              <dd>{booking.guestCount}</dd>
            </dl>
          </div>
        </section>

        {/* ---------------- line items ---------------- */}
        <section className="py-6">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[560px] border-collapse text-left print:min-w-0">
              <thead>
                <tr className="border-b-2 border-zinc-300 text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="py-2 pr-2 font-semibold">Description</th>
                  <th className="px-2 py-2 font-semibold">SAC</th>
                  <th className="px-2 py-2 text-right font-semibold">Qty</th>
                  <th className="px-2 py-2 text-right font-semibold">Rate</th>
                  <th className="px-2 py-2 text-right font-semibold">Taxable</th>
                  <th className="px-2 py-2 text-right font-semibold">GST</th>
                  <th className="py-2 pl-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="border-b border-zinc-200 align-top">
                    <td className="py-2 pr-2">{line.description}</td>
                    <td className="px-2 py-2 font-mono text-zinc-600">{line.sac}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(line.rate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(line.taxable)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {money(line.tax)}
                      <span className="block text-[11px] text-zinc-500">@ {line.gstPercent}%</span>
                    </td>
                    <td className="py-2 pl-2 text-right font-medium tabular-nums">{money(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------------- totals ---------------- */}
          <div className="avoid-break mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1 tabular-nums">
              <Row label="Taxable value" value={money(totals.taxable)} />
              <Row label="CGST" value={money(totals.cgst)} />
              <Row label="SGST" value={money(totals.sgst)} />
              <Row label="Total tax" value={money(totals.tax)} />
              <div className="border-t-2 border-zinc-300 pt-1">
                <Row strong label="Grand total" value={money(totals.grandTotal)} />
              </div>
              <Row label="Amount paid" value={money(totals.paid)} />
              {totals.refunded > 0 && <Row label="Refunded" value={`− ${money(totals.refunded)}`} />}
              <Row strong label={totals.balance > 0 ? 'Balance due' : 'Balance'} value={money(totals.balance)} />
            </dl>
          </div>
        </section>

        {/* ---------------- payments ---------------- */}
        {payments.length > 0 && (
          <section className="avoid-break border-t border-zinc-200 py-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Payments received</p>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-300 text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="py-1.5 pr-2 font-semibold">Date</th>
                  <th className="px-2 py-1.5 font-semibold">Mode</th>
                  <th className="px-2 py-1.5 font-semibold">Type</th>
                  <th className="py-1.5 pl-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-2">{fmtDate(p.date)}</td>
                    <td className="px-2 py-1.5">{humanize(p.mode)}</td>
                    <td className="px-2 py-1.5">{humanize(p.kind)}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="border-t border-zinc-200 pt-4 text-[11px] text-zinc-500">
          <p>
            This is a computer-generated invoice and does not require a signature. Amounts in Indian Rupees.
            {totals.balance > 0 ? ` Balance of ${money(totals.balance)} is payable at the hotel.` : ''}
          </p>
          <p className="mt-1">Thank you for staying with {seller.name}.</p>
        </footer>
      </article>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-semibold' : 'text-zinc-600'}`}>
      <dt>{label}</dt>
      <dd className="text-zinc-900">{value}</dd>
    </div>
  )
}
