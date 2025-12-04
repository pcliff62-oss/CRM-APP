import prisma from "@/lib/db";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

/**
 * DEMO AUTH STRATEGY
 * ---------------------------------------------------------------
 * This starter does not include a full auth system. To keep all
 * API routes functional out-of-the-box, we implement a permissive
 * fallback:
 *   1. Try to read an override user email from `x-user-email` header.
 *   2. Otherwise assume a demo user email `demo@hytech.local`.
 *   3. If that user does not exist, auto-create a demo Tenant + User.
 *   4. If creation somehow fails, fall back to the first existing user.
 *
 * This prevents 401 errors while experimenting locally. For production:
 *   - Replace with real session handling (NextAuth, Clerk, etc.)
 *   - Remove the auto-create logic.
 */

async function ensureDemoUser(email: string) {
  // See if user exists already
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  // Ensure at least one tenant exists (create demo tenant if not)
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: "Demo Tenant" } });
  }
  // Create demo user
  return prisma.user.create({
    data: {
      email,
      name: "Demo User",
  role: Role.ADMIN,
      tenantId: tenant.id
    }
  });
}

export async function getCurrentUser(req?: NextRequest) {
  const headerEmail = req?.headers.get("x-user-email");
  const email = headerEmail || "demo@hytech.local";
  try {
    // Normalize any legacy/invalid roles before any reads
    try {
      // Preserve MANAGER; only coerce truly invalid legacy roles
      await prisma.$executeRawUnsafe(
        "UPDATE \"User\" SET role = 'ADMIN' WHERE UPPER(role) = 'OWNER' OR role NOT IN ('ADMIN','SALES','CREW','EMPLOYEE','MANAGER')"
      );
    } catch {}
    return await ensureDemoUser(email);
  } catch (e) {
    // Final fallback: first user if something unexpected happened
    const first = await prisma.user.findFirst();
    return first ?? null;
  }
}

export async function getCurrentTenantId(req?: NextRequest) {
  const user = await getCurrentUser(req);
  return user?.tenantId ?? null;
}
