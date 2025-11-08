import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../apiClient.js'
import CustomersList from './CustomersList.jsx'
import CustomerProfile from './CustomerProfile.jsx'
// Debug utilities were left on previously; turn them off to restore clean UI
const DEBUG_SCROLL = false;

export default function CustomersScreen({ onProfileOpenChange }) {
  const [showEditor, setShowEditor] = useState(false)
  const [mode, setMode] = useState('list') // 'list' | 'profile' | 'editor'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({
    // Split name into first/last for clearer entry; we will combine on save
    firstName: '',
    lastName: '',
    town: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  })
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(null)
  const [emailError, setEmailError] = useState(null)
  const [phoneError, setPhoneError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')
  // inline profile replaces previous overlay profile
  const [overflowInfo, setOverflowInfo] = useState(null)
  // When an edit saves successfully, bump this to refresh profile
  const [profileVersion, setProfileVersion] = useState(0)

  useEffect(() => {
    console.log('[CustomersScreen] attaching listener')
    const handler = () => {
      console.log('[CustomersScreen] event received: open-new-customer')
      setSelected(null)
  setForm({ firstName: '', lastName: '', town: '', phone:'', email:'', address:'', notes:'' })
      setEditMode(false)
      setMode('editor')
      setShowEditor(true)
    }
    window.addEventListener('open-new-customer', handler)
    return () => {
      console.log('[CustomersScreen] removing listener')
      window.removeEventListener('open-new-customer', handler)
    }
  }, [])

  // Notify shell whether profile is open to show Back button
  useEffect(() => {
    try { onProfileOpenChange?.(!!selected && !showEditor) } catch {}
  }, [selected, showEditor, onProfileOpenChange])

  // Listen for shell back action
  useEffect(() => {
    function onBack(){ setSelected(null); setShowEditor(false); setMode('list') }
    window.addEventListener('customers:back', onBack)
    return () => window.removeEventListener('customers:back', onBack)
  }, [])

  // Debug-only overflow detector disabled
  useEffect(() => { setOverflowInfo(null) }, [])

  async function handleSave() {
    if (saving) return
    const combinedName = [form.firstName, form.lastName].map(s => (s || '').trim()).filter(Boolean).join(' ')
    if (!combinedName.trim()) {
      setNameError('First and last name are required.')
      return
    }
    // validate email (basic) if present
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
      setEmailError('Invalid email address.')
      return
    }
    // validate phone if present (digits >= 10)
    if (form.phone) {
      const digits = String(form.phone).replace(/\D+/g, '')
      if (digits.length < 10) {
        setPhoneError('Phone must have at least 10 digits.')
        return
      }
    }
    setSaving(true)
    try {
      const idVal = typeof selected === 'object' ? selected?.id : selected
      // For new records, default status to Lead. For edits, keep existing status if available.
      const statusVal = editMode
        ? ((typeof selected === 'object' && selected && selected.status) ? selected.status : 'Lead')
        : 'Lead'
      const base = {
        name: combinedName,
        town: form.town,
        status: statusVal,
        phone: form.phone,
        email: form.email,
        address: form.address,
        notes: form.notes,
      }
      const payload = editMode && idVal ? { id: idVal, ...base } : base
      try { console.log('[CustomersScreen] saving payload', payload) } catch {}
      const resp = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (resp.ok) {
        window.dispatchEvent(new Event('customers:refresh'))
        if (editMode) {
          // Close editor and remain on profile view for same id
          const idValNow = typeof selected === 'object' ? selected?.id : selected
          try {
            window.dispatchEvent(new CustomEvent('customer:refresh', { detail: { id: idValNow } }))
          } catch {}
          setShowEditor(false)
          setEditMode(false)
          setMode('profile')
          setProfileVersion(v => v + 1)
        } else {
          // New record: close editor and show list
          setShowEditor(false)
          setMode('list')
          setSelected(null)
        }
        // optional: reset form for next time
        setForm({ firstName: '', lastName: '', town: '', phone:'', email:'', address:'', notes:'' })
      } else {
        const txt = await resp.text().catch(()=> '')
        console.error('Create customer failed', resp.status, txt)
      }
    } catch (err) {
      console.error('Create customer error', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      const resp = await apiFetch(`/api/customers/${id}`, { method: 'DELETE' })
      const ok = resp.ok
      if (!ok) {
        const txt = await resp.text().catch(() => '')
        alert(`Delete failed: ${resp.status} ${txt || ''}`)
        return
      }
      // refresh list and go back to list view
      window.dispatchEvent(new Event('customers:refresh'))
      setShowEditor(false)
      setEditMode(false)
      setSelected(null)
      setMode('list')
    } catch (e) {
      alert(`Delete failed: ${e?.message || e}`)
    }
  }

  return (
    <>
      {!selected && !showEditor && (
        <>
          <div className="px-3 pt-2 pb-2">
            <select
              aria-label="Status"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={statusFilter}
              onChange={(e)=>setStatusFilter(e.target.value)}
            >
              {["All","Lead","Prospect","Approved","Complete","Invoiced","Archived","Lost"].map(s=>
                <option key={s} value={s}>{s}</option>
              )}
            </select>
          </div>

          <CustomersList
            statusFilter={statusFilter}
          onOpen={(item) => {
            console.log('[CustomersScreen] open profile', item?.id)
            // Keep full object when available to allow prefill without refetch
            setSelected(item || null)
            setShowEditor(false)
          }}
          onNew={() => {
            console.log('[CustomersScreen] onNew -> dispatch open-new-customer')
            window.dispatchEvent(new Event('open-new-customer'))
          }}
          />
        </>
      )}

      {selected && !showEditor && (
        <CustomerProfile
          id={(typeof selected === 'object' ? selected?.id : selected)}
          onClose={() => setSelected(null)}
          onEdit={async () => {
            // Enter edit mode and prefill
            setEditMode(true)
            const sel = selected
            const idVal = typeof sel === 'object' ? sel?.id : sel
            // If we have the object with fields, hydrate directly; otherwise fetch
            if (sel && typeof sel === 'object' && (sel.name || sel.town || sel.status)) {
              const parts = String(sel.name || '').trim().split(/\s+/)
              const firstName = parts.shift() || ''
              const lastName = parts.join(' ')
              setForm({
                firstName,
                lastName,
                town: sel.town || '',
                phone: sel.phone || '',
                email: sel.email || '',
                address: sel.address || '',
                notes: sel.notes || '',
              })
              setShowEditor(true)
            } else if (idVal) {
              try {
                const resp = await apiFetch(`/api/customers/${idVal}`)
                if (resp.ok) {
                  const resJson = await resp.json()
                  const data = (resJson && typeof resJson === 'object' && 'item' in resJson) ? resJson.item : resJson
                  const parts = String(data?.name || '').trim().split(/\s+/)
                  const firstName = parts.shift() || ''
                  const lastName = parts.join(' ')
                  setForm({
                    firstName,
                    lastName,
                    town: data?.town || '',
                    phone: data?.phone || '',
                    email: data?.email || '',
                    address: data?.address || '',
                    notes: data?.notes || '',
                  })
                  // also cache object in selected for future
                  setSelected(data)
                } else {
                  console.warn('Failed to fetch customer for edit', resp.status)
                }
              } catch (e) {
                console.error('Fetch customer for edit error', e)
              } finally {
                setShowEditor(true)
              }
            } else {
              // No id? Fallback to new-mode editor
              setForm({ firstName: '', lastName: '', town: '', phone:'', email:'', address:'', notes:'' })
              setEditMode(false)
              setShowEditor(true)
            }
          }}
          onDelete={handleDelete}
          version={profileVersion}
          onStatusChanged={() => setProfileVersion(v => v + 1)}
        />
      )}

      {showEditor && (
        <>
          {/* Backdrop prevents layout inflation and horizontal overflow */}
          <div className="fixed inset-0 z-40 bg-black/40" onClick={()=>setShowEditor(false)} />
          {/* Fixed modal panel */}
          <div className="fixed inset-0 z-50 bg-white flex flex-col">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <strong>{editMode ? 'Edit Customer' : 'New Customer'}</strong>
              <button onClick={()=>setShowEditor(false)}>Close</button>
            </div>
            <div className="p-4 overflow-auto">
              {/* Form fields */}
              <div className="space-y-3">
                {/* First Name */}
                <div>
                  <div className="text-xs text-neutral-500 mb-1">First name</div>
                  <input
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="First name"
                    value={form.firstName}
                    onChange={(e)=>{
                      const v = e.target.value
                      setForm(prev => ({ ...prev, firstName: v }))
                      const combined = [v, form.lastName].map(s => (s||'').trim()).filter(Boolean).join(' ')
                      if (nameError && combined.trim()) setNameError(null)
                    }}
                  />
                </div>

                {/* Last Name */}
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Last name</div>
                  <input
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Last name"
                    value={form.lastName}
                    onChange={(e)=>{
                      const v = e.target.value
                      setForm(prev => ({ ...prev, lastName: v }))
                      const combined = [form.firstName, v].map(s => (s||'').trim()).filter(Boolean).join(' ')
                      if (nameError && combined.trim()) setNameError(null)
                    }}
                  />
                  {nameError && (<div className="text-red-600 text-sm">{nameError}</div>)}
                </div>

                {/* Town */}
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Town</div>
                  <input
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Town"
                    value={form.town}
                    onChange={(e)=>setForm(prev => ({ ...prev, town: e.target.value }))}
                  />
                </div>

                {/* Phone */}
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Phone</div>
                  <input
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(555) 123-4567"
                    value={form.phone}
                    onChange={(e)=>{
                      const v = e.target.value
                      setForm(prev => ({ ...prev, phone: v }))
                      if (v) {
                        const digits = v.replace(/\D+/g, '')
                        setPhoneError(digits.length < 10 ? 'Phone must have at least 10 digits.' : null)
                      } else {
                        setPhoneError(null)
                      }
                    }}
                  />
                  {phoneError && (<div className="text-red-600 text-sm">{phoneError}</div>)}
                </div>

                {/* Email */}
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Email</div>
                  <input
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="name@example.com"
                    value={form.email}
                    onChange={(e)=>{
                      const v = e.target.value
                      setForm(prev => ({ ...prev, email: v }))
                      if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) setEmailError('Invalid email address.')
                      else setEmailError(null)
                    }}
                  />
                  {emailError && (<div className="text-red-600 text-sm">{emailError}</div>)}
                </div>

                {/* Address */}
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Address</div>
                  <input
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="123 Main St"
                    value={form.address}
                    onChange={(e)=>setForm(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>

                {/* Notes */}
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Notes</div>
                  <textarea
                    rows={4}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Notes…"
                    value={form.notes}
                    onChange={(e)=>setForm(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <button
                  className={`w-full rounded-lg py-2 ${ (saving || ![form.firstName, form.lastName].map(s => (s||'').trim()).filter(Boolean).length || emailError || phoneError) ? 'bg-neutral-400 text-white' : 'bg-black text-white'}`}
                  onClick={handleSave}
                  disabled={saving || ![form.firstName, form.lastName].map(s => (s||'').trim()).filter(Boolean).length || !!emailError || !!phoneError}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {false && DEBUG_SCROLL && overflowInfo && null}
    </>
  )
}
