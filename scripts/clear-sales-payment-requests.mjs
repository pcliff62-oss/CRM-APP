#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function run(){
  const count = await prisma.salesPaymentRequest.count()
  await prisma.salesPaymentRequest.deleteMany({})
  console.log(`Deleted ${count} sales payment request(s).`)
}

run()
  .catch(e=> { console.error(e); process.exit(1) })
  .finally(()=> prisma.$disconnect().then(()=> process.exit(0)))