#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function run() {
  const toFix = await prisma.invoice.findMany({ where: { type: 'DEPOSIT', status: 'PENDING', paidAt: null } })
  if (!toFix.length) {
    console.log('No unpaid deposit invoices with status PENDING to backfill.')
    return
  }
  console.log(`Found ${toFix.length} deposit invoices to update -> status DEPOSIT`)
  let updated = 0
  for (const inv of toFix) {
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'DEPOSIT' } })
    updated++
  }
  console.log(`Updated ${updated} invoices.`)
  await prisma.$disconnect()
  process.exit(0)
}
run().catch(async e=> { console.error(e); try { await prisma.$disconnect() } catch {}; process.exit(1) })
