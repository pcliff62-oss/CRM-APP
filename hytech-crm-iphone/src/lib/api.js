// Use relative base by default so Vite dev proxy (`/api` -> Next on 3000) handles requests without CORS.
// Override with VITE_API_BASE for production or when pointing to a deployed API.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim()

async function get(path, params = {}) {
  const url = API_BASE
    ? new URL(API_BASE.replace(/\/$/,'') + path)
    : new URL(path, window.location.origin)
  Object.entries(params).forEach(([k,v]) => { if (v!=null && v!=='') url.searchParams.set(k, String(v)) })
  const r = await fetch(url.toString())
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
  return r.json()
}

async function post(path, body = {}) {
  const url = API_BASE ? (API_BASE.replace(/\/$/,'') + path) : path
  const r = await fetch(url, { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`POST ${path} ${r.status}`)
  return r.json()
}

async function del(path) {
  const url = API_BASE ? (API_BASE.replace(/\/$/,'') + path) : path
  const r = await fetch(url, { method:'DELETE' })
  if (!r.ok) throw new Error(`DELETE ${path} ${r.status}`)
  return r.json()
}

export async function fetchAppointments({ assignedTo, date } = {}) {
  return get('/api/appointments', { assignedTo, date }).then(d => d.items || [])
}

export async function fetchCustomers({ assignedTo } = {}) {
  return get('/api/customers', { assignedTo }).then(d => d.items || [])
}

export async function upsertAppointment(a) { return post('/api/appointments', a).then(d => d.item) }

export async function upsertCustomer(c) { return post('/api/customers', c).then(d => d.item) }

export function todayLocal() { return new Date().toISOString().slice(0,10) }

export async function fetchCustomer(id) { return get(`/api/customers/${encodeURIComponent(id)}`).then(d => d.item) }
export async function deleteAppointment(id) { return del(`/api/appointments/${encodeURIComponent(id)}`) }
export async function deleteCustomer(id) { return del(`/api/customers/${encodeURIComponent(id)}`) }

// Leads
export async function fetchLeads({ assignedTo } = {}) { return get('/api/leads', { assignedTo }).then(d => d.items || []) }
