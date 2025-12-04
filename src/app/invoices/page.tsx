import Link from 'next/link'
import { headers } from 'next/headers'

// Ensure this page is always dynamic and not cached
export const dynamic = 'force-dynamic'
export const revalidate = 0

function absoluteUrl(path: string) {
  // Build absolute URL for server-side fetch
  const h = headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const proto = h.get('x-forwarded-proto') || 'http'
  const base = `${proto}://${host}`
  return new URL(path, base).toString()
}

async function fetchJSON(path: string) {
  const url = absoluteUrl(path)
  const res = await fetch(url, { cache: 'no-store' })
  return res.json()
}

// cards removed in favor of a spreadsheet table with a filter bar

export default async function InvoicesPage() {
  const data = await fetchJSON('/api/invoices')
  const items = (data?.items||[]) as any[]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Invoices</h1>
        {/* Client-side create invoice modal trigger */}
        <CreateInvoiceClientWrapper />
      </div>
  <InvoicesTableClient items={items} />
    </div>
  )
}

// Wrapper to defer client component usage
function CreateInvoiceClientWrapper() {
  // dynamic import avoided for simplicity; this file is server, wrapper rendered client via 'use client' component below
  return <ClientMount />
}

// Inline client component loader
// Using a small bridge to keep main page server-rendered while button/modal is client.
import nextDynamic from 'next/dynamic'
const ClientMount = nextDynamic(() => import('./CreateInvoiceModal'), { ssr: false })

// Inline lazy client table/filter to keep page server-rendered
const InvoicesTableClient = nextDynamic(() => import('./InvoicesTableClient'), { ssr: false })
