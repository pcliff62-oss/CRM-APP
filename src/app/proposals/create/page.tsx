import Link from "next/link";

export default function CreateProposalPage({ searchParams }: { searchParams: { lead?: string } }) {
  const lead = searchParams.lead || "";
  const version = typeof Date !== 'undefined' ? Date.now() : 0;
  const url = `/proposal-app${lead ? `?lead=${encodeURIComponent(lead)}` : ''}${lead ? `&v=${version}` : `?v=${version}`}`;
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Create Proposal</h1>
        <Link href="/proposals" className="text-sm underline">Back to proposals</Link>
      </div>
      <iframe src={url} className="flex-1 w-full border rounded-md" />
      <div className="text-xs text-slate-500">Embedded HyTech Proposal app</div>
    </div>
  );
}
