import { useEffect, useMemo, useState } from 'react'
import { loadJSON, saveJSON } from '../../lib/storage'

const KEY = 'hytech.customers.v1'
export const STATUSES = ['Lead','Prospect','Approved','Complete','Invoiced','Archived','Lost']

const STARTER = [
  { id:'carlton', first:'Eileen & Trevor', last:'Carlton', town:'Dennis', status:'Prospect', notes:[], lostReason:null },
  { id:'brown',   first:'Ray', last:'Brown', town:'Dennis', status:'Approved', notes:[], lostReason:null },
  { id:'couter',  first:'Russ', last:'Couturier', town:'Harwich', status:'Lead', notes:[], lostReason:null },
  { id:'marybeth',first:'Marybeth', last:'Magnuson', town:'Yarmouth', status:'Complete', notes:[], lostReason:null },
]

export function useCustomers() {
  const [items, setItems] = useState(() => loadJSON(KEY, STARTER))

  useEffect(() => { saveJSON(KEY, items) }, [items])

  function add({ first, last, town }) {
    const id = (first + last + Math.random().toString(36).slice(2,6)).toLowerCase().replace(/\s+/g,'')
    const c = { id, first, last, town, status:'Lead', notes:[], lostReason:null }
    setItems(prev => [c, ...prev])
    return c
  }

  function setStatus(id, status, lostReason=null) {
    setItems(prev => prev.map(c => c.id===id ? { ...c, status, lostReason: status==='Lost' ? (lostReason||c.lostReason||'') : null } : c))
  }

  function addNote(id, text) {
    const stamp = new Date().toISOString()
    setItems(prev => prev.map(c => c.id===id ? { ...c, notes:[{ id: stamp, text, at: stamp }, ...c.notes] } : c))
  }

  function remove(id) { setItems(prev => prev.filter(c => c.id !== id)) }

  const byId = useMemo(() => Object.fromEntries(items.map(c => [c.id, c])), [items])

  return { items, byId, add, setStatus, addNote, remove }
}
