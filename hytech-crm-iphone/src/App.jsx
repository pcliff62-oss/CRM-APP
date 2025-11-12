import React, { useEffect, useState, useMemo } from 'react'
import MobileShell from './ui/MobileShell.jsx'
import Today from './features/dashboard/Today.jsx'
import CalendarScreen from './features/calendar/CalendarScreen.jsx'
import AppointmentEditor from './features/calendar/AppointmentEditor.jsx'
import CustomersScreen from './features/customers/CustomersScreen.jsx'
import JobsList from './features/jobs/JobsList.jsx'
import CrewJobDetail from './features/jobs/CrewJobDetail.jsx'
import LeadsList from './features/leads/LeadsList.jsx'
import DocumentsGrid from './features/files/DocumentsGrid.jsx'
import PhotosGrid from './features/files/PhotosGrid.jsx'
import FileViewer from './features/files/FileViewer.jsx'
import MeasureEditor from './features/measure/MeasureEditor.jsx'
import { createMeasurementFromAddress, fetchUsers, setUserEmail } from './lib/api.js'
import CustomerDetail from './features/customers/CustomerDetail.jsx'
import { fetchAppointments, fetchCustomers, upsertAppointment, deleteAppointment, upsertCustomer, fetchCustomer, deleteCustomer, fetchLeads } from './lib/api.js'

function LeadsScreen({ items = [] }) {
  return (
    <div className="space-y-2">
      <div className="font-medium mb-2">My Leads</div>
      {items.length === 0 && <div className="text-sm text-neutral-600">No leads assigned.</div>}
      <ul className="bg-white rounded-2xl border border-neutral-200 divide-y">
        {items.map(l => (
          <li key={l.id} className="px-4 py-3 text-sm">
            <div className="font-medium">{l.name}</div>
            <div className="text-neutral-600">{l.address || '—'}</div>
            <div className="text-neutral-500 text-xs">{l.status}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function App() {
  const DEFAULT_EMAIL = (import.meta.env.VITE_USER_EMAIL ?? 'demo@hytech.local').trim()
  const ROLE_OPTIONS = ['ADMIN','SALES','CREW','EMPLOYEE']
  const [tab, setTab] = useState('dashboard')
  const [role, setRole] = useState('ADMIN') // derived from selected user
  const [user, setUser] = useState({ id: DEFAULT_EMAIL, name: DEFAULT_EMAIL.split('@')[0] || 'User', role: 'ADMIN' })
  const [users, setUsers] = useState([])
  const [appts, setAppts] = useState([])
  const [customers, setCustomers] = useState([])
  const [leads, setLeads] = useState([])          // my leads (assigned)
  const [allLeads, setAllLeads] = useState([])    // pipeline leads (all)
  const [view, setView] = useState({ id: 'home' }) // 'home' | 'appt-edit' | 'customer-detail' | 'jobs-list' | 'leads-list' | 'documents' | 'photos' | 'file-viewer' | 'measure-editor'
  const [draft, setDraft] = useState(null)
  const [fileCtx, setFileCtx] = useState({ list: [], file: null })
  const [measureCtx, setMeasureCtx] = useState({ id: null, imageSrc: '', features: [], gsdMPerPx: null })
  const [crewSelectedDay, setCrewSelectedDay] = useState('')
  const [pastJobs, setPastJobs] = useState([])
  const [showPastJobs, setShowPastJobs] = useState(false)
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [newLead, setNewLead] = useState({ name:'', email:'', phone:'', address:'', notes:'', date: '', time: '', category:'', customScope:'', userId:'' })

  // load CRM users list
  useEffect(() => {
    let active = true
    fetchUsers().then(list => { if (active) setUsers(list) }).catch(()=>{})
    return () => { active = false }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        // Use email (user.id holds email currently) for assigned filter; this matches Next API assignedTo email convention
        const assignedEmail = user.id
        // Resolve a stable user UUID for crewId param if available
        const picked = users.find(u => u.email === assignedEmail || u.id === assignedEmail)
        const crewId = picked?.id || null
        const [a, c, l] = await Promise.all([
          // For crew users use server-side filters to reduce payload
          role === 'CREW' ? fetchAppointments({ crewId: crewId || assignedEmail, jobOnly: 1 }) : fetchAppointments({ assignedTo: assignedEmail }),
          fetchCustomers({ assignedTo: assignedEmail }),
          fetchLeads({ assignedTo: assignedEmail }),
        ])
        // CREW already filtered server-side
        setAppts(a)
        setCustomers(c)
        setLeads(l)
        if (role === 'CREW') {
          try {
            const r = await fetch(`/api/past-jobs?assignedTo=${encodeURIComponent(assignedEmail)}`)
            const data = await r.json().catch(()=>({}))
            if (Array.isArray(data?.items)) {
              const sorted = data.items.slice().sort((a,b)=> new Date(b.completedAt) - new Date(a.completedAt))
              setPastJobs(sorted)
            }
          } catch {}
        }
      } catch (e) { console.error('load failed', e) }
    }
    load()
  }, [user.id, role, users])
  const goHome = () => { setView({ id:'home' }); setDraft(null) }

  const onPlus = () => {
    if (tab === 'calendar') {
      setDraft({ assignedTo: user.id })
      setView({ id:'appt-edit' })
    } else if (tab === 'customers') {
      setDraft({ assignedTo: user.id })
      setView({ id:'customer-detail' })
    }
  }

  const onSelectAppt = (a) => { setDraft(a); setView({ id:'appt-edit' }) }
  const onSelectCustomer = async (c) => {
    try {
      const full = c?.id ? await fetchCustomer(c.id) : c
      setDraft(full || c)
    } catch (e) {
      console.error('load customer failed', e)
      setDraft(c)
    }
    setView({ id:'customer-detail' })
  }
  const onSelectLead = async (l) => {
    if (!l) return
    try {
      const full = l.contactId ? await fetchCustomer(l.contactId) : (l.id ? await fetchCustomer(l.id) : l)
      setDraft(full || l)
    } catch (e) {
      console.error('load lead->customer failed', e)
      setDraft(l)
    }
    setView({ id:'customer-detail' })
  }
  const onSelectJob = async (j) => {
    if (!j) return
    // For crew, open CrewJobDetail instead of full customer view
    if (role === 'CREW') {
      setDraft(j)
      setView({ id: 'crew-job' })
      return
    }
    try {
      const targetId = j.contactId || j.customerId
      const full = targetId ? await fetchCustomer(targetId) : null
      setDraft(full || j)
    } catch (e) {
      console.error('load job->customer failed', e)
      setDraft(j)
    }
    setView({ id:'customer-detail' })
  }

  // When tapping an appointment in the calendar, open the related customer/contact
  const onOpenApptCustomer = async (a) => {
    if (!a) return
    try {
      const targetId = a.contactId || a.customerId
      const full = targetId ? await fetchCustomer(targetId) : null
      setDraft(full || a)
    } catch (e) {
      console.error('load appt->customer failed', e)
      setDraft(a)
    }
    setView({ id:'customer-detail' })
  }

  const saveAppt = async (a) => {
    const saved = await upsertAppointment({ ...a, assignedTo: a.assignedTo || user.id })
    setAppts(prev => {
      const idx = prev.findIndex(x=>x.id===saved.id)
      if (idx>=0) { const next = prev.slice(); next[idx]=saved; return next }
      return [saved, ...prev]
    })
    goHome()
  }
  const removeAppt = async (id) => {
    await deleteAppointment(id)
    setAppts(prev => prev.filter(x=>x.id!==id))
    goHome()
  }

  const saveCustomer = async (c) => {
    const saved = await upsertCustomer({ ...c, assignedTo: c.assignedTo || user.id })
    setCustomers(prev => {
      const idx = prev.findIndex(x => x.id === saved.id)
      if (idx >= 0) { const next = prev.slice(); next[idx] = saved; return next }
      return [saved, ...prev]
    })
    goHome()
  }

  const removeCustomer = async (id) => {
    await deleteCustomer(id)
    setCustomers(prev => prev.filter(x => x.id !== id))
    goHome()
  }
  // Keep role in sync with selected user from API
  useEffect(() => {
    const found = users.find(u => (u.email || u.id) === user.id)
    if (found?.role && found.role !== role) setRole(found.role)
  }, [users, user.id])

  useEffect(()=>{ if (newLeadOpen && !newLead.date) { const d=new Date(); setNewLead(l=>({ ...l, date: d.toISOString().slice(0,10), time: nextHalfHour() })) } }, [newLeadOpen])
  const halfHours = useMemo(()=> halfHourIncrements('07:00','17:00'), [])
  async function submitNewLead() {
    try {
      const startIso = new Date(`${newLead.date}T${newLead.time}:00`).toISOString();
      const endIso = new Date(new Date(`${newLead.date}T${newLead.time}:00`).getTime()+60*60*1000).toISOString();
      const payload = { name: newLead.name, email: newLead.email||null, phone: newLead.phone||null, address: newLead.address, notes: newLead.notes||null, category: newLead.category||null, customScope: newLead.category==='Other'? (newLead.customScope||null): null, userId: newLead.userId || null, start: startIso, end: endIso }
      const res = await fetch('/api/new-lead', { method:'POST', body: JSON.stringify(payload) })
      if (res.ok) { setNewLeadOpen(false); alert('Lead created.'); window.location.reload() }
    } catch (e) { alert(String(e)) }
  }

  return (
    <MobileShell
      title="HyTech CRM"
      tab={tab}
      onTabChange={setTab}
      onPlus={onPlus}
      showPlus={tab==='calendar' || tab==='customers'}
    >
      <div className="p-4 space-y-5">
        {/* New Lead button (ADMIN/SALES only) */}
        {view.id==='home' && (role==='ADMIN' || role==='SALES') && (
          <div className="flex justify-end">
            <button onClick={()=> setNewLeadOpen(true)} className="h-9 px-4 rounded-md bg-emerald-600 text-white text-sm font-medium shadow hover:bg-emerald-700">New Lead</button>
          </div>
        )}
        {/* Modal */}
        {newLeadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={()=> setNewLeadOpen(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-xl p-5 space-y-4">
              <div className="text-lg font-semibold">New Lead</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <label className="text-xs text-neutral-600">Full name</label>
                  <input className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.name} onChange={e=> setNewLead(l=>({ ...l, name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-neutral-600">Address</label>
                  <input className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.address} onChange={e=> setNewLead(l=>({ ...l, address: e.target.value }))} placeholder="123 Main St, City ST" />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Phone</label>
                  <input className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.phone} maxLength={14} onChange={e=> setNewLead(l=>({ ...l, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Email</label>
                  <input className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.email} onChange={e=> setNewLead(l=>({ ...l, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Category</label>
                  <select className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.category} onChange={e=> setNewLead(l=>({ ...l, category: e.target.value }))}>
                    <option value="">Select…</option>
                    <option>roof replacement</option>
                    <option>Siding replacement</option>
                    <option>Repair</option>
                    <option>Other</option>
                  </select>
                </div>
                {newLead.category==='Other' && (
                  <div>
                    <label className="text-xs text-neutral-600">Specify scope</label>
                    <input className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.customScope} onChange={e=> setNewLead(l=>({ ...l, customScope: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label className="text-xs text-neutral-600">Date</label>
                  <input type="date" className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.date} onChange={e=> setNewLead(l=>({ ...l, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Time</label>
                  <select className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.time} onChange={e=> setNewLead(l=>({ ...l, time: e.target.value }))}>
                    {halfHours.map(t=> <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-neutral-600">Notes</label>
                  <input className="mt-1 h-9 px-2 rounded border border-neutral-300 w-full" value={newLead.notes} onChange={e=> setNewLead(l=>({ ...l, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=> setNewLeadOpen(false)} className="h-9 px-4 rounded-md border border-neutral-300 bg-white text-neutral-700 text-sm">Cancel</button>
                <button onClick={submitNewLead} className="h-9 px-4 rounded-md bg-emerald-600 text-white text-sm font-medium">Create Lead</button>
              </div>
            </div>
          </div>
        )}
        {/* User selector */}
        <div className="flex items-center gap-2">
          <select
            value={user.id}
            onChange={e => {
              const val = e.target.value
              const found = users.find(u => (u.email || u.id) === val)
              const nextUser = found ? { id: found.email || found.id, name: found.name || found.email || found.id, role: found.role || 'ADMIN' } : { id: val, name: val.split('@')[0], role: 'ADMIN' }
              setUser(nextUser)
              setRole(nextUser.role || 'ADMIN')
              setUserEmail(nextUser.id).catch(()=>{})
            }}
            className="h-8 px-2 rounded border border-neutral-300 bg-white text-sm"
          >
            {[{ id: DEFAULT_EMAIL, name: DEFAULT_EMAIL.split('@')[0] || 'User', role: 'ADMIN' }, ...users].map(u => (
              <option key={u.email || u.id} value={u.email || u.id}>
                {(u.name || (u.email || u.id))} {u.role ? `(${u.role})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={()=>{ fetchUsers().then(setUsers).catch(()=>{}) }}
            className="h-8 px-2 rounded border border-neutral-300 bg-white"
          >Refresh</button>
          {role==='CREW' && (
            <span className="ml-2 px-2 py-1 rounded bg-amber-100 text-amber-700 border border-amber-200">Crew view: jobs assigned to you</span>
          )}
        </div>
        
  {view.id==='home' && (
          <>
            {tab === 'dashboard' && (
              <>
                {/* Top hero: centered logo + big category cards */}
                <div className="flex flex-col items-center gap-5 mb-5">
                  {/* Logo served from CRM app public/ to avoid duplicating assets */}
                  <img
                    src="http://127.0.0.1:3000/LOGO-2017-edit-GOOD.png"
                    alt="HyTech Roofing"
                    className="h-14 w-auto object-contain drop-shadow-md"
                  />

                  <div className={`grid ${role==='CREW' ? 'grid-cols-1' : 'grid-cols-2'} gap-4 w-full`}>
                    {/* Jobs card */}
                    <button
                      onClick={() => setView({ id:'jobs-list' })}
                      className={`group relative overflow-hidden shadow-2xl active:scale-[0.99] transition-transform ${role==='CREW' ? 'w-full max-w-[360px] mx-auto h-12 sm:h-14 rounded-full' : 'rounded-2xl aspect-[4/3]'}`}
                    >
                      {/* Blue gradient background (restored) */}
                      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1a2e] via-[#1773e6] to-[#60a5fa]" />
                      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white_0%,transparent_40%),radial-gradient(circle_at_70%_80%,white_0%,transparent_45%)]" />
                      <div className="absolute inset-0" style={{
                        background:
                          'linear-gradient(120deg, rgba(255,255,255,0.15), rgba(255,255,255,0) 60%)',
                        transform:
                          'perspective(600px) rotateX(8deg)'
                      }} />
                      {/* Live jobs count badge */}
                      {(() => { const count = (appts || []).filter(a => a?.job || a?.type === 'install').length; return (
                        <div className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-black/50 text-white border border-white/20 backdrop-blur-sm">
                          {count}
                        </div>
                      )})()}
                      <div className={`relative h-full w-full ${role==='CREW' ? 'flex items-center justify-center text-white px-4' : 'flex flex-col items-center justify-center text-white' }`}>
                        {/* 3D-styled house icon (inline SVG) - sized per role */}
                        <svg
                          viewBox="0 0 64 64"
                          aria-hidden="true"
                          className={`${role==='CREW' ? 'w-6 h-6' : 'w-16 h-16'} drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)]`}
                        >
                          <defs>
                            <linearGradient id="houseWall" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f3f4f6" />
                              <stop offset="100%" stopColor="#cbd5e1" />
                            </linearGradient>
                            {/* Red roof gradient */}
                            <linearGradient id="houseRoof" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#ef4444" />
                              <stop offset="100%" stopColor="#7f1d1d" />
                            </linearGradient>
                            <linearGradient id="houseDoor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#a16207" />
                              <stop offset="100%" stopColor="#8b5e34" />
                            </linearGradient>
                            <linearGradient id="houseWindow" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#e0f2fe" />
                              <stop offset="100%" stopColor="#93c5fd" />
                            </linearGradient>
                            <linearGradient id="roofHighlight" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
                              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                            </linearGradient>
                            {/* Base shadow under house for more 3D pop */}
                            <radialGradient id="baseShadow" cx="50%" cy="50%" r="50%">
                              <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
                              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                            </radialGradient>
                          </defs>
                          <g transform="translate(0,2)">
                            {/* Soft base shadow ellipse */}
                            <ellipse cx="32" cy="52" rx="18" ry="6" fill="url(#baseShadow)" />
                            {/* Roof */}
                            <polygon points="16,28 32,16 48,28" fill="url(#houseRoof)" stroke="rgba(0,0,0,0.15)" />
                            {/* Roof highlight */}
                            <path d="M16 28 L32 16 L48 28" fill="none" stroke="url(#roofHighlight)" strokeWidth="2" opacity="0.6" />
                            {/* Chimney */}
                            <rect x="42" y="18" width="4" height="8" fill="url(#houseRoof)" stroke="rgba(0,0,0,0.12)" />
                            {/* House body */}
                            <rect x="18" y="28" width="28" height="22" rx="2" fill="url(#houseWall)" stroke="rgba(0,0,0,0.15)" />
                            {/* Side shading for depth */}
                            <rect x="18" y="28" width="8" height="22" fill="rgba(0,0,0,0.06)" rx="2" />
                            {/* Door */}
                            <rect x="30" y="36" width="8" height="12" rx="1" fill="url(#houseDoor)" stroke="rgba(0,0,0,0.15)" />
                            <circle cx="36.5" cy="42" r="0.8" fill="#e5e7eb" />
                            {/* Window */}
                            <rect x="20" y="36" width="8" height="8" rx="1" fill="url(#houseWindow)" stroke="rgba(0,0,0,0.12)" />
                            <path d="M24 36 v8 M20 40 h8" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
                          </g>
                        </svg>
                        <div className={`${role==='CREW' ? 'ml-3' : 'mt-2'} font-semibold tracking-wide`}>Jobs</div>
                      </div>
                    </button>

                    {/* Leads card (hidden for CREW role) */}
                    {role !== 'CREW' && (
                      <button
                        onClick={async () => {
                          try {
                            const all = await fetchLeads()
                            setAllLeads(all)
                          } catch (e) { console.error('load pipeline leads failed', e) }
                          setView({ id:'leads-list' })
                        }}
                        className="group relative rounded-2xl aspect-[4/3] overflow-hidden shadow-2xl active:scale-[0.99] transition-transform"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1a2e] via-[#4c1d95] to-[#c084fc]" />
                        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_70%_20%,white_0%,transparent_45%),radial-gradient(circle_at_30%_80%,white_0%,transparent_40%)]" />
                        <div className="absolute inset-0" style={{
                          background:
                            'linear-gradient(120deg, rgba(255,255,255,0.15), rgba(255,255,255,0) 60%)',
                          transform:
                            'perspective(600px) rotateX(8deg)'
                        }} />
                        {(() => {
                          // Count only pipeline leads (stage == LEAD)
                          const source = (allLeads && allLeads.length) ? allLeads : (leads || []);
                          const count = source.filter(l => (l.status || '').toUpperCase() === 'LEAD').length;
                          return (
                            <div className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-black/50 text-white border border-white/20 backdrop-blur-sm">
                              {count}
                            </div>
                          );
                        })()}
                        <div className="relative h-full w-full flex flex-col items-center justify-center text-white">
                          <svg viewBox="0 0 64 64" aria-hidden="true" className="w-14 h-14 drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]">
                            <defs>
                              <linearGradient id="personSkin" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#fde68a" />
                                <stop offset="100%" stopColor="#f59e0b" />
                              </linearGradient>
                              <linearGradient id="personShirt" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#bfdbfe" />
                                <stop offset="100%" stopColor="#60a5fa" />
                              </linearGradient>
                              <linearGradient id="personShirtAlt" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#ddd6fe" />
                                <stop offset="100%" stopColor="#a78bfa" />
                              </linearGradient>
                            </defs>
                            <circle cx="32" cy="24" r="8" fill="url(#personSkin)" />
                            <rect x="24" y="32" width="16" height="12" rx="6" fill="url(#personShirt)" />
                            <g opacity="0.9">
                              <circle cx="20" cy="26" r="6" fill="url(#personSkin)" />
                              <rect x="14" y="32" width="12" height="10" rx="5" fill="url(#personShirtAlt)" />
                            </g>
                            <g opacity="0.9">
                              <circle cx="44" cy="26" r="6" fill="url(#personSkin)" />
                              <rect x="38" y="32" width="12" height="10" rx="5" fill="url(#personShirtAlt)" />
                            </g>
                          </svg>
                          <div className="mt-2 font-semibold tracking-wide">Leads</div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                {/* Dashboard content: for crew show a slim upcoming installs list; for others full Today panel */}
                {role!=='CREW' ? (
                  <Today
                    appts={appts}
                    customers={customers}
                    onOpenCalendar={() => setTab('calendar')}
                    onOpenCustomers={() => setTab('customers')}
                    onSelectCustomer={onSelectCustomer}
                  />
                ) : (
                  <div className="mt-6 space-y-4">
                    {/* Crew mini month calendar showing job days */}
                    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200">
                      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white rounded-t-2xl">
                        <div className="font-medium text-white">{new Date().toLocaleString([], { month: 'long', year: 'numeric' })}</div>
                        <button className="text-xs text-white hover:bg-white/20 rounded px-2 py-1" onClick={()=> setTab('calendar')}>Open Calendar</button>
                      </div>
                      {(() => {
                        // Expand jobs across scheduled days (skip weekends)
                        const expand = (items=[]) => {
                          const out = []
                          for (const a of items) {
                            if (!(a?.job || a?.type === 'install')) continue
                            const start = new Date(a.when)
                            const end = a.end ? new Date(a.end) : new Date(start.getFullYear(), start.getMonth(), start.getDate()+1)
                            const s = new Date(start.getFullYear(), start.getMonth(), start.getDate())
                            const e = new Date(end.getFullYear(), end.getMonth(), end.getDate())
                            for (let d = new Date(s); d < e; d.setDate(d.getDate()+1)) {
                              const dow = d.getDay()
                              if (dow===0 || dow===6) continue
                              out.push({ ...a, __day: d.toISOString().slice(0,10) })
                            }
                          }
                          return out
                        }
                        const expanded = expand(appts)
                        const now = new Date()
                        const year = now.getFullYear()
                        const month = now.getMonth()
                        const first = new Date(year, month, 1)
                        const startDay = first.getDay()
                        const daysInMonth = new Date(year, month+1, 0).getDate()

                        // Build per-job sequences within month
                        const monthKey = (iso) => iso.slice(0,7)
                        const currentMonthKey = `${year}-${String(month+1).padStart(2,'0')}`
                        const byJob = new Map()
                        for (const it of expanded) {
                          if (monthKey(it.__day) !== currentMonthKey) continue
                          if (!byJob.has(it.id)) byJob.set(it.id, new Set())
                          byJob.get(it.id).add(it.__day)
                        }
                        // Convert sets to sorted arrays and compute lanes
                        const jobsSeq = Array.from(byJob.entries()).map(([id, setDays]) => {
                          const days = Array.from(setDays).sort()
                          return { id, days }
                        })
                        // Deterministic lane assignment (0..2)
                        const MAX_LANES = 3
                        const hash = (s='') => Array.from(String(s)).reduce((a,c)=> a + c.charCodeAt(0), 0)
                        const laneFor = (id) => hash(id) % MAX_LANES
                        // Build segments per day with lane and rounded ends
                        const segsByDay = new Map()
                        for (const j of jobsSeq) {
                          const lane = laneFor(j.id)
                          const firstDay = j.days[0]
                          const lastDay = j.days[j.days.length-1]
                          for (const iso of j.days) {
                            if (!segsByDay.has(iso)) segsByDay.set(iso, [])
                            segsByDay.get(iso).push({ id: j.id, lane, isStart: iso===firstDay, isEnd: iso===lastDay })
                          }
                        }

                        // Build month cells
                        const rows = []
                        let cells = []
                        for (let i=0;i<startDay;i++) cells.push(null)
                        for (let day=1; day<=daysInMonth; day++) {
                          const iso = new Date(year, month, day).toISOString().slice(0,10)
                          const segs = (segsByDay.get(iso) || []).slice(0, MAX_LANES)
                          // Ensure we have placeholders for lanes without segs
                          const lanes = Array.from({ length: MAX_LANES }).map((_,lane)=> segs.find(s=>s.lane===lane) || null)
                          cells.push({ day, iso, lanes })
                        }
                        while (cells.length) rows.push(cells.splice(0,7))
                        return (
                          <>
                            <div className="grid grid-cols-7 gap-0 px-3 pb-3 text-xs select-none">
                              {['S','M','T','W','T','F','S'].map(l => <div key={l} className="text-neutral-400 text-center py-1">{l}</div>)}
                              {rows.flat().map((c, i) => (
                                <button
                                  key={i}
                                  className={`h-12 text-left ${c? 'bg-neutral-50 active:bg-neutral-100':'opacity-0'}`}
                                  disabled={!c}
                                  onClick={()=> c && setCrewSelectedDay(c.iso)}
                                >
                                  {c && (
                                    <div className="h-12 p-0">
                                      <div className="text-[11px] leading-none">{c.day}</div>
                                      <div className="mt-1 space-y-0.5">
                                        {c.lanes.map((seg, laneIdx) => (
                                          <div key={laneIdx} className="h-1.5 w-full">
                                            {seg ? (
                                              <div className={`h-1.5 w-full bg-emerald-600 ${seg.isStart ? 'rounded-l-full' : ''} ${seg.isEnd ? 'rounded-r-full' : ''}`} style={{marginLeft: seg.isStart?0:'-1px', marginRight: seg.isEnd?0:'-1px'}}></div>
                                            ) : (
                                              <div className="h-1.5 w-full"></div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                            <div className="px-4 pb-4 text-sm">
                              {crewSelectedDay ? (
                                (()=>{
                                  // Show jobs for the selected day
                                  const jobsOnDay = Array.from((segsByDay.get(crewSelectedDay) || []).reduce((acc, s) => acc.add(s.id), new Set()))
                                  const list = expanded.filter(it => it.__day===crewSelectedDay && jobsOnDay.includes(it.id))
                                  return list.length ? (
                                    <ul className="divide-y">
                                      {list.map(it => (
                                        <li key={`${it.id}-${it.__day}`} className="py-2 flex items-start gap-2">
                                          <span className="inline-block w-1.5 h-1.5 rounded-full mt-1 bg-emerald-500" />
                                          <div>
                                            <div className="font-medium">
                                              {it.customerName || 'Job'} — {it.workType || it.title}
                                              {(() => {
                                                const n = Number(it.squares)
                                                if (Number.isFinite(n) && n > 0) {
                                                  return ` — ${n.toFixed(2)} sq`
                                                }
                                                return ''
                                              })()}
                                            </div>
                                            <div className="text-xs text-neutral-600">{it.address || ''}</div>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : <div className="text-neutral-600">No jobs on this day.</div>
                                })()
                              ) : (
                                <div className="text-neutral-600">Tap a date to see jobs.</div>
                              )}
                            </div>
                          </>
                        )
                      })()}
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="text-sm font-semibold mb-2">Upcoming Installs</div>
                      {(() => { const upcoming = appts.filter(a => a.job || a.type==='install').sort((a,b)=> new Date(a.when) - new Date(b.when)).slice(0,10); return (
                        upcoming.length ? (
                          <ul className="text-sm text-neutral-700 space-y-1">
                            {upcoming.map(a => (
                              <li key={a.id} className="flex items-center gap-2">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>{new Date(a.when).toLocaleDateString()} — {(a.customerName || 'Job')} {(a.squares? `(${a.squares.toFixed?.(2)||a.squares} sq)`:'')}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <div className="text-xs text-neutral-500">No installs scheduled.</div>
                      )})()}
                    </div>
                    {/* Past Jobs (collapsible with inline totals) */}
                    <div className="rounded-2xl border border-neutral-200 bg-white">
                      <button
                        onClick={() => setShowPastJobs(p => !p)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
                      >
                        <span>Past Jobs</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-900 text-white border border-neutral-700">{pastJobs.length}</span>
                      </button>
                      {showPastJobs && (
                        <div className="px-4 pb-4">
                          {pastJobs.length ? (
                            <ul className="divide-y">
                              {pastJobs.map(j => (
                                <li key={j.id} className="py-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <div className="font-medium">{j.customerName || 'Job'}{j.squares ? ` — ${Number(j.squares).toFixed(2)} sq` : ''}</div>
                                    <div className="text-xs text-neutral-500">{new Date(j.completedAt).toLocaleDateString()}</div>
                                  </div>
                                  {j.address && <div className="text-xs text-neutral-600">{j.address}</div>}
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {Array.isArray(j.extras) && j.extras.map(x => (
                                      <span key={x.title + String(x.price)} className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[11px]">{x.title} {Number(x.price) ? `(${Number(x.price).toLocaleString('en-US', { style: 'currency', currency: 'USD' })})` : ''}</span>
                                    ))}
                                  </div>
                                  <div className="mt-2 text-xs space-y-1">
                                    <div className="flex justify-between"><span className="text-neutral-600">Rate</span><span>{j.ratePerSquare ? (Number(j.ratePerSquare)).toLocaleString('en-US',{style:'currency',currency:'USD'}) : '—'} / sq{j.rateTier ? ` (${j.rateTier})` : ''}</span></div>
                                    <div className="flex justify-between"><span className="text-neutral-600">Install ({(Number(j.usedSquares ?? j.squares)||0).toFixed(1)} sq × ${Number(j.ratePerSquare || 0).toFixed(0)})</span><span className="font-medium">{Number(j.installTotal ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span></div>
                                    <div className="flex justify-between"><span className="text-neutral-600">Extras</span><span className="font-medium">{Number(j.extrasTotal ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span></div>
                                    <div className="border-t pt-1 flex justify-between font-semibold text-sm">
                                      <span>Grand Total</span>
                                      <span>{Number(j.grandTotal ?? ((j.installTotal || 0) + (j.extrasTotal || 0))).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : <div className="text-xs text-neutral-500">No past jobs yet.</div>}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
  {/* removed standalone past-jobs page; totals are inline in accordion */}
            {tab === 'calendar' && (
              <CalendarScreen
                appts={appts}
                onSelect={onSelectAppt}
                onOpenCustomer={onOpenApptCustomer}
                reload={() => {
                  if (role === 'CREW') {
                    const assignedEmail = user.id
                    const picked = users.find(u => u.email === assignedEmail || u.id === assignedEmail)
                    const crewId = picked?.id || assignedEmail
                    return fetchAppointments({ crewId, jobOnly: 1 }).then(setAppts)
                  }
                  return fetchAppointments({ assignedTo: user.id }).then(setAppts)
                }}
              />
            )}
            {tab === 'leads' && role!=='CREW' && <LeadsScreen items={leads} />}
            {tab === 'customers' && role!=='CREW' && <CustomersScreen items={customers} onSelect={onSelectCustomer} reload={() => fetchCustomers({ assignedTo: user.id }).then(setCustomers)} />}
            {tab === 'settings' && <div className="text-sm text-neutral-700">Settings (stub)</div>}
          </>
        )}
        {view.id==='appt-edit' && (
          <AppointmentEditor initial={draft} onSave={saveAppt} onCancel={goHome} onDelete={removeAppt} />
        )}
        {view.id==='jobs-list' && (
          <JobsList items={appts} onSelect={onSelectJob} onBack={goHome} />
        )}
        {view.id==='leads-list' && (
          <LeadsList items={allLeads.length ? allLeads : leads} onSelect={onSelectLead} onBack={goHome} />
        )}
        {view.id==='customer-detail' && (
          <CustomerDetail
            initial={draft}
            appts={appts}
            onSave={saveCustomer}
            onCancel={goHome}
            onDelete={removeCustomer}
            onOpenDocuments={(docs)=>{ setFileCtx({ list: docs||[], file: null }); setView({ id:'documents' }) }}
            onOpenPhotos={(photos)=>{ setFileCtx({ list: photos||[], file: null }); setView({ id:'photos' }) }}
            onStartMeasure={async ({ address }={}) => {
              try {
                const a = (address || '').trim()
                if (!a) { alert('No address available for this customer.'); return }
                const res = await createMeasurementFromAddress(a)
                const id = res?.measurementId
                const src = res?.sourceImagePath
                const gsdMPerPx = res?.gsdMPerPx ?? null
                if (!id || !src) { alert('Failed to create measurement'); return }
                setMeasureCtx({ id, imageSrc: src, features: [], gsdMPerPx })
                setView({ id: 'measure-editor' })
              } catch (e) { alert(e?.message || String(e)) }
            }}
          />
        )}
        {view.id==='crew-job' && (
          <CrewJobDetail
            job={draft}
            onBack={goHome}
            onUpdated={(updated) => {
              setDraft(updated)
              setAppts(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
            }}
            onComplete={async (submitted) => {
              // reflect returned fields in appointments
              setAppts(prev => prev.map(a => a.id === submitted.id ? { ...a, ...submitted } : a))
              // update lead stage
              try {
                const leadId = submitted.customerId || submitted.contactId
                if (leadId) {
                  await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: leadId, stage: 'COMPLETED' }) })
                }
              } catch {}
              // refetch past jobs (most recent first)
              try {
                const r = await fetch(`/api/past-jobs?assignedTo=${encodeURIComponent(user.id)}`)
                const data = await r.json().catch(() => ({}))
                if (Array.isArray(data.items)) {
                  const sorted = data.items.slice().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
                  setPastJobs(sorted)
                }
              } catch {}
              goHome()
            }}
          />
        )}
        {view.id==='measure-editor' && (
          <MeasureEditor
            measurementId={measureCtx.id}
            imageSrc={measureCtx.imageSrc}
            initialFeatures={measureCtx.features}
            gsdMPerPx={measureCtx.gsdMPerPx}
            onBack={()=>{ setView({ id:'customer-detail' }) }}
          />
        )}
        {view.id==='documents' && (
          <div className="space-y-3">
            <button onClick={()=>setView({ id:'customer-detail' })} className="px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white active:bg-neutral-50">← Back</button>
            <DocumentsGrid items={fileCtx.list} onOpen={(f)=>{ setFileCtx(prev=>({ ...prev, file:f })); setView({ id:'file-viewer' }) }} />
          </div>
        )}
        {view.id==='photos' && (
          <div className="space-y-3">
            <button onClick={()=>setView({ id:'customer-detail' })} className="px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white active:bg-neutral-50">← Back</button>
            <PhotosGrid items={fileCtx.list} onOpen={(f)=>{ setFileCtx(prev=>({ ...prev, file:f })); setView({ id:'file-viewer' }) }} />
          </div>
        )}
        {view.id==='file-viewer' && (
          <FileViewer file={fileCtx.file} onBack={()=>{ const isDoc = (fileCtx.file?.category||'').includes('doc') || (fileCtx.file?.category==='documents'); setView({ id: isDoc ? 'documents' : 'photos' }) }} />
        )}
      </div>
    </MobileShell>
  )
}
// helper functions for time choices
function nextHalfHour() { const d=new Date(); d.setMinutes(d.getMinutes()<30?30:60,0,0); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
function halfHourIncrements(start,end){ const [sh,sm]=start.split(':').map(Number); const [eh,em]=end.split(':').map(Number); const out=[]; for(let h=sh; h<=eh; h++){ for(const m of [0,30]){ if(h===sh && m<sm) continue; if(h===eh && m>em) continue; out.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`) } } return out }
