import { z } from 'zod'
import { bucket } from './gcs'
import { GCS_BUCKET } from './env'

const BUCKET: any = bucket
const KEY = 'app/appointments.json'

export const Appointment = z.object({
  id: z.string(),
  title: z.string().default(''),
  type: z.enum(['install','site_visit','delivery','other']).default('other'),
  when: z.string(), // ISO date string
  customerId: z.string().optional().default(''),
  assignedTo: z.string().optional().default(''), // user id/email
  location: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  // Job fields
  job: z.boolean().optional().default(false),
  crewId: z.string().optional().default(''),
  contactId: z.string().optional().default(''),
  customerName: z.string().optional().default(''),
  address: z.string().optional().default(''),
  workType: z.string().optional().default(''),
  squares: z.number().optional().default(0),
  jobStatus: z.enum(['scheduled','in_progress','submitted','approved','completed']).optional().default('scheduled'),
  attachments: z.array(z.string()).optional().default([]),
  extrasJson: z.string().optional().default('[]'),
  materialOrdered: z.boolean().optional().default(false),
  completedAt: z.number().optional(),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
})
export type AppointmentT = z.infer<typeof Appointment>

type Store = { items: AppointmentT[] }

function newId() { return `APPT-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2,6).toUpperCase()}` }
function norm(v:any){ return typeof v==='string' ? v.trim() : (v ?? '') }

async function readStore(): Promise<{ data: Store; gen?: string }> {
  const file = BUCKET.file(KEY)
  try {
    const [meta] = await file.getMetadata({ preconditionOpts: { ifGenerationMatch: 0 } }).catch(()=>[undefined as any])
    const [buf] = await file.download()
    const raw = JSON.parse(buf.toString('utf8')) as Store
    const items = Array.isArray(raw.items) ? raw.items.map((it:any)=>({
      ...it,
      title: norm(it?.title),
      type: ['install','site_visit','delivery','other'].includes(String(it?.type)) ? it.type : 'other',
      when: typeof it?.when==='string' && !Number.isNaN(Date.parse(it.when)) ? it.when : new Date().toISOString(),
      customerId: norm(it?.customerId),
      assignedTo: norm(it?.assignedTo),
      location: norm(it?.location),
      notes: norm(it?.notes),
      job: Boolean(it?.job),
      crewId: norm(it?.crewId),
      contactId: norm(it?.contactId),
      customerName: norm(it?.customerName),
      address: norm(it?.address),
      workType: norm(it?.workType),
      squares: Number(it?.squares ?? 0) || 0,
      jobStatus: ((): any => {
        const s = String(it?.jobStatus || '').toLowerCase()
        const map: any = { scheduled:'scheduled', in_progress:'in_progress', submitted:'submitted', approved:'approved', completed:'completed' }
        return map[s] || 'scheduled'
      })(),
      attachments: Array.isArray(it?.attachments) ? it.attachments.map((s:any)=>String(s||'').trim()).filter(Boolean) : [],
      extrasJson: ((): string => {
        try {
          const v = typeof it?.extrasJson === 'string' ? it.extrasJson : JSON.stringify(it?.extras ?? [])
          JSON.parse(v)
          return v
        } catch { return '[]' }
      })(),
      materialOrdered: Boolean(it?.materialOrdered),
      completedAt: typeof it?.completedAt === 'number' ? it.completedAt : undefined,
    })) : []
    return { data: { items }, gen: meta?.generation }
  } catch {
    return { data: { items: [] }, gen: undefined }
  }
}

async function writeStore(next: Store, ifGenerationMatch?: string) {
  const file = BUCKET.file(KEY)
  const body = Buffer.from(JSON.stringify(next))
  const opts: any = { contentType: 'application/json' }
  if (ifGenerationMatch) opts.preconditionOpts = { ifGenerationMatch: Number(ifGenerationMatch) }
  await file.save(body, opts)
}

export async function listAppointments(opts?: { assignedTo?: string; date?: string; crewId?: string; jobOnly?: boolean }): Promise<AppointmentT[]> {
  const { data } = await readStore()
  let items = data.items
  if (opts?.assignedTo) items = items.filter(a => (a.assignedTo||'').toLowerCase() === opts!.assignedTo!.toLowerCase())
  if (opts?.crewId) items = items.filter(a => (a.crewId||'').toLowerCase() === opts!.crewId!.toLowerCase())
  if (opts?.jobOnly) items = items.filter(a => !!a.job)
  if (opts?.date) items = items.filter(a => (a.when||'').slice(0,10) === opts.date)
  // sort by when
  items = items.slice().sort((a,b)=> (a.when<b.when? -1 : a.when>b.when? 1 : 0))
  return items
}

export async function upsertAppointment(partial: Partial<AppointmentT> & { id?: string }): Promise<AppointmentT> {
  const { data, gen } = await readStore()
  const now = Date.now()
  const id = partial.id || newId()
  const idx = data.items.findIndex(a => a.id === id)
  const prev: AppointmentT | null = idx>=0 ? data.items[idx] : null
  const patch: Partial<AppointmentT> = { ...partial }
  if ('title' in partial) (patch as any).title = norm((partial as any).title)
  if ('type' in partial) {
    const t = String((partial as any).type)
    ;(patch as any).type = (['install','site_visit','delivery','other'] as string[]).includes(t) ? (t as any) : 'other'
  }
  if ('when' in partial) {
    const w = typeof (partial as any).when==='string' ? (partial as any).when.trim() : undefined
    ;(patch as any).when = (w && !Number.isNaN(Date.parse(w))) ? w : new Date().toISOString()
  }
  if ('customerId' in partial) (patch as any).customerId = norm((partial as any).customerId)
  if ('assignedTo' in partial) (patch as any).assignedTo = norm((partial as any).assignedTo)
  if ('location' in partial) (patch as any).location = norm((partial as any).location)
  if ('notes' in partial) (patch as any).notes = norm((partial as any).notes)
  if ('job' in partial) (patch as any).job = Boolean((partial as any).job)
  if ('crewId' in partial) (patch as any).crewId = norm((partial as any).crewId)
  if ('contactId' in partial) (patch as any).contactId = norm((partial as any).contactId)
  if ('customerName' in partial) (patch as any).customerName = norm((partial as any).customerName)
  if ('address' in partial) (patch as any).address = norm((partial as any).address)
  if ('workType' in partial) (patch as any).workType = norm((partial as any).workType)
  if ('squares' in partial) (patch as any).squares = Number((partial as any).squares) || 0
  if ('jobStatus' in partial) {
    const s = String((partial as any).jobStatus || '').toLowerCase()
    const map: any = { scheduled:'scheduled', in_progress:'in_progress', submitted:'submitted', approved:'approved', completed:'completed' }
    ;(patch as any).jobStatus = map[s] || 'scheduled'
  }
  if ('attachments' in partial) (patch as any).attachments = Array.isArray((partial as any).attachments) ? (partial as any).attachments.map((s:any)=>String(s||'').trim()).filter(Boolean) : []
  if ('extrasJson' in partial) {
    try { const v = String((partial as any).extrasJson || '[]'); JSON.parse(v); (patch as any).extrasJson = v } catch { (patch as any).extrasJson = '[]' }
  }
  if ('materialOrdered' in partial) (patch as any).materialOrdered = Boolean((partial as any).materialOrdered)
  if ('completedAt' in partial) (patch as any).completedAt = (typeof (partial as any).completedAt === 'number') ? (partial as any).completedAt : undefined

  if (idx>=0) {
    const merged = Appointment.parse({ ...data.items[idx], ...patch, id, updatedAt: now })
    data.items[idx] = merged
  } else {
    const fresh = Appointment.parse({
      title: norm((patch as any).title),
      type: ((): any => {
        const t = String((patch as any).type)
        return (['install','site_visit','delivery','other'] as string[]).includes(t) ? (t as any) : 'other'
      })(),
      when: ((): any => {
        const w = typeof (patch as any).when==='string' ? (patch as any).when.trim() : undefined
        return (w && !Number.isNaN(Date.parse(w))) ? w : new Date().toISOString()
      })(),
      customerId: norm((patch as any).customerId),
      assignedTo: norm((patch as any).assignedTo),
      location: norm((patch as any).location),
      notes: norm((patch as any).notes),
      job: Boolean((patch as any).job),
      crewId: norm((patch as any).crewId),
      contactId: norm((patch as any).contactId),
      customerName: norm((patch as any).customerName),
      address: norm((patch as any).address),
      workType: norm((patch as any).workType),
      squares: Number((patch as any).squares) || 0,
      jobStatus: ((): any => {
        const s = String((patch as any).jobStatus || '').toLowerCase()
        const map: any = { scheduled:'scheduled', in_progress:'in_progress', submitted:'submitted', approved:'approved', completed:'completed' }
        return map[s] || 'scheduled'
      })(),
      attachments: Array.isArray((patch as any).attachments) ? (patch as any).attachments.map((s:any)=>String(s||'').trim()).filter(Boolean) : [],
      extrasJson: ((): string => { try { const v = String((patch as any).extrasJson || '[]'); JSON.parse(v); return v } catch { return '[]' } })(),
      materialOrdered: Boolean((patch as any).materialOrdered),
      completedAt: typeof (patch as any).completedAt === 'number' ? (patch as any).completedAt : undefined,
      id,
      createdAt: now,
      updatedAt: now,
    })
    data.items.unshift(fresh)
  }
  await writeStore(data, gen)
  const saved = (data.items.find(a => a.id === id)) as AppointmentT
  try { await onAppointmentChanged(prev, saved) } catch {}
  return saved
}

export async function deleteAppointment(id: string) {
  const { data, gen } = await readStore()
  const next = { items: data.items.filter(a => a.id !== id) }
  await writeStore(next, gen)
}

// Lightweight task automation hooks for jobs
import { listTasks as listAllTasks, upsertTask as saveTask, deleteTask as removeTask } from './tasks'

async function onAppointmentChanged(prev: AppointmentT | null, cur: AppointmentT) {
  // Only care about job entries
  if (!cur.job) return
  const customerId = cur.customerId || cur.contactId || ''
  const name = cur.customerName || cur.title || 'Job'
  const wantAssignTask = !cur.crewId
  const becameAssigned = (!!cur.crewId) && (!prev || !prev.crewId)
  const becameApproved = (cur.jobStatus === 'approved') && (!prev || prev.jobStatus !== 'approved')
  const materialOrderedNow = !!cur.materialOrdered

  const tasks = await listAllTasks().catch(()=>[] as any[])
  const isAssignTask = (t:any) => String(t?.title||'').toLowerCase().startsWith('assign crew:')
  const isMatTask = (t:any) => String(t?.title||'').toLowerCase().startsWith('create material order:')
  const isApproveTask = (t:any) => String(t?.title||'').toLowerCase().startsWith('approve job card:')

  // Maintain "Assign crew" task presence when unassigned
  if (wantAssignTask) {
    const exists = tasks.find(t => isAssignTask(t) && (String(t?.customerId||'') === customerId))
    if (!exists) await saveTask({ title: `Assign crew: ${name}`, status: 'todo', customerId })
  } else {
    // Remove any lingering assign tasks once assigned
    await Promise.all(tasks.filter(t => isAssignTask(t) && (String(t?.customerId||'') === customerId)).map(t => removeTask(t.id)))
  }

  // Create material order task when approved
  if (becameApproved && !materialOrderedNow) {
    const exists = tasks.find(t => isMatTask(t) && (String(t?.customerId||'') === customerId))
    if (!exists) await saveTask({ title: `Create material order: ${name}`, status: 'todo', customerId })
  }
  // Remove material order task once marked ordered
  if (materialOrderedNow) {
    await Promise.all(tasks.filter(t => isMatTask(t) && (String(t?.customerId||'') === customerId)).map(t => removeTask(t.id)))
  }

  // When crew submits completion (jobStatus submitted), create admin approval task
  if (cur.jobStatus === 'submitted' && (!prev || prev.jobStatus !== 'submitted')) {
    const exists = tasks.find(t => isApproveTask(t) && (String(t?.customerId||'') === customerId))
    if (!exists) await saveTask({ title: `Approve job card: ${name}`, status: 'todo', customerId })
  }
}
