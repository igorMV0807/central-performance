import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar email={user.email} />
      <main className="min-w-0 flex-1 p-4 sm:p-7 lg:p-9">
        <div className="mx-auto w-full max-w-[1560px]">{children}</div>
      </main>
    </div>
  );
}
