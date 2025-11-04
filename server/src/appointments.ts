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

export async function listAppointments(opts?: { assignedTo?: string; date?: string }): Promise<AppointmentT[]> {
  const { data } = await readStore()
  let items = data.items
  if (opts?.assignedTo) items = items.filter(a => (a.assignedTo||'').toLowerCase() === opts!.assignedTo!.toLowerCase())
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
      id,
      createdAt: now,
      updatedAt: now,
    })
    data.items.unshift(fresh)
  }
  await writeStore(data, gen)
  return (data.items.find(a => a.id === id)) as AppointmentT
}

export async function deleteAppointment(id: string) {
  const { data, gen } = await readStore()
  const next = { items: data.items.filter(a => a.id !== id) }
  await writeStore(next, gen)
}
