import { PlatformEmailsPage } from "@/components/platform-emails-page";

export const dynamic = "force-dynamic";

export default function HotmartEmailsPage({ searchParams }: { searchParams: Promise<{ period?: string; flow?: string }> }) {
  return <PlatformEmailsPage platform="hotmart" searchParams={searchParams} />;
}
