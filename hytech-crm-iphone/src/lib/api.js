// Use relative base by default so Vite dev proxy (`/api` -> Next on 3000) handles requests without CORS.
// Override with VITE_API_BASE for production or when pointing to a deployed API.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim()
// Dev auth helper: tell the Next API which user to assume (aligns with demo auth in src/lib/auth.ts)
let CURRENT_USER_EMAIL = (import.meta.env.VITE_USER_EMAIL ?? 'demo@hytech.local').trim()

export function setUserEmail(email) {
  if (typeof email === 'string' && email.trim()) CURRENT_USER_EMAIL = email.trim()
}

async function get(path, params = {}) {
  const url = API_BASE
    ? new URL(API_BASE.replace(/\/$/,'') + path)
    : new URL(path, window.location.origin)
  Object.entries(params).forEach(([k,v]) => { if (v!=null && v!=='') url.searchParams.set(k, String(v)) })
  const r = await fetch(url.toString(), { headers: { 'x-user-email': CURRENT_USER_EMAIL } })
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
  return r.json()
}

async function post(path, body = {}) {
  const url = API_BASE ? (API_BASE.replace(/\/$/,'') + path) : path
  const r = await fetch(url, { method:'POST', headers: { 'Content-Type':'application/json', 'x-user-email': CURRENT_USER_EMAIL }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`POST ${path} ${r.status}`)
  return r.json()
}

async function del(path) {
  const url = API_BASE ? (API_BASE.replace(/\/$/,'') + path) : path
  const r = await fetch(url, { method:'DELETE', headers: { 'x-user-email': CURRENT_USER_EMAIL } })
  if (!r.ok) throw new Error(`DELETE ${path} ${r.status}`)
  return r.json()
}

export async function fetchAppointments({ assignedTo, date, crewId, jobOnly } = {}) {
  return get('/api/appointments', { assignedTo, date, crewId, jobOnly }).then(d => d.items || [])
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

// Users
export async function fetchUsers() {
  return get('/api/users').then(d => Array.isArray(d) ? d : (d.items || []))
}

// Measurements
export async function createMeasurementFromAddress(address) {
  if (!address || !String(address).trim()) throw new Error('Address is required')
  return post('/api/measurements/create-from-satellite', { address: String(address).trim() })
}

export async function recomputeMeasurement(id, features, defaultPitchIn12 = 6) {
  if (!id) throw new Error('measurement id required')
  const path = `/api/measurements/${encodeURIComponent(id)}/recompute`
  return post(path, { features: Array.isArray(features) ? features : [], defaultPitchIn12 })
}

// Crews & Jobs
export async function fetchCrews() { return get('/api/crews').then(d => d.items || []) }
export async function assignJob(appt) { return post('/api/appointments', { ...appt, job: true }).then(d => d.item) }
export async function submitJob(id, { squares, extras, attachments } = {}) {
  const extrasJson = JSON.stringify(extras || [])
  return post(`/api/jobs/${encodeURIComponent(id)}/submit`, { squares, extrasJson, attachments }).then(d => d.item)
}
export async function shiftJobs(days) { return post('/api/jobs/shift', { days }).then(d => d) }
