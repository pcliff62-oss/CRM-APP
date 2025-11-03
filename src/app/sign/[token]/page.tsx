import { redirect } from "next/navigation";

export default function SignRedirect({ params }: { params: { token: string } }) {
  // Redirect old e-link route to the new scaffold-based view
  redirect(`/p/${encodeURIComponent(params.token)}/view`);
}
