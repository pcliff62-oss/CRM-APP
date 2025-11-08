import { useEffect, useMemo, useState } from 'react'
import { loadJSON, saveJSON } from '../../lib/storage'

const KEY = 'hytech.tasks.v1'

export function useTasks() {
  const [items, setItems] = useState(() => loadJSON(KEY, [
    // starter sample so empty UIs aren't sad
    { id: 't1', text: "Call Shapley’s about window options", urgency: 'orange', done: false },
    { id: 't2', text: 'Ray Brown — confirm shingles', urgency: 'red', done: false },
    { id: 't3', text: 'Power-wash station parts list', urgency: 'green', done: false },
  ]))

  useEffect(() => { saveJSON(KEY, items) }, [items])

  function add(text, urgency='green') {
    const id = 't' + Math.random().toString(36).slice(2, 9)
    setItems(prev => [{ id, text, urgency, done: false }, ...prev])
  }
  function toggle(id) { setItems(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t)) }
  function remove(id) { setItems(prev => prev.filter(t => t.id !== id)) }

  const counts = useMemo(() => ({
    total: items.length,
    open: items.filter(t => !t.done).length,
  }), [items])

  return { items, add, toggle, remove, counts }
}
