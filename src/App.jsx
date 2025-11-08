import React, { useState } from 'react'
import MobileShell from './ui/MobileShell.jsx'
import CustomersScreen from './features/customers/CustomersScreen.jsx'
import DashboardScreen from './features/dashboard/DashboardScreen.jsx'
import CalendarScreen from "./features/calendar/CalendarScreen.jsx"

export default function App() {
  const [tab, setTab] = useState('customers')
  const [customersNeedsBack, setCustomersNeedsBack] = useState(false)

  return (
    <div className="h-[100svh] flex flex-col">
      <MobileShell
        tab={tab}
        onTabChange={setTab}
        title="HyTech CRM"
        onBack={tab === 'customers' && customersNeedsBack ? (() => {
          try { window.dispatchEvent(new Event('customers:back')) } catch {}
        }) : undefined}
      >
        {tab === 'dashboard' ? (
          <DashboardScreen />
        ) : tab === 'customers' ? (
          <CustomersScreen onProfileOpenChange={setCustomersNeedsBack} />
        ) : tab === 'calendar' ? (
          <CalendarScreen />
        ) : tab === 'tasks' ? (
          <div className="p-4 text-sm text-neutral-600">Tasks coming soon…</div>
        ) : null}
      </MobileShell>
    </div>
  )
}
