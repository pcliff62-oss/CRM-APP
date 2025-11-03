/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const tenant = await db.tenant.upsert({
    where: { id: "demo-tenant" },
    update: {},
    create: { id: "demo-tenant", name: "HyTech Demo" }
  });

  const user = await db.user.upsert({
    where: { email: "demo@hytech.local" },
    update: {},
    create: { email: "demo@hytech.local", name: "Demo User", role: "Owner", tenantId: tenant.id }
  });

  const contact = await db.contact.create({
    data: {
      tenantId: tenant.id,
      name: "Jane Homeowner",
      email: "jane@example.com",
      phone: "555-0123"
    }
  });

  const property = await db.property.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      address1: "123 Main St",
      city: "Anytown",
      state: "NY",
      postal: "11111",
      lat: 40.7128,
      lng: -74.0060
    }
  });

  const lead = await db.lead.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      propertyId: property.id,
      title: "Asphalt reroof",
      stage: "INSPECTION",
      source: "Web",
      estimator: "Alex",
      probability: 50
    }
  });

  await db.proposal.create({
    data: {
      tenantId: tenant.id,
      leadId: lead.id,
      templateName: "Retail Reroof",
      templateBody: "<h1>Proposal for {{customer.name}}</h1><p>Scope: Asphalt reroof at {{property.address}}</p><p>Total squares: {{measure.totalSquares}}</p><p>Price: ${{estimate.total}}</p><p>Sign below to accept.</p>"
    }
  });

  // Seed a sample appointment
  await db.appointment.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      leadId: lead.id,
      title: "Initial inspection",
      description: "Meet homeowner and inspect roof",
      start: new Date(Date.now() + 24 * 60 * 60 * 1000),
      end: new Date(Date.now() + 25 * 60 * 60 * 1000),
      allDay: false
    }
  });

  console.log("Seeded ✔");
}

main().finally(() => db.$disconnect());
