import "./../styles/globals.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import dynamic from 'next/dynamic';
const GlobalNewLeadButton = dynamic(() => import('@/components/NewLead'), { ssr: false });

export const metadata = {
  title: "HyTech Roofing CRM Starter",
  description: "CRM + Measurements + Proposals"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenantId = await getCurrentTenantId();
  let logoPath: string | null = null;
  if (tenantId) {
    try {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
      logoPath = t?.logoPath || null;
    } catch {}
  }
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex">
          <aside className="w-64 bg-slate-900 text-slate-100">
            <div className="p-5 text-xl font-semibold flex flex-col items-start gap-3">
              {logoPath ? (
                <img src={logoPath} alt="Company Logo" className="h-12 w-auto object-contain" />
              ) : null}
              <div>HyTech CRM</div>
            </div>
            <nav className="px-3 space-y-1">
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/leads">Pipeline</NavLink>
              <NavLink href="/calendar">Calendar</NavLink>
              <NavLink href="/jobs">Jobs</NavLink>
              <NavLink href="/payroll">Payroll</NavLink>
              <NavLink href="/customers">Customers</NavLink>
              <NavLink href="/settings">Settings</NavLink>
            </nav>
          </aside>
          <main className="flex-1">
            <header className="border-b bg-white">
              <div className="container-xl flex items-center justify-between h-14">
                <div className="font-semibold">Demo Tenant: HyTech</div>
                <div className="flex items-center gap-4">
                  <div className="hidden md:block text-sm text-slate-500">Signed in as Demo User</div>
                  <GlobalNewLeadButton />
                </div>
              </div>
            </header>
            <div className="container-xl py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-md hover:bg-slate-800 aria-[current=page]:bg-slate-800"
    >
      {children}
    </Link>
  );
}
