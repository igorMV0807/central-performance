"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BellRing, ChartNoAxesCombined, FlaskConical, Gauge, LogOut, Mail, Route, ShieldCheck } from "lucide-react";

const primary = [
  { href: "/dashboard", label: "Visão geral", icon: Gauge, exact: true },
  { href: "/dashboard/emails/hotmart", label: "E-mails Hotmart", icon: Mail },
  { href: "/dashboard/emails/perfectpay", label: "E-mails PerfectPay", icon: Mail },
  { href: "/dashboard/laboratorio", label: "Laboratório", icon: FlaskConical },
  { href: "/dashboard/alertas", label: "Problemas", icon: BellRing },
];
const advanced = [
  { href: "/dashboard/jornadas", label: "Jornadas", icon: Route },
  { href: "/dashboard/eventos", label: "Eventos", icon: Activity },
];

type NavItem = { href: string; label: string; icon: typeof Gauge; exact?: boolean };

export function Sidebar({ email }: { email?: string | null }) {
  const pathname = usePathname();
  return (
    <aside className="border-b border-slate-800 bg-slate-950 text-white lg:sticky lg:top-0 lg:min-h-screen lg:w-64 lg:self-start lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col p-4 lg:min-h-screen lg:p-5">
        <Link href="/dashboard" className="mb-5 flex items-center gap-3 lg:mb-8">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-violet-600 shadow-lg shadow-blue-950/30"><ChartNoAxesCombined size={21} /></div>
          <div>
            <div className="text-sm font-semibold">Central de Performance</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Em produção</div>
          </div>
        </Link>

        <nav className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <NavGroup title="Principal" links={primary} pathname={pathname} />
          <NavGroup title="Avançado" links={advanced} pathname={pathname} />
        </nav>

        <div className="mt-5 border-t border-white/10 pt-4 lg:mt-auto">
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-400">
            <ShieldCheck size={15} className="text-emerald-400" /><span className="truncate">{email || "Acesso protegido"}</span>
          </div>
          <form action="/auth/signout" method="post">
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"><LogOut size={18} /> Sair</button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function NavGroup({ title, links, pathname }: { title: string; links: NavItem[]; pathname: string }) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">{title}</p>
      <div className="grid gap-1 sm:grid-cols-3 lg:grid-cols-1">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-blue-600 text-white shadow-md shadow-blue-950/30" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon size={18} /> {label}</Link>;
        })}
      </div>
    </div>
  );
}
