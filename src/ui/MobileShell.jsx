import React from 'react'

export default function MobileShell({
  tab,
  onTabChange,
  title = 'HyTech CRM',
  onAdd,
  onBack,
  showAdd,
  children
}) {
  function handleAddClick(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    try {
      if (typeof onAdd === 'function') {
        console.log('[MobileShell] + -> onAdd()');
        onAdd();
        return;
      }
      if (tab === 'calendar') {
        console.log('[MobileShell] + -> dispatch "calendar:new"');
        window.dispatchEvent(new Event('calendar:new'));
        return;
      }
      if (tab === 'customers') {
        console.log('[MobileShell] + -> dispatch "open-new-customer"');
        window.dispatchEvent(new Event('open-new-customer'));
        return;
      }
      console.log('[MobileShell] + clicked with tab:', tab);
    } catch (err) {
      console.error('[MobileShell] + handler error:', err);
    }
  }

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'customers', label: 'Customers' },
    { key: 'calendar',  label: 'Calendar' },
    { key: 'files',     label: 'Files' }
  ]

  return (
    // full-height flex column; overflow hidden so only <main> scrolls
    <div className="min-h-[100svh] flex flex-col bg-white" style={{overflow: 'hidden'}}>
      {/* Header: sticky at top */}
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
        <div className="mx-auto max-w-[440px] w-full px-3 py-2 flex items-center justify-center relative">
          {onBack ? (
            <button
              aria-label="Back"
              onClick={onBack}
              className="h-9 w-9 rounded-xl border border-neutral-300 bg-white flex items-center justify-center active:scale-[0.98] absolute left-3 top-1/2 -translate-y-1/2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          ) : (
            <div className="w-9 absolute left-3 top-1/2 -translate-y-1/2" />
          )}
          <div className="text-[16px] font-semibold tracking-wide leading-none text-neutral-900">HyTech</div>
          {(onAdd && showAdd !== false) ? (
            <button
              type="button"
              onClick={handleAddClick}
              className="px-2 py-1 rounded-lg border text-sm hover:bg-neutral-50 z-20 absolute right-3 top-1/2 -translate-y-1/2"
              aria-label="Add"
            >
              +
            </button>
          ) : (
            <div className="w-9 absolute right-3 top-1/2 -translate-y-1/2" />
          )}
        </div>
      </header>

      {/* Main: ONLY scroll container; give it bottom padding to clear fixed tabs */}
      <main
        className="flex-1 min-h-0 overflow-auto"
        style={{
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="mx-auto max-w-[440px] w-full px-3 py-3">
          {children}
        </div>
      </main>

      {/* Fixed bottom tabs: icon-only */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-[440px] px-6">
          <div className="h-14 flex items-center justify-between">
            {/* Dashboard */}
            <button
              aria-label="Dashboard"
              onClick={() => onTabChange?.('dashboard')}
              className={"relative p-2 " + (tab === 'dashboard' ? "text-neutral-900" : "text-neutral-400")}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10.5L12 3l9 7.5" />
                <path d="M5 10v10h14V10" />
                <path d="M9 20v-8h6v8" />
              </svg>
              {tab === 'dashboard' && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-neutral-900 rounded"></span>}
            </button>

            {/* Customers */}
            <button
              aria-label="Customers"
              onClick={() => onTabChange?.('customers')}
              className={"relative p-2 " + (tab === 'customers' ? "text-neutral-900" : "text-neutral-400")}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="3" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
              {tab === 'customers' && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-neutral-900 rounded"></span>}
            </button>

            {/* Calendar */}
            <button
              aria-label="Calendar"
              onClick={() => onTabChange?.('calendar')}
              className={"relative p-2 " + (tab === 'calendar' ? "text-neutral-900" : "text-neutral-400")}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M16 3v4M8 3v4M3 11h18" />
              </svg>
              {tab === 'calendar' && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-neutral-900 rounded"></span>}
            </button>

            {/* Tasks (replaces Files) */}
            <button
              aria-label="Tasks"
              onClick={() => onTabChange?.('tasks')}
              className={"relative p-2 " + (tab === 'tasks' ? "text-neutral-900" : "text-neutral-400")}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 4h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1" />
                <rect x="9" y="2" width="6" height="4" rx="1" />
                <path d="M9 14l2 2 4-4" />
              </svg>
              {tab === 'tasks' && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-neutral-900 rounded"></span>}
            </button>
          </div>
        </div>
      </nav>
    </div>
  )
}
