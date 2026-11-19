import { PerfectPayMetricsPage } from "@/components/perfectpay-metrics-page";

export const dynamic = "force-dynamic";

export default function PerfectPayEmailsPage({ searchParams }: { searchParams: Promise<{ period?: string; flow?: string }> }) {
  return <PerfectPayMetricsPage searchParams={searchParams} />;
}
