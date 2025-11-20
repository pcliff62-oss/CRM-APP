// One-off script to migrate legacy crew payment requests with rateTier 'sales' into SalesPaymentRequest entries.
// Usage: npx ts-node scripts/backfill-sales-payment-requests.ts (ensure ts-node installed) or compile via project tooling.
import prisma from '@/lib/db'

async function run() {
  const tenant = await prisma.tenant.findFirst()
  if (!tenant) throw new Error('No tenant found')
  const legacyAll = await prisma.crewPaymentRequest.findMany() as any[]
  const legacy = legacyAll.filter(r => String(r.rateTier||'').toLowerCase() === 'sales')
  if (!legacy.length) {
    console.log('No legacy sales-tagged crew payment requests found.')
    return
  }
  let migrated = 0
  for (const r of legacy) {
    try {
      const extrasArr = (() => { try { return JSON.parse(r.extrasJson||'[]') } catch { return [] } })()
      const grandTotal = Number.isFinite(Number(r.grandTotal)) ? Number(r.grandTotal) : Number(r.amount)||0
      // Attempt salesperson name from crewUserId
      let salesUserName: string | undefined = undefined
      let salesUserId: string | undefined = undefined
      if (r.crewUserId) {
        try { const u = await prisma.user.findFirst({ where: { id: r.crewUserId } }); if (u) { salesUserName = u.name; salesUserId = u.id } } catch {}
      }
      await prisma.salesPaymentRequest.create({ data: {
        tenantId: tenant.id,
        appointmentId: r.appointmentId || undefined,
        leadId: undefined,
        salesUserId,
        salesUserName,
        commissionPercent: undefined, // unknown legacy percent
        contractPrice: undefined,
        customerName: r.customerName || undefined,
        address: r.address || undefined,
        extrasJson: JSON.stringify(extrasArr),
        grandTotal: grandTotal || undefined,
        amount: Number(r.amount)||undefined,
        paid: r.paid || false,
        paidAt: r.paidAt || undefined,
      }})
      migrated++
    } catch (e:any) {
      console.warn('Failed migrate id', r.id, e.message)
    }
  }
  console.log(`Migrated ${migrated} legacy sales crew requests.`)
}

run().then(()=> prisma.$disconnect()).catch(e=> { console.error(e); prisma.$disconnect() })
