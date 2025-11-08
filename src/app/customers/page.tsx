import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { formatPhone } from "@/components/utils";
import dynamic from "next/dynamic";
const CustomersClient = dynamic<{ initial: ContactCard[] }>(() => import("@/app/customers/CustomersClient"), { ssr: false });

type ContactCard = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  flagColor?: 'red'|'yellow'|'green'|null;
  leads: Array<{ stage: string | null; property: { address1: string | null } | null }>
};

export default async function CustomersPage() {
  const contacts = await prisma.contact.findMany({
  include: { leads: { include: { property: true } } },
    orderBy: { name: "asc" }
  }) as unknown as ContactCard[];

  return (
    <CustomersClient initial={contacts} />
  );
}

function normalizeTel(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return digits;
}
