import { redirect } from "next/navigation";

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ period?: string; flow?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.period) query.set("period", params.period);
  if (params.flow) query.set("flow", params.flow);
  redirect(`/dashboard/emails/hotmart${query.size ? `?${query.toString()}` : ""}`);
}
