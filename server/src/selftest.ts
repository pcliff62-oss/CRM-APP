import { storage } from './gcs'
import { GCS_BUCKET } from './env'
import { listCustomers, upsertCustomer, deleteCustomer } from './customers'

export async function runSelfTest() {
  const t0 = Date.now()
  const bucket = storage.bucket(GCS_BUCKET)

  // GCS temp object smoke test
  const key = `diagnostics/selftest_${Date.now()}_${Math.random().toString(36).slice(2,7)}.txt`
  const file = bucket.file(key)
  let gcsWrite=false, gcsRead=false, gcsDelete=false
  try {
    await file.save(Buffer.from('selftest-ok'), { contentType: 'text/plain' })
    gcsWrite = true
    const [buf] = await file.download()
    gcsRead = buf.toString('utf8') === 'selftest-ok'
    await file.delete()
    gcsDelete = true
  } catch (e:any) {
    // leave flags as-is; report error below
  }

  // Customers store test (create, list, delete test record)
  let customersOk=false, customersCount=0, customerId: string | null = null
  try {
    const before = await listCustomers()
    customersCount = before.length
    const temp = await upsertCustomer({ name: 'SELFTEST' })
    customerId = temp.id
    const after = await listCustomers()
    customersOk = Array.isArray(after) && after.length >= customersCount
    if (customerId) await deleteCustomer(customerId)
  } catch (e:any) {
    customersOk = false
  }

  const ok = gcsWrite && gcsRead && gcsDelete && customersOk
  return {
    ok,
    tookMs: Date.now() - t0,
    gcs: { write: gcsWrite, read: gcsRead, delete: gcsDelete, bucket: GCS_BUCKET },
    customers: { ok: customersOk, count: customersCount },
    now: new Date().toISOString()
  }
}
