import Link from "next/link";
import MaterialsClient from "./ui/MaterialsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page({ searchParams }: { searchParams: { lead?: string } }) {
  const leadId = searchParams.lead || "";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Material Order Form</h1>
        <Link href="/customers" className="text-sm underline">Back to customers</Link>
      </div>
      <MaterialsClient leadId={leadId} />
    </div>
  );
}
