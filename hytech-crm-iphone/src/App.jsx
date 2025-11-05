import React, { useEffect, useState } from 'react'
import MobileShell from './ui/MobileShell.jsx'
import Today from './features/dashboard/Today.jsx'
import CalendarScreen from './features/calendar/CalendarScreen.jsx'
import AppointmentEditor from './features/calendar/AppointmentEditor.jsx'
import CustomersScreen from './features/customers/CustomersScreen.jsx'
import JobsList from './features/jobs/JobsList.jsx'
import LeadsList from './features/leads/LeadsList.jsx'
function LeadsScreen({ items = [] }) {
  return (
    <div className="space-y-2">
      <div className="font-medium mb-2">My Leads</div>
      {items.length===0 && <div className="text-sm text-neutral-600">No leads assigned.</div>}
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
import CustomerDetail from './features/customers/CustomerDetail.jsx'
import { fetchAppointments, fetchCustomers, upsertAppointment, deleteAppointment, upsertCustomer, fetchCustomer, deleteCustomer, fetchLeads } from './lib/api.js'

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [user] = useState({ id: 'patrick@hytech', name: 'Patrick' })
  const [appts, setAppts] = useState([])
  const [customers, setCustomers] = useState([])
  const [leads, setLeads] = useState([])          // my leads (assigned)
  const [allLeads, setAllLeads] = useState([])    // pipeline leads (all)
  const [view, setView] = useState({ id: 'home' }) // 'home' | 'appt-edit' | 'customer-detail' | 'jobs-list' | 'leads-list'
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [a, c, l] = await Promise.all([
          fetchAppointments({ assignedTo: user.id }),
          fetchCustomers({ assignedTo: user.id }),
          fetchLeads({ assignedTo: user.id }),
        ])
        setAppts(a)
        setCustomers(c)
        setLeads(l)
      } catch (e) { console.error('load failed', e) }
    }
    load()
  }, [user.id])
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
  const onSelectCustomer = (c) => { setDraft(c); setView({ id:'customer-detail' }) }

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
      const idx = prev.findIndex(x=>x.id===saved.id)
      if (idx>=0) { const next = prev.slice(); next[idx]=saved; return next }
      return [saved, ...prev]
    })
    goHome()
  }
  const removeCustomer = async (id) => {
    await deleteCustomer(id)
    setCustomers(prev => prev.filter(x=>x.id!==id))
    goHome()
  }

  const title = view.id==='home'
    ? 'HyTech CRM'
    : view.id==='appt-edit'
      ? (draft?.id? 'Edit appointment':'New appointment')
      : view.id==='customer-detail'
        ? 'Customer'
        : view.id==='jobs-list'
          ? 'Jobs'
          : view.id==='leads-list'
            ? 'Leads'
            : 'HyTech CRM'
  const showPlus = view.id==='home' && (tab==='calendar' || tab==='customers')
  return (
    <MobileShell title={title} onPlus={onPlus} onBack={view.id!=='home'? goHome:undefined} showPlus={showPlus} tab={tab} onTabChange={(t)=>{ setTab(t); if(view.id!=='home') goHome() }} frame="edge">
      <div className="p-4">
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

                  <div className="grid grid-cols-2 gap-4 w-full">
                    {/* Jobs card */}
                    <button
                      onClick={() => setView({ id:'jobs-list' })}
                      className="group relative rounded-2xl aspect-[4/3] overflow-hidden shadow-2xl active:scale-[0.99] transition-transform"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1a2e] via-[#1773e6] to-[#60a5fa]" />
                      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white_0%,transparent_40%),radial-gradient(circle_at_70%_80%,white_0%,transparent_45%)]" />
                      <div className="absolute inset-0" style={{
                        background:
                          'linear-gradient(120deg, rgba(255,255,255,0.15), rgba(255,255,255,0) 60%)',
                        transform:
                          'perspective(600px) rotateX(8deg)'
                      }} />
                      <div className="relative h-full w-full flex flex-col items-center justify-center text-white">
                        <div className="text-5xl drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]">🏗️</div>
                        <div className="mt-2 font-semibold tracking-wide">Jobs</div>
                      </div>
                    </button>

                    {/* Leads card */}
                    <button
                        onClick={async () => {
                          try {
                            // Fetch all leads (no assigned filter) for pipeline view
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
                      <div className="relative h-full w-full flex flex-col items-center justify-center text-white">
                        <div className="text-5xl drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]">📇</div>
                        <div className="mt-2 font-semibold tracking-wide">Leads</div>
                      </div>
                    </button>
                  </div>
                </div>

                <Today
                  appts={appts}
                  customers={customers}
                  onOpenCalendar={() => setTab('calendar')}
                  onOpenCustomers={() => setTab('customers')}
                  onSelectCustomer={onSelectCustomer}
                />
              </>
            )}
            {tab === 'calendar' && <CalendarScreen appts={appts} onSelect={onSelectAppt} reload={() => fetchAppointments({ assignedTo: user.id }).then(setAppts)} />}
            {tab === 'leads' && <LeadsScreen items={leads} />}
            {tab === 'customers' && <CustomersScreen items={customers} onSelect={onSelectCustomer} reload={() => fetchCustomers({ assignedTo: user.id }).then(setCustomers)} />}
            {tab === 'settings' && <div className="text-sm text-neutral-700">Settings (stub)</div>}
          </>
        )}
        {view.id==='appt-edit' && (
          <AppointmentEditor initial={draft} onSave={saveAppt} onCancel={goHome} onDelete={removeAppt} />
        )}
        {view.id==='jobs-list' && (
          <JobsList items={appts} onSelect={onSelectAppt} />
        )}
        {view.id==='leads-list' && (
          <LeadsList items={allLeads.length ? allLeads : leads} onSelect={(l)=>{ /* optional: future details */ }} />
        )}
        {view.id==='customer-detail' && (
          <CustomerDetail initial={draft} appts={appts} onSave={saveCustomer} onCancel={goHome} onDelete={removeCustomer} />
        )}
      </div>
    </MobileShell>
  )
}
