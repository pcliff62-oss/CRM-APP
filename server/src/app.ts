import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { nanoid } from 'nanoid'
import { putObject, getSignedUrl, listObjects, deleteObject } from './gcs'

const app = express()
app.use(cors({
  origin: [
    /^http:\/\/localhost:5173$/,
    /^http:\/\/127\.0\.0\.1:5173$/,
  /^http:\/\/localhost:5174$/,
  /^http:\/\/127\.0\.0\.1:5174$/,
  /^http:\/\/localhost:5175$/,
  /^http:\/\/127\.0\.0\.1:5175$/,
    /^http:\/\/localhost:3002$/,
    /^http:\/\/127\.0\.0\.1:3002$/
  ],
  credentials: false
}))
app.use(express.json({ limit: '1mb' }))

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } })

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/storage/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    const prefix = typeof req.body?.prefix === 'string' && req.body.prefix ? req.body.prefix.replace(/^\/+/, '') : 'iphone'
    if (!file) return res.status(400).json({ ok: false, error: 'Missing file' })
    const allowed = [
      'image/', 'application/pdf', 'text/plain', 'text/csv', 'application/zip',
      'application/vnd.openxmlformats-officedocument'
    ]
    const ct = file.mimetype || 'application/octet-stream'
    if (!allowed.some(a => ct.startsWith(a))) return res.status(400).json({ ok: false, error: 'Unsupported content type' })
    const safeName = (file.originalname || 'file').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_')
    const d = new Date()
    const key = `${prefix}/${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${nanoid()}_${safeName}`
    await putObject(key, file.buffer, ct)
    res.json({ ok: true, key, size: file.size, contentType: ct })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'Upload failed' })
  }
})

app.post('/api/storage/sign', async (req, res) => {
  try {
    const { key, expiresInSeconds } = req.body || {}
    if (!key) return res.status(400).json({ ok: false, error: 'Missing key' })
    const n = Math.min(Number(expiresInSeconds || 3600), 86400)
    const url = await getSignedUrl(key, n)
    res.json({ ok: true, url })
  } catch {
    res.status(500).json({ ok: false, error: 'Sign failed' })
  }
})

app.post('/api/storage/list', async (req, res) => {
  try {
    const { prefix } = req.body || {}
    const p = typeof prefix === 'string' && prefix ? prefix : 'iphone/'
    const items = await listObjects(p)
    items.sort((a, b) => (a.updated < b.updated ? 1 : -1))
    res.json({ ok: true, items })
  } catch {
    res.status(500).json({ ok: false, error: 'List failed' })
  }
})

app.post('/api/storage/delete', async (req, res) => {
  try {
    const { key } = req.body || {}
    if (!key) return res.status(400).json({ ok: false, error: 'Missing key' })
    await deleteObject(key)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ ok: false, error: 'Delete failed' })
  }
})

// Customers API (stored as JSON in GCS with optimistic concurrency)
import { listCustomers, getCustomer, upsertCustomer, deleteCustomer, createCustomer } from './customers'

app.get('/api/customers', async (req, res) => {
  const assignedTo = typeof req.query.assignedTo === 'string' ? req.query.assignedTo : undefined
  let items = await listCustomers().catch(e => ({ error: String(e) }))
  if ((items as any).error) return res.status(500).json({ ok:false, error:(items as any).error })
  if (assignedTo) items = (items as any[]).filter(it => (String((it as any).assignedTo||'').toLowerCase() === assignedTo!.toLowerCase()))
  res.json({ ok:true, items })
})

app.get('/api/customers/:id', async (req, res) => {
  const item = await getCustomer(req.params.id).catch(e => ({ error: String(e) }))
  if ((item as any)?.error) return res.status(500).json({ ok:false, error:(item as any).error })
  if (!item) return res.status(404).json({ ok:false, error:'not found' })
  res.json({ ok:true, item })
})

app.post('/api/customers', express.json(), async (req, res) => {
  try { console.log('[api/customers] incoming body:', req.body) } catch {}
  const body = req.body || {}
  const saved = (body && body.id)
    ? await upsertCustomer(body).catch(e => ({ error: String(e) }))
    : await createCustomer(body).catch(e => ({ error: String(e) }))
  if ((saved as any).error) return res.status(400).json({ ok:false, error:(saved as any).error })
  try { console.log('[api/customers] saved item:', saved) } catch {}
  res.json({ ok:true, item: saved })
})

app.delete('/api/customers/:id', async (req, res) => {
  await deleteCustomer(req.params.id).catch(e => res.status(400).json({ ok:false, error:String(e) }))
  res.json({ ok:true })
})

import { runSelfTest } from './selftest'

app.get('/api/health/full', async (_req, res) => {
  try {
    const report = await runSelfTest()
    res.json(report)
  } catch (e:any) {
    res.status(500).json({ ok:false, error:String(e) })
  }
})

export default app

// Tasks API
import { listTasks, upsertTask, deleteTask } from './tasks'

app.get('/api/tasks', async (_req, res) => {
  const items = await listTasks().catch(e => ({ error: String(e) }))
  if ((items as any).error) return res.status(500).json({ ok:false, error:(items as any).error })
  res.json({ ok:true, items })
})

app.post('/api/tasks', express.json(), async (req, res) => {
  try { console.log('[api/tasks] incoming body:', req.body) } catch {}
  const body = req.body || {}
  const saved = await upsertTask(body).catch(e => ({ error: String(e) }))
  if ((saved as any).error) return res.status(400).json({ ok:false, error:(saved as any).error })
  try { console.log('[api/tasks] saved item:', saved) } catch {}
  res.json({ ok:true, item: saved })
})

app.delete('/api/tasks/:id', async (req, res) => {
  await deleteTask(req.params.id).catch(e => res.status(400).json({ ok:false, error:String(e) }))
  res.json({ ok:true })
})

// Appointments API
import { listAppointments, upsertAppointment, deleteAppointment } from './appointments'

app.get('/api/appointments', async (req, res) => {
  const assignedTo = typeof req.query.assignedTo === 'string' ? req.query.assignedTo : undefined
  const date = typeof req.query.date === 'string' ? req.query.date : undefined
  const crewId = typeof req.query.crewId === 'string' ? req.query.crewId : undefined
  const jobOnly = ((): boolean | undefined => {
    const raw = req.query.jobOnly
    if (raw === undefined) return undefined
    if (raw === '1' || raw === 'true' || raw === 'yes') return true
    if (raw === '0' || raw === 'false' || raw === 'no') return false
    return undefined
  })()
  const items = await listAppointments({ assignedTo, date, crewId, jobOnly }).catch(e => ({ error: String(e) }))
  if ((items as any).error) return res.status(500).json({ ok:false, error:(items as any).error })
  res.json({ ok:true, items })
})

app.post('/api/appointments', express.json(), async (req, res) => {
  const body = req.body || {}
  const saved = await upsertAppointment(body).catch(e => ({ error: String(e) }))
  if ((saved as any).error) return res.status(400).json({ ok:false, error:(saved as any).error })
  res.json({ ok:true, item: saved })
})

app.delete('/api/appointments/:id', async (req, res) => {
  await deleteAppointment(req.params.id).catch(e => res.status(400).json({ ok:false, error:String(e) }))
  res.json({ ok:true })
})

// Crews API
import { listCrews, upsertCrew, deleteCrew } from './crews'

app.get('/api/crews', async (_req, res) => {
  const items = await listCrews().catch(e => ({ error: String(e) }))
  if ((items as any).error) return res.status(500).json({ ok:false, error:(items as any).error })
  res.json({ ok:true, items })
})

app.post('/api/crews', express.json(), async (req, res) => {
  const body = req.body || {}
  try {
    const saved = await upsertCrew(body)
    res.json({ ok:true, item: saved })
  } catch (e:any) {
    res.status(500).json({ ok:false, error: String(e?.message||e) })
  }
})

app.delete('/api/crews/:id', async (req, res) => {
  await deleteCrew(req.params.id).catch(e => res.status(400).json({ ok:false, error:String(e) }))
  res.json({ ok:true })
})

// Jobs API (operates on job-type appointments)
import { shiftAllJobs, submitJobCompletion, markMaterialOrdered } from './jobs'

app.post('/api/jobs/shift', express.json(), async (req, res) => {
  const days = Number(req.body?.days ?? 0)
  if (!Number.isFinite(days) || days === 0) return res.status(400).json({ ok:false, error:'days must be non-zero number' })
  const out = await shiftAllJobs(days).catch(e => ({ error: String(e) }))
  if ((out as any).error) return res.status(500).json({ ok:false, error:(out as any).error })
  res.json({ ok:true, ...out })
})

app.post('/api/jobs/:id/submit', express.json(), async (req, res) => {
  const id = req.params.id
  // Verify appointment exists first
  const existing = await listAppointments().then(items => items.find(a => a.id === id)).catch(()=>null)
  if (!existing) {
    console.error('[api/jobs/:id/submit] not found', id)
    return res.status(404).json({ ok:false, error:'Appointment not found' })
  }
  const saved = await submitJobCompletion(id, req.body || {}).catch(e => ({ error: String(e) }))
  if ((saved as any).error) {
    console.error('[api/jobs/:id/submit] error for', id, (saved as any).error)
    return res.status(400).json({ ok:false, error:(saved as any).error })
  }
  try { console.log('[api/jobs/:id/submit] success id', id, 'squares', (saved as any).squares) } catch {}
  res.json({ ok:true, item: saved })
})

app.post('/api/jobs/:id/material-ordered', express.json(), async (req, res) => {
  const id = req.params.id
  const ordered = !!req.body?.ordered
  const saved = await markMaterialOrdered(id, ordered).catch(e => ({ error: String(e) }))
  if ((saved as any).error) return res.status(400).json({ ok:false, error:(saved as any).error })
  res.json({ ok:true, item: saved })
})
