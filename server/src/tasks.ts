import { z } from 'zod'
import { bucket } from './gcs'
import { GCS_BUCKET } from './env'

const BUCKET: any = bucket
const KEY = 'app/tasks.json'

export const Task = z.object({
  id: z.string(),
  title: z.string().default(''),
  status: z.string().default('todo'),
  customerId: z.string().default(''),
  // New optional fields
  dueAt: z.string().optional(), // ISO date string
  dueDate: z.string().optional(), // Local date string YYYY-MM-DD
  priority: z.enum(['low','med','high']).optional().default('med'),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
})
export type TaskT = z.infer<typeof Task>

type Store = { items: TaskT[] }

function norm(v: any) { return typeof v === 'string' ? v.trim() : (v ?? '') }

function newId() {
  const letters = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `TASK-${Date.now()}-${letters}`
}

async function readStore(): Promise<{ data: Store; gen?: string }> {
  const file = BUCKET.file(KEY)
  try {
    const [meta] = await file.getMetadata({ preconditionOpts: { ifGenerationMatch: 0 } }).catch(()=>[undefined as any])
    const [buf] = await file.download()
    const raw = JSON.parse(buf.toString('utf8')) as Store
    const items = Array.isArray(raw.items) ? raw.items.map((it: any) => {
      // Normalize fields and ensure backward compatibility
      const pr = String(it?.priority || '').toLowerCase()
      const priority = (pr === 'low' || pr === 'med' || pr === 'high') ? pr : 'med'
      const dueRaw = typeof it?.dueAt === 'string' ? it.dueAt.trim() : undefined
      const dueAt = (dueRaw && !Number.isNaN(Date.parse(dueRaw))) ? dueRaw : undefined
      const ddRaw = typeof it?.dueDate === 'string' ? it.dueDate.trim() : undefined
      const dueDate = (ddRaw && /^\d{4}-\d{2}-\d{2}$/.test(ddRaw)) ? ddRaw : undefined
      return {
        ...it,
        title: norm(it?.title),
        status: norm(it?.status) || 'todo',
        customerId: norm(it?.customerId),
        priority,
        dueAt,
        dueDate,
      }
    }) : []
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

// Exposed utility per requirement
export async function readTasks(): Promise<Store> {
  const { data } = await readStore()
  return data
}

export async function writeTasks(store: Store, ifGenerationMatch?: string) {
  await writeStore(store, ifGenerationMatch)
}

export async function listTasks(): Promise<TaskT[]> {
  const { data } = await readStore()
  return data.items
}

export async function upsertTask(partial: Partial<TaskT> & { id?: string }): Promise<TaskT> {
  const { data, gen } = await readStore()
  const now = Date.now()
  const id = partial.id || newId()
  const idx = data.items.findIndex(t => t.id === id)
  const patch: Partial<TaskT> = { ...partial }
  if ('title' in partial) (patch as any).title = norm((partial as any).title)
  if ('status' in partial) (patch as any).status = norm((partial as any).status) || 'todo'
  // Normalize priority
  if ('priority' in partial) {
    const pr = String((partial as any).priority || '').toLowerCase()
    ;(patch as any).priority = (pr === 'low' || pr === 'med' || pr === 'high') ? pr : 'med'
  }
  // Normalize dueAt (drop if invalid)
  if ('dueAt' in partial) {
    const d = typeof (partial as any).dueAt === 'string' ? (partial as any).dueAt.trim() : undefined
    ;(patch as any).dueAt = (d && !Number.isNaN(Date.parse(d))) ? d : undefined
  }
  // Normalize dueDate (keep only YYYY-MM-DD)
  if ('dueDate' in partial) {
    const dd = typeof (partial as any).dueDate === 'string' ? (partial as any).dueDate.trim() : undefined
    ;(patch as any).dueDate = (dd && /^\d{4}-\d{2}-\d{2}$/.test(dd)) ? dd : undefined
  }
  if ('customerId' in partial) (patch as any).customerId = norm((partial as any).customerId)

  if (idx >= 0) {
    const merged = Task.parse({ ...data.items[idx], ...patch, id, updatedAt: now })
    data.items[idx] = merged
  } else {
    const fresh = Task.parse({
      title: norm((patch as any).title),
      status: norm((patch as any).status) || 'todo',
      priority: ((): any => {
        const pr = String((patch as any).priority || '').toLowerCase()
        return (pr === 'low' || pr === 'med' || pr === 'high') ? pr : 'med'
      })(),
      dueAt: ((): any => {
        const d = typeof (patch as any).dueAt === 'string' ? (patch as any).dueAt.trim() : undefined
        return (d && !Number.isNaN(Date.parse(d))) ? d : undefined
      })(),
      dueDate: ((): any => {
        const dd = typeof (patch as any).dueDate === 'string' ? (patch as any).dueDate.trim() : undefined
        return (dd && /^\d{4}-\d{2}-\d{2}$/.test(dd)) ? dd : undefined
      })(),
      customerId: norm((patch as any).customerId),
      id,
      createdAt: now,
      updatedAt: now,
    })
    data.items.unshift(fresh)
  }
  await writeStore(data, gen)
  return (data.items.find(t => t.id === id)) as TaskT
}

export async function deleteTask(id: string) {
  const { data, gen } = await readStore()
  const next = { items: data.items.filter(t => t.id !== id) }
  await writeStore(next, gen)
}
