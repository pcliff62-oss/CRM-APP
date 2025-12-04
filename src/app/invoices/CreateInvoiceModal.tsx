"use client";
import React, { useState, useEffect, useCallback } from 'react';

export default function CreateInvoiceModal({ onCreated }: { onCreated?: (inv: any) => void }) {
  type Customer = { id: string; name: string; email: string; phone?: string; address?: string };
  type LineItem = { title: string; qty: number; rate: number; qtyStr?: string; rateStr?: string; description?: string; amount?: number; manualAmount?: boolean };
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [chosen, setChosen] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [dueTerm, setDueTerm] = useState<string>('Due on receipt');
  // Removed contractPrice & deposit inputs per request; keep internal depositAmount=0
  const [contractPrice] = useState<number>(0);
  const [depositAmount] = useState<number>(0);
  const [sendImmediately, setSendImmediately] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ title: '', qty: 0, rate: 0, qtyStr: '', rateStr: '', amount: 0, manualAmount: false }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      if (!q) { setCustomers([]); return; }
      setLoadingCustomers(true);
      fetch(`/api/customers?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => setCustomers(data.items || []))
        .catch(()=>{})
        .finally(()=> setLoadingCustomers(false));
    }, 300);
    return () => { clearTimeout(handle); controller.abort(); };
  }, [q, open]);

  const chooseCustomer = (c: Customer) => {
    setChosen(c); setQ(c.name);
    setName(c.name || '');
    setEmail(c.email || '');
    setPhone(c.phone || '');
    setAddress(c.address || '');
  };

  const addLine = useCallback(() => setLineItems(ls => [...ls, { title: '', qty: 0, rate: 0, qtyStr: '', rateStr: '', amount: 0, manualAmount: false }]), []);
  const updateLine = useCallback((idx: number, patch: Partial<LineItem>) => {
    setLineItems(ls => ls.map((l,i) => i===idx ? { ...l, ...patch } : l));
  }, []);
  const removeLine = useCallback((idx: number) => setLineItems(ls => ls.filter((_,i)=>i!==idx)), []);

  const computeAmount = (li: LineItem) => li.manualAmount ? (li.amount || 0) : ((li.qty || 0) * (li.rate || 0));
  const extrasTotal = lineItems.reduce((sum, li) => sum + computeAmount(li), 0);
  // With contract price & deposit inputs removed, preview total due uses line items only.
  const totalDue = extrasTotal;

  const reset = () => {
  setQ(''); setCustomers([]); setChosen(null); setName(''); setEmail(''); setPhone(''); setAddress(''); setLineItems([{ title: '', qty:0, rate:0, qtyStr:'', rateStr:'', amount:0, manualAmount:false }]); setSendImmediately(false); setError(''); setInvoiceDate(new Date().toISOString().slice(0,10)); setDueTerm('Due on receipt');
  };

  const createInvoice = async () => {
    setSaving(true); setError('');
    try {
      if (!chosen) throw new Error('Select a customer');
      const leadRes = await fetch(`/api/leads?contactId=${encodeURIComponent(chosen.id)}`);
      let leadId: string | null = null;
      if (leadRes.ok) { const jr = await leadRes.json(); leadId = jr.items?.[0]?.id || null; }
      if (!leadId) throw new Error('No lead found for contact');
      const invoiceRes = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, depositAmount }) });
      const invJson = await invoiceRes.json();
      if (!invoiceRes.ok || !invJson?.ok) throw new Error(invJson.error || 'Failed to create');
      const invoice = invJson.item;
      if (lineItems.some(li => li.title && (li.rate || li.qty)) || dueTerm) {
        const form = new FormData();
        lineItems.forEach((li, idx) => {
          if (!li.title) return;
          form.append(`item_${idx}_title`, li.title);
          form.append(`item_${idx}_qty`, String(li.qty||0));
          form.append(`item_${idx}_rate`, String(li.rate||0));
          if (li.description) form.append(`item_${idx}_description`, li.description);
        });
        form.append('depositAmount', String(depositAmount||0));
        const termDays = dueTerm === 'Due on receipt' ? 0 : dueTerm === 'Net 15' ? 15 : dueTerm === 'Net 30' ? 30 : dueTerm === 'Net 60' ? 60 : 0;
        const mappedDue = new Date(Date.now() + termDays*86400000).toISOString();
        form.append('dueDate', mappedDue);
        await fetch(`/api/invoices/${invoice.id}`, { method: 'PATCH', body: form });
      }
      if (sendImmediately) await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST' });
      onCreated?.(invoice); setOpen(false); reset();
    } catch(e:any) { setError(String(e.message||e)); } finally { setSaving(false); }
  };

  return (
    <div>
      <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={() => { reset(); setOpen(true); }}>Create Invoice</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 overflow-auto">
          <div className="bg-white w-full max-w-4xl rounded shadow p-6" style={{ fontFamily: 'Helvetica Neue LT W1G, Arial, sans-serif', ['--primary-theme-color' as any]: '#0077c5' }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--primary-theme-color)' }}>Invoice</h1>
                <p className="text-xs text-gray-500">Balance due (hidden): <span>${totalDue.toFixed(2)}</span></p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-black">✕</button>
            </div>
            {/* Customer Quickfill */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Customer Lookup</label>
              <input value={q} onChange={e=>{ setQ(e.target.value); setChosen(null); }} placeholder="Start typing customer name or email" className="border border-gray-300 bg-white/70 px-2 py-1 w-full rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition" />
              {q && !chosen && (
                <div className="border rounded mt-2 max-h-48 overflow-auto bg-white">
                  {loadingCustomers && <div className="p-2 text-sm text-gray-500">Searching...</div>}
                  {!loadingCustomers && customers.map(c => (
                    <div key={c.id} className="px-2 py-1 text-sm cursor-pointer hover:bg-blue-50" onClick={()=> chooseCustomer(c)}>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-gray-600">{c.email}</div>
                    </div>
                  ))}
                  {!loadingCustomers && customers.length === 0 && <div className="p-2 text-xs text-gray-400">No matches</div>}
                </div>
              )}
              {chosen && <div className="mt-1 text-xs text-green-700">Selected: {chosen.name}</div>}
            </div>
            {/* Customer fields */}
            <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium mb-1">Name</label>
                <input value={name} onChange={e=> setName(e.target.value)} className="border border-gray-300 bg-white px-2 py-1 w-full rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <input value={email} onChange={e=> setEmail(e.target.value)} className="border border-gray-300 bg-white px-2 py-1 w-full rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone</label>
                <input value={phone} onChange={e=> setPhone(e.target.value)} className="border border-gray-300 bg-white px-2 py-1 w-full rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <input value={address} onChange={e=> setAddress(e.target.value)} className="border border-gray-300 bg-white px-2 py-1 w-full rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition" />
              </div>
            </div>
            {/* Dates & financials */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium mb-1">Invoice Date</label>
                <input type="date" value={invoiceDate} onChange={e=> setInvoiceDate(e.target.value)} className="border border-gray-300 bg-white px-2 py-1 w-full rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Payment Terms</label>
                <select value={dueTerm} onChange={e=> setDueTerm(e.target.value)} className="border border-gray-300 bg-white px-2 py-1 w-full rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition">
                  <option>Due on receipt</option>
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 60</option>
                </select>
              </div>
              {/* Contract Price & Deposit inputs removed */}
            </div>
            {/* Line items table mimic */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium">Product or service</p>
                <button type="button" onClick={addLine} className="text-sm text-blue-600">Add line</button>
              </div>
              <div className="border rounded divide-y">
                <div className="grid grid-cols-12 text-xs font-semibold bg-gray-50">
                  <div className="col-span-4 p-2">Product/Service</div>
                  <div className="col-span-3 p-2">Description</div>
                  <div className="col-span-1 p-2 text-right">Qty</div>
                  <div className="col-span-2 p-2 text-right">Rate</div>
                  <div className="col-span-1 p-2 text-right">Amt</div>
                  <div className="col-span-1 p-2" />
                </div>
                {lineItems.map((li, idx) => {
                  const amt = computeAmount(li);
                  return (
                    <div key={idx} className="grid grid-cols-12 text-xs items-start">
                      <input className="col-span-4 p-1 outline-none focus:bg-blue-50 border-b" placeholder="Title" value={li.title} onChange={e=> updateLine(idx,{ title: e.target.value })} />
                      <input className="col-span-3 p-1 outline-none focus:bg-blue-50 border-b" placeholder="Description" value={li.description||''} onChange={e=> updateLine(idx,{ description: e.target.value })} />
                      <div className="col-span-1 p-1 flex justify-end border-b">
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-full text-right px-2 py-1 rounded-full border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500"
                          value={li.qty === 0 ? (li.qtyStr ?? '') : (li.qtyStr || String(li.qty))}
                          placeholder="0"
                          onFocus={e=> { if (li.qty === 0 && (!li.qtyStr || li.qtyStr==='0')) updateLine(idx,{ qtyStr: '' }); }}
                          onChange={e=> { const raw=e.target.value.replace(/[^0-9]/g,''); const num = raw ? parseInt(raw,10) : 0; updateLine(idx,{ qty: num, qtyStr: raw, manualAmount:false }); }}
                        />
                      </div>
                      <div className="col-span-2 p-1 flex justify-end border-b">
                        <input
                          inputMode="decimal"
                          pattern="[0-9.]*"
                          className="w-full text-right px-2 py-1 rounded-full border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500"
                          value={li.rate === 0 ? (li.rateStr ?? '') : (li.rateStr || String(li.rate))}
                          placeholder="0"
                          onFocus={e=> { if (li.rate === 0 && (!li.rateStr || li.rateStr==='0')) updateLine(idx,{ rateStr: '' }); }}
                          onChange={e=> { const raw=e.target.value.replace(/[^0-9.]/g,''); const num = raw ? parseFloat(raw) : 0; updateLine(idx,{ rate: num, rateStr: raw, manualAmount:false }); }}
                        />
                      </div>
                      <div className="col-span-1 p-1 flex justify-end items-center border-b">
                        <input inputMode="decimal" pattern="[-0-9.]*" className="text-right px-3 py-1 rounded-full bg-gray-100 border border-gray-300 w-full focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500" value={li.manualAmount ? (li.amount ?? 0) : amt} onChange={e=> { const raw=e.target.value.replace(/[^0-9.-]/g,''); const val= raw? parseFloat(raw):0; updateLine(idx,{ amount: val, manualAmount:true }); }} />
                      </div>
                      <button type="button" className="col-span-1 p-1 text-red-600" onClick={()=> removeLine(idx)}>✕</button>
                    </div>
                  );
                })}
              </div>
              {lineItems.length > 0 && <button type="button" onClick={()=> setLineItems([])} className="mt-2 text-xs text-gray-500 underline">Clear all lines</button>}
            </div>
            {/* Totals */}
            <div className="mb-4 text-sm flex flex-col gap-1 bg-gray-50 p-3 rounded">
              <div className="flex justify-between"><span>Subtotal (lines)</span><span>${extrasTotal.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total Due</span><span>${totalDue.toFixed(2)}</span></div>
              <div className="flex items-center gap-2 mt-2">
                <input id="sendNow" type="checkbox" checked={sendImmediately} onChange={e=> setSendImmediately(e.target.checked)} />
                <label htmlFor="sendNow" className="text-xs">Send immediately after creation</label>
              </div>
            </div>
            {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
            <div className="flex justify-end gap-3">
              <button onClick={()=> setOpen(false)} className="px-3 py-2 border rounded">Cancel</button>
              <button disabled={saving} onClick={createInvoice} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">{saving? 'Saving...' : sendImmediately ? 'Create & Send' : 'Create Invoice'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
