import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Page() {
  const [leadCount, proposalCount, measurementCount] = await Promise.all([
    prisma.lead.count(),
    prisma.proposal.count(),
    prisma.measurement.count()
  ]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Stat title="Leads" value={leadCount} />
      <Stat title="Proposals" value={proposalCount} />
      <Stat title="Measurements" value={measurementCount} />

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle>Welcome 👋</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">
            This starter includes a working Leads list, a DIY roof measurement tool (MapLibre + draw), and a simple
            proposal templating preview. Use it as a base for your roofing CRM.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent><div className="text-3xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}
