import { z } from 'zod'
import { bucket } from './gcs'
import { GCS_BUCKET } from './env'

const BUCKET: any = bucket
const KEY = 'app/customers.json'

export const Customer = z.object({
  id: z.string(),
  name: z.string().default(''),
  town: z.string().optional().default(''),
  status: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  address: z.string().optional().default(''),
  assignedTo: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
})
export type CustomerT = z.infer<typeof Customer>

type Store = { items: CustomerT[] }

// Ensure string values for optional fields; trim strings
function norm(v: any) { return typeof v === 'string' ? v.trim() : (v ?? ''); }

async function readStore(): Promise<{ data: Store; gen?: string }> {
  const file = BUCKET.file(KEY)
  try {
    const [meta] = await file.getMetadata({ preconditionOpts: { ifGenerationMatch: 0 } }).catch(()=>[undefined as any])
    const [buf] = await file.download()
    const raw = JSON.parse(buf.toString('utf8')) as Store
    // Backwards-compat: ensure town/status keys exist on all items.
    // If legacy records used `city`, promote it to `town` when `town` is empty.
  const items = Array.isArray(raw.items) ? raw.items.map((it: any) => {
      const legacyCity = norm((it as any)?.city)
      const townVal = norm((it as any)?.town) || legacyCity
      return {
        ...it,
        town: townVal,
        status: norm((it as any)?.status),
    assignedTo: norm((it as any)?.assignedTo),
      }
    }) : []
    return { data: { items } as Store, gen: meta?.generation }
  } catch {
    // seed empty store if missing
    return { data: { items: [] }, gen: undefined }
  }
}

async function writeStore(next: Store, ifGenerationMatch?: string) {
  const file = BUCKET.file(KEY)
  const body = Buffer.from(JSON.stringify(next))
  const opts: any = { contentType: 'application/json' }
  if (ifGenerationMatch) {
    opts.preconditionOpts = { ifGenerationMatch: Number(ifGenerationMatch) }
  }
  await file.save(body, opts)
}

export async function listCustomers(): Promise<CustomerT[]> {
  const { data } = await readStore()
  return data.items
}

export async function getCustomer(id: string): Promise<CustomerT | null> {
  const { data } = await readStore()
  return data.items.find(c => c.id === id) ?? null
}

export async function upsertCustomer(partial: Partial<CustomerT> & { id?: string }): Promise<CustomerT> {
  const { data, gen } = await readStore()
  const now = Date.now()
  let id = partial.id ?? `CUST-${now.toString().slice(-6)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
  const idx = data.items.findIndex(i => i.id === id)
  // Normalize optional text fields, but only override when explicitly provided
  const patch: Partial<CustomerT> = { ...partial }
  // Accept legacy `city` as a source for town if provided
  if ('town' in partial || 'city' in (partial as any)) (patch as any).town = norm((partial as any).town || (partial as any).city)
  if ('status' in partial) (patch as any).status = norm((partial as any).status)
  if ('assignedTo' in partial) (patch as any).assignedTo = norm((partial as any).assignedTo)
  if (idx >= 0) {
    const merged = Customer.parse({ ...data.items[idx], ...patch, id, updatedAt: now })
    data.items[idx] = merged
  } else {
    const fresh = Customer.parse({
      ...patch,
      town: norm((patch as any).town),
      status: norm((patch as any).status),
  assignedTo: norm((patch as any).assignedTo),
      id,
      createdAt: now,
      updatedAt: now,
    })
    data.items.unshift(fresh)
  }
  await writeStore(data, gen)
  return (await getCustomer(id))!
}

export async function createCustomer(input: Partial<CustomerT>): Promise<CustomerT> {
  const { data, gen } = await readStore()
  const now = Date.now()
  const id = `CUST-${now.toString().slice(-6)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
  const fresh = Customer.parse({
    ...input,
    town: norm((input as any).town || (input as any).city),
    status: norm((input as any).status) || '',
    id,
    createdAt: now,
    updatedAt: now,
  })
  data.items.unshift(fresh)
  await writeStore(data, gen)
  return fresh
}

export async function deleteCustomer(id: string) {
  const { data, gen } = await readStore()
  const next = { items: data.items.filter(i => i.id !== id) }
  await writeStore(next, gen)
}
