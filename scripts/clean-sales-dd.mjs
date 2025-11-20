#!/usr/bin/env node
// Remove placeholder 'dd' from SalesPaymentRequest rows.
import prisma from '../src/lib/db/index.js'

async function run(){
  const rows = await prisma.salesPaymentRequest.findMany({ where:{ salesUserName: 'dd' } })
  let updated = 0
  for (const r of rows){
    try {
      await prisma.salesPaymentRequest.update({ where:{ id: r.id }, data:{ salesUserName: null } })
      updated++
    } catch {}
  }
  console.log(`Cleaned ${updated} placeholder row(s).`)
  process.exit(0)
}
run().catch(e=> { console.error(e); process.exit(1) })