import React, { useEffect, useState } from 'react'
import MobileShell from './ui/MobileShell.jsx'
import Today from './features/dashboard/Today.jsx'
import CalendarScreen from './features/calendar/CalendarScreen.jsx'
import AppointmentEditor from './features/calendar/AppointmentEditor.jsx'
import CustomersScreen from './features/customers/CustomersScreen.jsx'
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
  const [leads, setLeads] = useState([])
  const [view, setView] = useState({ id: 'home' }) // 'home' | 'appt-edit' | 'customer-detail'
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

  const title = view.id==='home' ? 'HyTech CRM' : (view.id==='appt-edit' ? (draft?.id? 'Edit appointment':'New appointment') : 'Customer')
  const showPlus = view.id==='home' && (tab==='calendar' || tab==='customers')
  return (
    <MobileShell title={title} onPlus={onPlus} onBack={view.id!=='home'? goHome:undefined} showPlus={showPlus} tab={tab} onTabChange={(t)=>{ setTab(t); if(view.id!=='home') goHome() }} frame="edge">
      <div className="p-4">
        {view.id==='home' && (
          <>
            {tab === 'dashboard' && (
              <Today
                appts={appts}
                customers={customers}
                onOpenCalendar={() => setTab('calendar')}
                onOpenCustomers={() => setTab('customers')}
                onSelectCustomer={onSelectCustomer}
              />
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
        {view.id==='customer-detail' && (
          <CustomerDetail initial={draft} onSave={saveCustomer} onCancel={goHome} onDelete={removeCustomer} />
        )}
      </div>
    </MobileShell>
  )
}
