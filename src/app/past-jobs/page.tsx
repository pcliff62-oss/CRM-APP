import React from 'react'
export const dynamic = 'force-dynamic'

async function fetchPastJobs() {
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/past-jobs`, { cache: 'no-store' }).catch(()=>null as any)
  if (!r || !r.ok) return []
  const data = await r.json().catch(()=>({}))
  return data?.items || []
}

export default async function PastJobsPage() {
  const items = await fetchPastJobs()
  return (
    <div className="p-6 space-y-4">
      <div className="text-xl font-semibold">Past Jobs</div>
      <div className="bg-white border rounded-xl">
        <div className="px-4 py-3 text-sm text-neutral-600">{items.length} jobs</div>
        <div className="divide-y">
          {items.map((j:any) => (
            <div key={j.id} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{j.customerName || 'Job'}</div>
                  {j.address && <div className="text-xs text-neutral-600">{j.address}</div>}
                </div>
                <div className="text-xs text-neutral-500">{new Date(j.completedAt).toLocaleDateString()}</div>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-2 text-xs">
                <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                  <div className="text-neutral-500">Squares Used</div>
                  <div className="font-semibold">{j.usedSquares ?? j.squares ?? '—'}</div>
                </div>
                <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                  <div className="text-neutral-500">Rate</div>
                  <div className="font-semibold">{j.ratePerSquare ? `$${Number(j.ratePerSquare).toFixed(0)}/sq` : '—'}{j.rateTier ? ` (${j.rateTier})` : ''}</div>
                </div>
                <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                  <div className="text-neutral-500">Install Total</div>
                  <div className="font-semibold">{Number(j.installTotal ?? 0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</div>
                </div>
                <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                  <div className="text-neutral-500">Extras Total</div>
                  <div className="font-semibold">{Number(j.extrasTotal ?? 0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200">
                  <div className="text-emerald-700">Grand Total</div>
                  <div className="font-semibold">{Number(j.grandTotal ?? ((j.installTotal||0)+(j.extrasTotal||0))).toLocaleString('en-US',{style:'currency',currency:'USD'})}</div>
                </div>
              </div>
              {Array.isArray(j.extras) && j.extras.length>0 && (
                <div className="mt-2">
                  <div className="text-xs text-neutral-500 mb-1">Extras</div>
                  <ul className="text-xs text-neutral-700 flex flex-wrap gap-2">
                    {j.extras.map((x:any) => (
                      <li key={x.title+String(x.price)} className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200">{x.title} {Number(x.price)? `(${Number(x.price).toLocaleString('en-US',{style:'currency',currency:'USD'})})` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
