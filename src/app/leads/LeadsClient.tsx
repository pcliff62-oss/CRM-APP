"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import StageSelector from '@/components/StageSelector';
import { Button } from '@/components/ui/button';

const PropertyMap = dynamic(() => import('@/components/PropertyMapGoogle'), { ssr: false });

interface Lead {
  id: string;
  title: string;
  stage: string;
  contractPrice?: number | null;
  contact?: { id: string; name: string | null; email?: string | null; phone?: string | null } | null;
  property?: { id: string; address1: string | null; city?: string | null; state?: string | null; postal?: string | null; lat?: number | null; lng?: number | null } | null;
  contactId?: string;
}

export default function LeadsClient({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  // advance-only flow; no pending save state

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const btn = target.closest('[data-lead-id]') as HTMLElement | null;
      if (btn) {
        const id = btn.getAttribute('data-lead-id');
        const lead = leads.find(l => l.id === id);
        if (lead) {
          setSelected(lead);
          setOpen(true);
        }
      }
    }
    function onStageChanged(ev: any) {
      if (!ev?.detail?.leadId) return;
      if (selected?.id === ev.detail.leadId) {
        setSelected(prev => prev ? { ...prev, stage: ev.detail.stage } : prev);
      }
    }
    document.addEventListener('click', onClick);
    window.addEventListener('lead-stage-changed', onStageChanged as any);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('lead-stage-changed', onStageChanged as any);
    };
  }, [leads, selected]);

  if (!open || !selected) return null;
  const address = selected.property ? [selected.property.address1, selected.property.city, selected.property.state, selected.property.postal].filter(Boolean).join(', ') : '';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-white shadow-xl overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="space-y-1">
            <div className="text-lg font-semibold">{selected.contact?.name || 'Lead'}</div>
            {selected.contact?.email && <div className="text-xs text-slate-600"><a href={`mailto:${selected.contact.email}`} className="text-blue-600 hover:underline">{selected.contact.email}</a></div>}
            {selected.contact?.phone && <div className="text-xs text-slate-600"><a href={`tel:${selected.contact.phone}`} className="text-blue-600 hover:underline">{selected.contact.phone}</a></div>}
          </div>
          <button className="text-slate-500 hover:text-slate-800 text-sm" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="mb-4 space-y-3">
          <StageSelector
            contactId={selected.contactId || selected.contact?.id || ''}
            value={selected.stage as any}
            readOnly
          />
          {selected.stage !== 'ARCHIVE' && (
            <button
              type="button"
              onClick={async () => {
                const order = ['LEAD','PROSPECT','APPROVED','COMPLETED','INVOICED'];
                let next = 'ARCHIVE';
                const idx = order.indexOf(selected.stage);
                if (idx > -1 && idx < order.length - 1) next = order[idx+1];
                const contactId = selected.contactId || selected.contact?.id;
                let updatedStage = next;
                try {
                  const res = await fetch('/api/lead-stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: selected.id, stage: next }) });
                  if (res.ok) {
                    const data = await res.json().catch(()=>({}));
                    updatedStage = data.stage || next;
                    window.dispatchEvent(new CustomEvent('lead-stage-changed', { detail: { leadId: selected.id, contactId: data.contactId || contactId, stage: updatedStage } }));
                  }
                } catch {}
                // update local selected state immediately
                setSelected(prev => prev ? { ...prev, stage: updatedStage } : prev);
                // move DOM node live
                const node = document.querySelector(`[data-lead-id="${selected.id}"]`);
                if (node) {
                  node.setAttribute('data-stage', updatedStage);
                  const targetCol = document.querySelector(`[data-stage-container="${updatedStage}"]`);
                  if (targetCol) targetCol.appendChild(node as HTMLElement);
                }
              }}
              className="inline-flex items-center justify-center w-full h-11 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow"
            >Advance Stage</button>
          )}
        </div>
        {(() => {
          const cid = selected.contactId || selected.contact?.id;
          if (!cid) return null;
          return (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => { setOpen(false); router.push(`/customers/${cid}`); }}
                className="inline-flex items-center justify-center w-full h-11 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition shadow"
              >
                Go to Contact
              </button>
            </div>
          );
        })()}
        {selected.contractPrice ? (
          <div className="text-sm mb-2">Contract: <span className="font-medium">${selected.contractPrice.toLocaleString()}</span></div>
        ) : null}
        {address && (
          <div className="space-y-2 mb-4">
            <div className="text-xs text-slate-600">{address}</div>
            <PropertyMap
              key={`${selected.property?.id}-${address}`}
              address={`${address}, USA`}
              lat={selected.property?.lat ?? null}
              lng={selected.property?.lng ?? null}
              propertyId={selected.property?.id}
            />
            <Button type="button" className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
              window.open(url,'_blank');
            }}>Navigate</Button>
          </div>
        )}
        <div className="pt-4 border-t mt-6">
          <div className="text-xs text-slate-500">Lead ID: {selected.id}</div>
          <div className="text-xs text-slate-500">Stage: {selected.stage}</div>
        </div>
      </div>
    </div>
  );
}
