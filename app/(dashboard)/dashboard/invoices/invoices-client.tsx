'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronsUpDown,
  Download,
  Euro,
  ExternalLink,
  Eye,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  RefreshCw,
  Sofa,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/invoices/calculate'
import { VIEW_TYPE_LABELS, hasPricesFor, type ViewType } from '@/lib/invoices/pricing'
import type { InvoiceDocument } from '@/lib/invoices/build'
import type { InvoiceRequest } from '@/lib/invoices/request'
import type { Party } from '@/lib/invoices/parties'

const INK = '#012e64'

type Preset = 'this-month' | 'last-month' | 'custom'
type Line = InvoiceDocument['calculation']['lines'][number]

// Local calendar dates as YYYY-MM-DD, so "this month" is the viewer's month.
function isoDay(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function presetRange(preset: Exclude<Preset, 'custom'>) {
  const now = new Date()
  const offset = preset === 'this-month' ? 0 : -1
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { startDate: isoDay(start), endDate: isoDay(end) }
}

function presetOf(startDate: string, endDate: string): Preset {
  for (const preset of ['this-month', 'last-month'] as const) {
    const range = presetRange(preset)
    if (range.startDate === startDate && range.endDate === endDate) return preset
  }
  return 'custom'
}

// 2026-09-01 → 1 Sep 2026, without the viewer's time zone shifting the day.
function prettyDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const SOURCE_HINTS: Record<string, string> = {
  proposal: 'Taken from the project’s proposal',
  'project-name': 'Taken from the project name',
  comment: 'Taken from the order comment',
  'property-type': 'Only the project’s property type was known — the room is a guess',
  default: 'Nothing on the order names a category — the default was used',
}

function pdfUrl(request: InvoiceRequest, inline = false) {
  const params = new URLSearchParams({
    supplier: request.supplier,
    viewType: request.viewType,
    startDate: request.startDate,
    endDate: request.endDate,
  })
  if (inline) params.set('inline', '1')
  return `/api/invoices/pdf?${params}`
}

function filenameFrom(disposition: string | null, fallback: string) {
  const match = disposition?.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? fallback
}

// Fetch the PDF and save it from a blob, so a failed request surfaces its
// error instead of the browser silently dropping an <a download>.
async function downloadPdf(invoice: InvoiceDocument) {
  const res = await fetch(pdfUrl(invoice.request))
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `The download failed (HTTP ${res.status})`)
  }
  const blob = await res.blob()
  const filename = filenameFrom(res.headers.get('Content-Disposition'), `INV-${invoice.reference}.pdf`)
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser time to start the save before the blob is released.
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
  return filename
}

export function InvoicesClient({
  suppliers,
  initialInvoice = null,
}: {
  suppliers: string[]
  /** Pre-built invoice to show on first render (its filters seed the form). */
  initialInvoice?: InvoiceDocument | null
}) {
  const seed = initialInvoice?.request ?? { ...presetRange('last-month'), viewType: 'exterior' as ViewType, supplier: '' }
  const [startDate, setStartDate] = useState(seed.startDate)
  const [endDate, setEndDate] = useState(seed.endDate)
  const [viewType, setViewType] = useState<ViewType>(seed.viewType)
  const [supplier, setSupplier] = useState(seed.supplier)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const preset = presetOf(startDate, endDate)

  const [invoice, setInvoice] = useState<InvoiceDocument | null>(initialInvoice)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const formError =
    !startDate || !endDate
      ? 'Choose a start and end date'
      : endDate < startDate
        ? 'The end date must be on or after the start date'
        : null
  const ready = !!supplier && !formError

  const request = useMemo<InvoiceRequest>(
    () => ({ supplier, viewType, startDate, endDate }),
    [supplier, viewType, startDate, endDate]
  )

  // The invoice follows the filters: any change rebuilds it, so the preview on
  // screen and the PDF behind Download are always the same invoice.
  const shownFor = useRef<string | null>(initialInvoice ? JSON.stringify(initialInvoice.request) : null)
  useEffect(() => {
    if (!ready) {
      setInvoice(null)
      setError(null)
      shownFor.current = null
      return
    }
    const key = JSON.stringify(request)
    if (shownFor.current === key && reloadKey === 0) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/invoices/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || `Could not build the invoice (HTTP ${res.status})`)
        shownFor.current = key
        setInvoice(body.data)
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setError(e.message)
        setInvoice(null)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [request, ready, reloadKey])

  const choosePreset = (next: Exclude<Preset, 'custom'>) => {
    const range = presetRange(next)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  const canDownload = !!invoice && !loading && invoice.calculation.lines.length > 0

  const handleDownload = async () => {
    if (!invoice) return
    setDownloading(true)
    try {
      const filename = await downloadPdf(invoice)
      toast.success('Invoice downloaded', { description: filename })
    } catch (e: any) {
      toast.error('Couldn’t download the invoice', { description: e.message })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Supplier Invoices</h1>
            <p className="text-gray-500 mt-1">
              What a supplier bills for the orders they delivered. Built live from the orders table — nothing is saved.
            </p>
          </div>
          <div className="flex gap-2">
            {canDownload ? (
              <Button variant="outline" asChild title="Open the PDF in a new tab">
                <a href={pdfUrl(invoice!.request, true)} target="_blank" rel="noopener">
                  <ExternalLink className="h-4 w-4" />
                  Open
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <ExternalLink className="h-4 w-4" />
                Open
              </Button>
            )}
            <Button
              onClick={handleDownload}
              disabled={!canDownload || downloading}
              style={canDownload ? { backgroundColor: INK } : undefined}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4 sm:p-5 bg-white border border-gray-200 gap-0">
          <div className="grid gap-5 lg:grid-cols-[minmax(200px,1fr)_auto_minmax(320px,1.4fr)] lg:items-end">
            {/* Supplier */}
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Supplier</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={supplierOpen}
                    className="w-full justify-between font-normal h-10"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Truck className="h-4 w-4 text-gray-400 shrink-0" />
                      {supplier || <span className="text-gray-500">Choose a supplier…</span>}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search suppliers…" />
                    <CommandList>
                      <CommandEmpty>No supplier found.</CommandEmpty>
                      <CommandGroup>
                        {suppliers.map((name) => (
                          <CommandItem
                            key={name}
                            value={name}
                            onSelect={() => {
                              setSupplier(name)
                              setSupplierOpen(false)
                            }}
                          >
                            <Check className={cn('h-4 w-4', supplier === name ? 'opacity-100' : 'opacity-0')} />
                            {name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* View type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">View type</Label>
              <div role="radiogroup" aria-label="View type" className="inline-flex h-10 rounded-md bg-gray-100 p-1 w-full lg:w-auto">
                {(
                  [
                    ['exterior', Building2],
                    ['interior', Sofa],
                  ] as const
                ).map(([value, Icon]) => {
                  const active = viewType === value
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setViewType(value)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-2 rounded px-4 text-sm font-medium transition-colors',
                        active ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                      )}
                      style={active ? { color: INK } : undefined}
                    >
                      <Icon className="h-4 w-4" />
                      {VIEW_TYPE_LABELS[value]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Period */}
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Delivered between</Label>
                <div className="flex gap-1">
                  {(
                    [
                      ['this-month', 'This month'],
                      ['last-month', 'Last month'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => choosePreset(value)}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                        preset === value
                          ? 'border-transparent text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}
                      style={preset === value ? { backgroundColor: INK } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      preset === 'custom' ? 'border-gray-300 bg-gray-100 text-gray-800' : 'border-transparent text-gray-400'
                    )}
                  >
                    Custom
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <Input
                  aria-label="Start date"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 min-w-0"
                />
                <span className="text-gray-400">→</span>
                <Input
                  aria-label="End date"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10 min-w-0"
                  aria-invalid={!!formError}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>Filters on the first-delivery-complete date; both days are included.</span>
            {formError && <span className="font-medium text-red-600">{formError}</span>}
            {!hasPricesFor(viewType) && (
              <span className="font-medium text-amber-700">
                {VIEW_TYPE_LABELS[viewType]} prices haven’t been set yet. Orders will be listed as skipped.
              </span>
            )}
          </div>
        </Card>

        {/* Body */}
        {!supplier ? (
          <EmptyState
            icon={<Truck className="h-6 w-6" style={{ color: INK }} />}
            title="Choose a supplier to start"
            text="The invoice appears here as soon as a supplier is picked, and updates whenever you change the filters."
          />
        ) : error ? (
          <Card className="flex flex-row items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">The invoice couldn’t be built</p>
              <p className="mt-0.5">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </Card>
        ) : !invoice ? (
          formError ? null : <PreviewSkeleton />
        ) : (
          <div className={cn('space-y-6 transition-opacity', loading && 'pointer-events-none opacity-60')}>
            <InvoiceBody invoice={invoice} />
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function InvoiceBody({ invoice }: { invoice: InvoiceDocument }) {
  const { calculation, request } = invoice
  const assumed = calculation.lines.filter((l) => l.order.categoryAssumed)
  const toReview = calculation.skipped.length + assumed.length

  if (calculation.lines.length === 0 && calculation.skipped.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" style={{ color: INK }} />}
        title="Nothing to bill"
        text={`No ${invoice.viewTypeLabel.toLowerCase()} orders for ${request.supplier} delivered between ${prettyDate(
          request.startDate
        )} and ${prettyDate(request.endDate)}.`}
      />
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Orders billed" value={calculation.orderCount.toLocaleString()} icon={Layers} tone="blue" />
        <StatTile label="Views" value={calculation.viewCount.toLocaleString()} icon={Eye} tone="indigo" />
        <StatTile label="Invoice total" value={formatEuro(calculation.total)} icon={Euro} tone="emerald" />
        <StatTile
          label="Needs review"
          value={toReview.toLocaleString()}
          icon={AlertTriangle}
          tone={toReview > 0 ? 'amber' : 'gray'}
        />
      </div>

      {toReview > 0 && <ReviewPanel invoice={invoice} assumed={assumed} />}

      {calculation.lines.length > 0 ? (
        <InvoicePaper invoice={invoice} />
      ) : (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6 text-amber-600" />}
          title="Every order was skipped"
          text="Fix the problems listed above and the orders will appear on the invoice."
        />
      )}
    </>
  )
}

const TONES = {
  blue: { text: 'text-blue-600', bg: 'bg-blue-100' },
  indigo: { text: 'text-indigo-600', bg: 'bg-indigo-100' },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-100' },
  amber: { text: 'text-amber-600', bg: 'bg-amber-100' },
  gray: { text: 'text-gray-400', bg: 'bg-gray-100' },
} as const

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: typeof Layers
  tone: keyof typeof TONES
}) {
  return (
    <Card className="flex-row items-center justify-between gap-3 border border-gray-200 bg-white p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        <p className={cn('mt-1 truncate text-2xl font-bold sm:text-3xl', TONES[tone].text)}>{value}</p>
      </div>
      <div className={cn('hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:flex', TONES[tone].bg)}>
        <Icon className={cn('h-6 w-6', TONES[tone].text)} />
      </div>
    </Card>
  )
}

function ReviewPanel({ invoice, assumed }: { invoice: InvoiceDocument; assumed: Line[] }) {
  const { skipped } = invoice.calculation
  const what = invoice.request.viewType === 'exterior' ? 'building type' : 'room'
  return (
    <Card className="gap-0 overflow-hidden border border-amber-200 bg-amber-50/60 p-0">
      <div className="grid divide-y divide-amber-200 md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            Left off the invoice ({skipped.length})
          </p>
          {skipped.length === 0 ? (
            <p className="mt-2 text-sm text-amber-800/80">Every matching order could be priced.</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {skipped.map((s) => (
                  <li key={s.order.id} className="flex gap-2">
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs leading-5 text-amber-700">{s.order.orderRef}</span>
                    <span>{s.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-800/80">They stay billable and appear again once fixed.</p>
            </>
          )}
        </div>
        <div className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <HelpCircle className="h-4 w-4" />
            Category assumed ({assumed.length})
          </p>
          {assumed.length === 0 ? (
            <p className="mt-2 text-sm text-amber-800/80">Every billed order named its {what}.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-amber-900">
                Nothing on these orders names the {what}, so they’re priced with a default. Check them before sending.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {assumed.map((l) => (
                  <span
                    key={l.order.id}
                    className="rounded border border-amber-300 bg-white px-1.5 py-0.5 font-mono text-xs text-amber-900"
                    title={`${l.categoryLabel} — ${SOURCE_HINTS[l.order.categorySource ?? 'default']}`}
                  >
                    {l.order.orderRef}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

function InvoicePaper({ invoice }: { invoice: InvoiceDocument }) {
  const { calculation, request } = invoice

  const groups = useMemo(() => {
    const out: { projectId: string; projectName: string | null; lines: Line[]; total: number }[] = []
    for (const line of calculation.lines) {
      const last = out[out.length - 1]
      if (last && last.projectId === line.order.projectId) {
        last.lines.push(line)
        last.total += line.total
      } else {
        out.push({ projectId: line.order.projectId, projectName: line.order.projectName, lines: [line], total: line.total })
      }
    }
    return out
  }, [calculation.lines])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="rounded-sm border border-gray-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(1,46,100,0.06)]">
        <div className="h-1.5 rounded-t-sm" style={{ backgroundColor: INK }} />
        <div className="p-6 text-sm text-gray-900 sm:p-10">
          {/* Heading */}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-3xl font-bold tracking-[0.2em]" style={{ color: INK }}>
                INVOICE
              </div>
              <div className="mt-1 font-mono text-xs text-gray-500">{invoice.reference}</div>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm sm:text-right">
              <dt className="text-gray-500">Date</dt>
              <dd>{prettyDate(invoice.issuedOn)}</dd>
              <dt className="text-gray-500">Period</dt>
              <dd>
                {prettyDate(request.startDate)} – {prettyDate(request.endDate)}
              </dd>
              <dt className="text-gray-500">View type</dt>
              <dd>{invoice.viewTypeLabel}</dd>
            </dl>
          </div>

          {/* Parties */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PartyBlock label="From" party={invoice.from} />
            <PartyBlock label="Bill to" party={invoice.billTo} />
          </div>

          {/* Lines */}
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b-2 text-left text-xs uppercase tracking-wide" style={{ borderColor: INK, color: INK }}>
                  <th className="py-2 font-semibold">Description</th>
                  <th className="w-14 py-2 text-right font-semibold">Qty</th>
                  <th className="w-28 py-2 text-right font-semibold">Unit price</th>
                  <th className="w-28 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.projectId}>
                  <tr>
                    <td colSpan={4} className="pb-1 pt-6">
                      <div className="flex items-baseline justify-between gap-4 border-b border-gray-200 pb-1">
                        <span className="font-semibold" style={{ color: INK }}>
                          Project {group.projectId}
                          {group.projectName && <span className="font-normal text-gray-500"> · {group.projectName}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500">{formatEuro(group.total)}</span>
                      </div>
                    </td>
                  </tr>
                  {group.lines.map((line) => (
                    <OrderRows key={line.order.id} line={line} />
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          {/* Totals */}
          <div className="ml-auto mt-8 w-full space-y-1.5 sm:w-72">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatEuro(calculation.subtotal)}</span>
            </div>
            {calculation.vatRate > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>VAT {calculation.vatRate}%</span>
                <span className="tabular-nums">{formatEuro(calculation.vatAmount)}</span>
              </div>
            )}
            <div
              className="flex justify-between rounded-md px-3 py-2 text-base font-bold text-white"
              style={{ backgroundColor: INK }}
            >
              <span>Total</span>
              <span className="tabular-nums">{formatEuro(calculation.total)}</span>
            </div>
          </div>

          <p className="mt-10 border-t border-gray-100 pt-4 text-xs text-gray-500">{invoice.paymentTerms}</p>
        </div>
      </div>
    </div>
  )
}

function OrderRows({ line }: { line: Line }) {
  const { order } = line
  return (
    <>
      <tr>
        <td colSpan={4} className="pt-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">Order {order.orderRef}</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{line.categoryLabel}</span>
            {order.categoryAssumed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                    assumed
                  </span>
                </TooltipTrigger>
                <TooltipContent>{SOURCE_HINTS[order.categorySource ?? 'default']}</TooltipContent>
              </Tooltip>
            )}
            <span className="text-xs text-gray-500">
              delivered {prettyDate(order.deliveryDate)} · {order.quantity} view{order.quantity === 1 ? '' : 's'}
            </span>
          </div>
        </td>
      </tr>
      {line.charges.map((charge) => (
        <tr key={charge.chargeType} className="text-gray-700">
          <td className="py-0.5 pl-4">{charge.label}</td>
          <td className="text-right tabular-nums">{charge.quantity}</td>
          <td className="text-right tabular-nums">{formatEuro(charge.unitPrice)}</td>
          <td className="text-right tabular-nums">{formatEuro(charge.amount)}</td>
        </tr>
      ))}
      <tr>
        <td colSpan={3} className="py-1 pl-4 text-xs text-gray-400">
          Order total
        </td>
        <td className="py-1 text-right font-semibold tabular-nums">{formatEuro(line.total)}</td>
      </tr>
    </>
  )
}

function PartyBlock({ label, party }: { label: string; party: Party }) {
  const missing = party.addressLines.length === 0 && !party.taxId
  return (
    <div className="rounded-md bg-gray-50 p-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="font-semibold">{party.name}</div>
      {party.addressLines.map((line, i) => (
        <div key={i} className="text-gray-700">
          {line}
        </div>
      ))}
      {party.taxId && <div className="text-gray-700">Tax ID: {party.taxId}</div>}
      {party.email && <div className="text-gray-700">{party.email}</div>}
      {party.bankDetailsLines.length > 0 && (
        <div className="mt-2 border-t border-gray-200 pt-2 text-gray-700">
          {party.bankDetailsLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {missing && <div className="mt-1 text-xs italic text-gray-400">Address and tax details not configured</div>}
    </div>
  )
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">{icon}</div>
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="mt-1 max-w-md text-sm text-gray-500">{text}</p>
    </div>
  )
}

function PreviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mx-auto h-[520px] max-w-4xl rounded-sm" />
    </div>
  )
}
