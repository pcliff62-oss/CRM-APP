import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { formatPhone } from "@/components/utils";

type ContactCard = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leads: Array<{ stage: string | null; property: { address1: string | null } | null }>
};

export default async function CustomersPage() {
  const contacts = await prisma.contact.findMany({
    include: { leads: { include: { property: true } } },
    orderBy: { name: "asc" }
  }) as unknown as ContactCard[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Customers</h1>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
  {contacts.map((c: ContactCard) => {
          const latest = c.leads[0];
          return (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{c.name}</span>
                  <Link href={`/customers/${c.id}`} className="text-sm text-brand-700 hover:underline">View</Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-1">
                <div>{c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a> : "—"}</div>
                <div>{c.phone ? <a href={`tel:${normalizeTel(c.phone)}`} className="text-blue-600 hover:underline">{formatPhone(c.phone)}</a> : "—"}</div>
                <div>Address: {latest?.property?.address1 ?? "—"}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function normalizeTel(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return digits;
}
