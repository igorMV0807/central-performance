import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { FlowFilter } from "@/components/flow-filter";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PeriodFilter } from "@/components/period-filter";
import { formatDateTime } from "@/lib/format";
import { getAlerts } from "@/lib/data";
import { getPerfectPayEmailAnalytics, type PerfectPayHealthIssue } from "@/lib/perfectpay-email-analytics";
import type { Period } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function AlertsPage({ searchParams }: {
  searchParams: Promise<{ period?: string; flow?: string }>;
}) {
  const params = await searchParams;
  const period: Period = ["today", "7d", "30d", "90d", "all"].includes(params.period || "") ? (params.period as Period) : "30d";
  const flow = String(params.flow || "").toUpperCase();
  const [data, perfectPay] = await Promise.all([
    getAlerts(period, flow),
    getPerfectPayEmailAnalytics(period, flow),
  ]);
  const total = data.total + perfectPay.healthSummary.critical + perfectPay.healthSummary.warning + perfectPay.healthSummary.info;
  const critical = data.critical + perfectPay.healthSummary.critical;
  const warning = data.warning + perfectPay.healthSummary.warning;
  const info = data.info + perfectPay.healthSummary.info;

  return (
    <>
      <PageHeader eyebrow="Problemas" title="O que precisa de atenção" description="O painel verifica Hotmart e PerfectPay e identifica claramente a plataforma de cada ocorrência.">
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh />
          <PeriodFilter current={period} basePath="/dashboard/alertas" params={{ flow }} />
        </div>
      </PageHeader>
      <FlowFilter current={flow} basePath="/dashboard/alertas" params={{ period }} />

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total encontrado" value={String(total)} hint="Hotmart + PerfectPay no filtro" tone="slate" />
        <MetricCard label="Críticos" value={String(critical)} hint="Podem impedir ou duplicar envios" tone="rose" />
        <MetricCard label="Atenção" value={String(warning)} hint="Precisam ser acompanhados" tone="amber" />
        <MetricCard label="Informativos" value={String(info)} hint="Sem ação urgente" tone="blue" />
      </section>

      {total === 0 ? (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
          <h2 className="mt-3 text-lg font-semibold text-emerald-950">Nenhum problema encontrado</h2>
          <p className="mt-1 text-sm text-emerald-800">A automação está saudável dentro do período selecionado.</p>
        </section>
      ) : (
        <section className="mt-6 space-y-3">
          {perfectPay.healthIssues.map((issue) => (
            <PerfectPayAlert key={`${issue.severity}-${issue.title}`} issue={issue} at={perfectPay.system.lastEventAt} />
          ))}
          {data.alerts.map((alert) => (
            <article key={alert.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${alert.severity === "critical" ? "border-rose-200" : alert.severity === "warning" ? "border-amber-200" : "border-blue-200"}`}>
              <div className="flex items-start gap-4">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${alert.severity === "critical" ? "bg-rose-50 text-rose-600" : alert.severity === "warning" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
                  {alert.severity === "critical" ? <CircleAlert size={20} /> : alert.severity === "warning" ? <AlertTriangle size={20} /> : <Info size={20} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">Hotmart</span><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{alert.category}</span><span className="text-xs text-slate-400">{formatDateTime(alert.at)}</span>{isHistorical(alert.at) && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">registro antigo</span>}</div>
                  <h2 className="mt-1 font-semibold text-slate-950">{alert.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{alert.detail}</p>
                  {(alert.buyerName || alert.buyerEmail) && <p className="mt-2 text-sm text-slate-500">{alert.buyerName || "Cliente"}{alert.buyerEmail ? ` · ${alert.buyerEmail}` : ""}</p>}
                </div>
                {alert.journeyId && <Link href={`/dashboard/jornadas/${alert.journeyId}`} className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Ver jornada</Link>}
              </div>
            </article>
          ))}
        </section>
      )}

      <p className="mt-5 text-xs text-slate-400">Verificação atualizada em {formatDateTime(data.checkedAt)}. O painel considera 15 minutos de tolerância antes de marcar um envio como atrasado. Registros antigos continuam visíveis para auditoria, mas não são reenviados automaticamente.</p>
    </>
  );
}

function PerfectPayAlert({ issue, at }: { issue: PerfectPayHealthIssue; at: string | null }) {
  const critical = issue.severity === "critical";
  const warning = issue.severity === "warning";
  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm ${critical ? "border-rose-200" : warning ? "border-amber-200" : "border-blue-200"}`}>
      <div className="flex items-start gap-4">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${critical ? "bg-rose-50 text-rose-600" : warning ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
          {critical ? <CircleAlert size={20} /> : warning ? <AlertTriangle size={20} /> : <Info size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">PerfectPay</span>
            <span className="text-xs text-slate-400">{formatDateTime(at)}</span>
          </div>
          <h2 className="mt-1 font-semibold text-slate-950">{issue.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{issue.detail}</p>
        </div>
        <strong className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{issue.count}</strong>
      </div>
    </article>
  );
}

function isHistorical(value: string | null) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return timestamp > 0 && timestamp < Date.now() - 24 * 60 * 60 * 1000;
}
