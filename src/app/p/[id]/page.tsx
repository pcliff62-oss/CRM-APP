import { redirect } from "next/navigation";

export default function ProposalIndexRedirect({ params }: { params: { id: string } }) {
  redirect(`/p/${encodeURIComponent(params.id)}/view`);
}
