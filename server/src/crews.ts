import { z } from 'zod'
import { bucket } from './gcs'

const BUCKET: any = bucket
const KEY = 'app/crews.json'

export const Crew = z.object({
  id: z.string(),
  name: z.string().min(1),
  ratePerSquare: z.number().nonnegative().default(0),
  members: z.array(z.object({ id: z.string(), name: z.string().default('') })).default([]),
  tenantId: z.string().optional(),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
})
export type CrewT = z.infer<typeof Crew>

type Store = { items: CrewT[] }

function norm(v: any) { return typeof v === 'string' ? v.trim() : (v ?? '') }

async function readStore(): Promise<{ data: Store; gen?: string }> {
  const file = BUCKET.file(KEY)
  try {
    const [meta] = await file.getMetadata({ preconditionOpts: { ifGenerationMatch: 0 } }).catch(()=>[undefined as any])
    const [buf] = await file.download()
    const raw = JSON.parse(buf.toString('utf8')) as Store
    const items = Array.isArray(raw.items) ? raw.items.map((it:any) => ({
      ...it,
      id: String(it?.id || ''),
      name: norm(it?.name),
      ratePerSquare: Number(it?.ratePerSquare ?? 0) || 0,
      members: Array.isArray(it?.members) ? it.members.map((m:any)=>({ id: String(m?.id||'').trim(), name: norm(m?.name) })) : [],
      tenantId: norm(it?.tenantId),
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

function newId() { return `CREW-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2,6).toUpperCase()}` }

export async function listCrews(): Promise<CrewT[]> {
  const { data } = await readStore()
  return data.items
}

export async function upsertCrew(partial: Partial<CrewT> & { id?: string }): Promise<CrewT> {
  const { data, gen } = await readStore()
  const now = Date.now()
  const id = partial.id || newId()
  const idx = data.items.findIndex(c => c.id === id)
  const patch: Partial<CrewT> = { ...partial }
  if ('name' in partial) (patch as any).name = norm((partial as any).name)
  if ('ratePerSquare' in partial) (patch as any).ratePerSquare = Number((partial as any).ratePerSquare) || 0
  if ('members' in partial) (patch as any).members = Array.isArray((partial as any).members) ? (partial as any).members.map((m:any)=>({ id: String(m?.id||'').trim(), name: norm(m?.name) })) : []

  if (idx >= 0) {
    const merged = Crew.parse({ ...data.items[idx], ...patch, id, updatedAt: now })
    data.items[idx] = merged
  } else {
    const fresh = Crew.parse({
      id,
      name: norm((patch as any).name) || 'Crew',
      ratePerSquare: Number((patch as any).ratePerSquare) || 0,
      members: Array.isArray((patch as any).members) ? (patch as any).members : [],
      tenantId: norm((patch as any).tenantId),
      createdAt: now,
      updatedAt: now,
    })
    data.items.unshift(fresh)
  }
  try {
    await writeStore(data, gen)
  } catch (e:any) {
    throw new Error('Persist crew failed: ' + String(e?.message||e))
  }
  return (data.items.find(c => c.id === id)) as CrewT
}

export async function deleteCrew(id: string) {
  const { data, gen } = await readStore()
  const next = { items: data.items.filter(c => c.id !== id) }
  await writeStore(next, gen)
}
