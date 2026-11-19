import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { RevenueLineChart, StepBarChart } from "@/components/charts";
import { FlowFilter, flowLabel } from "@/components/flow-filter";
import { Funnel } from "@/components/funnel";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PeriodFilter } from "@/components/period-filter";
import { StatusBadge } from "@/components/status-badge";
import { ViewMode } from "@/components/view-mode";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { getOverview } from "@/lib/data";
import { getPerfectPayEmailAnalytics } from "@/lib/perfectpay-email-analytics";
import type { Period } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ period?: string; flow?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const period: Period = ["today", "7d", "30d", "90d", "all"].includes(params.period || "")
    ? (params.period as Period)
    : "30d";
  const flow = String(params.flow || "").toUpperCase();
  const mode = params.mode === "advanced" ? "advanced" : "simple";
  const [data, perfectPay] = await Promise.all([
    getOverview(period, flow),
    getPerfectPayEmailAnalytics(period, flow),
  ]);
  const totalEntries = Number(data.funnel[0]?.value || 0) + perfectPay.enteredJourneys;
  const totalSent = data.emailsSent + perfectPay.totalSent;
  const totalTracked = data.trackedEmails + perfectPay.trackedSent;
  const totalClicks = data.uniqueClicks + perfectPay.uniqueClicks;
  const exactPurchases = data.recoveredSales + perfectPay.conversionsWithClick;
  const exactRevenue = data.recoveredRevenue + perfectPay.recoveredRevenueWithClick;
  const attributedPurchases = data.historicalRecoveredSales + perfectPay.conversionsWithoutClick;
  const attributedRevenue = data.historicalRecoveredRevenue + perfectPay.recoveredRevenueWithoutClick;
  const activeRecoveries = data.activeRecoveries + perfectPay.activeRecoveries;
  const currentProblems = data.health.totalActionable + perfectPay.healthSummary.critical + perfectPay.healthSummary.warning;
  const healthy = currentProblems === 0;

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Como está a recuperação?"
        description={`Acompanhe Hotmart e PerfectPay${flow ? ` na jornada de ${flowLabel(flow).toLowerCase()}` : " no mesmo resumo"}, sem misturar atribuição com compra comprovada.`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh />
          <PeriodFilter current={period} basePath="/dashboard" params={{ flow, mode: mode === "advanced" ? mode : undefined }} />
        </div>
      </PageHeader>

      <section className={`mb-5 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${healthy ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${healthy ? "bg-emerald-600" : "bg-amber-500"}`}>
            {healthy ? <CheckCircle2 size={21} /> : <AlertTriangle size={21} />}
          </div>
          <div>
            <p className="font-semibold text-slate-950">
              {healthy ? "Sistema funcionando normalmente" : "Há pontos que precisam de atenção"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {healthy ? `${activeRecoveries} jornada(s) estão sendo acompanhadas agora nas duas plataformas.` : `${currentProblems} ocorrência(s) foram identificadas entre Hotmart e PerfectPay.`}
            </p>
          </div>
        </div>
        <Link href={`/dashboard/alertas?period=${period}${flow ? `&flow=${flow}` : ""}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-950 hover:text-blue-700">
          Ver central de problemas <ChevronRight size={16} />
        </Link>
      </section>

      <FlowFilter current={flow} basePath="/dashboard" params={{ period, mode: mode === "advanced" ? mode : undefined }} />

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Entradas recuperáveis" value={String(totalEntries)} hint="Hotmart + PerfectPay no período" tone="slate" />
        <MetricCard label="E-mails enviados" value={String(totalSent)} hint={`${totalTracked} com link rastreável`} tone="blue" />
        <MetricCard label="Cliques únicos" value={String(totalClicks)} hint={`CTR ${formatPercent(totalTracked ? (totalClicks / totalTracked) * 100 : 0)}`} tone="violet" />
        <MetricCard label="Compras com clique" value={String(exactPurchases)} hint="Comprovação pelo link rastreado" tone="emerald" />
        <MetricCard label="Receita com clique" value={formatMoney(exactRevenue)} hint="Receita com atribuição comprovada" tone="amber" />
        <MetricCard label="Compras atribuídas" value={String(attributedPurchases)} hint="Históricas ou sem clique registrado" tone="emerald" />
        <MetricCard label="Receita atribuída" value={formatMoney(attributedRevenue)} hint="Associação temporal, não causalidade" tone="amber" />
        <MetricCard label="Em recuperação agora" value={String(activeRecoveries)} hint="Jornadas elegíveis nas duas plataformas" tone="rose" />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <PlatformSummary
          name="Hotmart"
          href={`/dashboard/emails/hotmart?period=${period}${flow ? `&flow=${flow}` : ""}`}
          entries={Number(data.funnel[0]?.value || 0)}
          sent={data.emailsSent}
          clicks={data.uniqueClicks}
          exact={data.recoveredSales}
          attributed={data.historicalRecoveredSales}
        />
        <PlatformSummary
          name="PerfectPay"
          href={`/dashboard/emails/perfectpay?period=${period}${flow ? `&flow=${flow}` : ""}`}
          entries={perfectPay.enteredJourneys}
          sent={perfectPay.totalSent}
          clicks={perfectPay.uniqueClicks}
          exact={perfectPay.conversionsWithClick}
          attributed={perfectPay.conversionsWithoutClick}
        />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-kicker">Detalhamento · Hotmart</p>
            <h2 className="text-lg font-semibold">Pessoas atribuídas à recuperação na Hotmart</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              “Clique confirmado” prova a atribuição pelo link rastreado. “Histórica” indica uma recuperação registrada antes do rastreamento exato.
            </p>
          </div>
          <span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            {data.recoveredCustomers.length} comprador(es)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Comprovação</th>
                <th className="px-5 py-3">Jornada</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Compra</th>
                <th className="px-5 py-3">Receita</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.recoveredCustomers.length ? data.recoveredCustomers.map((customer) => (
                <tr key={customer.key} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{customer.buyerName || "Cliente"}</p>
                    <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{customer.buyerEmail || "E-mail não disponível"}</p>
                  </td>
                  <td className="px-5 py-4">
                    <RecoverySource value={customer.source} />
                  </td>
                  <td className="px-5 py-4">{flowLabel(customer.flow)}</td>
                  <td className="px-5 py-4">{customer.step ? `E-mail ${customer.step}` : "—"}</td>
                  <td className="px-5 py-4 text-slate-500">{formatDateTime(customer.purchasedAt)}</td>
                  <td className="px-5 py-4 font-semibold">{formatMoney(customer.revenue)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/dashboard/jornadas/${customer.journeyId}`} className="font-semibold text-blue-700 hover:text-blue-900">
                      Ver jornada
                    </Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="px-5 py-8 text-center text-slate-400" colSpan={7}>
                    Nenhuma recuperação encontrada no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-5">
          <p className="section-kicker">Funil · Hotmart</p>
          <h2 className="text-lg font-semibold text-slate-950">Onde as pessoas estão parando na Hotmart</h2>
          <p className="mt-1 text-sm text-slate-500">Da entrada na Hotmart até a compra atribuída ao clique.</p>
        </div>
        <Funnel items={data.funnel} />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Sequência · Hotmart</p>
            <h2 className="text-lg font-semibold">E-mail 1 × E-mail 2 × E-mail 3</h2>
            <p className="mt-1 text-sm text-slate-500">CTR e conversão consideram apenas os novos links rastreáveis.</p>
          </div>
          <Link href={`/dashboard/emails/hotmart?period=${period}${flow ? `&flow=${flow}` : ""}`} className="text-sm font-semibold text-blue-700">
            Ver Hotmart completa
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Contato</th>
                <th className="px-5 py-3">Enviados</th>
                <th className="px-5 py-3">Rastreáveis</th>
                <th className="px-5 py-3">Cliques</th>
                <th className="px-5 py-3">CTR</th>
                <th className="px-5 py-3">Compras</th>
                <th className="px-5 py-3">Conversão</th>
                <th className="px-5 py-3">Receita</th>
              </tr>
            </thead>
            <tbody>
              {data.sequence.map((row) => (
                <tr key={row.step} className="border-t border-slate-100">
                  <td className="px-5 py-4 font-semibold">E-mail {row.step}</td>
                  <td className="px-5 py-4">{row.sent}</td>
                  <td className="px-5 py-4">{row.tracked}</td>
                  <td className="px-5 py-4">{row.clicks}</td>
                  <td className="px-5 py-4 font-medium text-blue-700">{formatPercent(row.clickRate)}</td>
                  <td className="px-5 py-4">{row.recovered}</td>
                  <td className="px-5 py-4 font-medium text-emerald-700">{formatPercent(row.conversionRate)}</td>
                  <td className="px-5 py-4 font-semibold">{formatMoney(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[.85fr_1.5fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="section-kicker">Resultado · Hotmart</p>
          <h2 className="text-lg font-semibold">Compras por jornada na Hotmart</h2>
          <div className="mt-4 space-y-3">
            {data.byFlow.length ? data.byFlow.map((row) => (
              <div key={row.flow} className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                <div>
                  <p className="text-sm font-semibold">{flowLabel(row.flow)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.recovered} compra(s)</p>
                </div>
                <strong className="text-sm">{formatMoney(row.revenue)}</strong>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                As compras aparecerão aqui após os primeiros cliques rastreados.
              </div>
            )}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-200 p-5">
            <div>
              <p className="section-kicker">Agora · Hotmart</p>
              <h2 className="text-lg font-semibold">Jornadas recentes da Hotmart</h2>
            </div>
            <Link href="/dashboard/jornadas" className="text-sm font-semibold text-blue-700">Ver todas</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Etapa</th>
                  <th className="px-5 py-3">Recuperada</th>
                </tr>
              </thead>
              <tbody>
                {data.recentJourneys.map((journey) => (
                  <tr key={journey.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link className="font-semibold hover:text-blue-700" href={`/dashboard/jornadas/${journey.id}`}>
                        {journey.buyer_name || journey.buyer_email || `#${journey.id}`}
                      </Link>
                    </td>
                    <td className="px-5 py-4"><StatusBadge value={journey.current_status} /></td>
                    <td className="px-5 py-4">{Number(journey.last_step_sent || 0)}</td>
                    <td className="px-5 py-4">{journey.dashboardRecovery.recovered ? "Sim" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-5">
        <p className="text-sm font-medium text-slate-600">Detalhes técnicos da Hotmart</p>
        <ViewMode current={mode} basePath="/dashboard" params={{ period, flow }} />
      </div>

      {mode === "advanced" && (
        <>
          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Duplicidades ignoradas pelo Motor", value: data.health.possibleDuplicateGroups, informational: true },
              { label: "Eventos com erro", value: data.health.eventsWithError },
              { label: "Não processados", value: data.health.unprocessedEvents },
              { label: "Envios atrasados", value: data.health.dueNow },
              { label: "Sem próximo horário", value: data.health.withoutNextStep },
              { label: "Envios travados", value: data.health.stuckClaims },
              { label: "E-mail após compra", value: data.health.emailsAfterPurchase },
              { label: "Links ou cupons", value: data.health.brokenCheckoutLinks },
            ].map(({ label, value, informational }) => (
              <div key={label} className={`rounded-xl border p-4 ${Number(value) > 0 && !informational ? "border-amber-200 bg-amber-50" : informational && Number(value) > 0 ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
                {informational && Number(value) > 0 && <p className="mt-1 text-xs text-blue-700">Apenas a jornada mais recente recebe e-mail.</p>}
              </div>
            ))}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <h2 className="text-lg font-semibold">Receita recuperada por dia</h2>
              <p className="mb-5 mt-1 text-sm text-slate-500">Somente compras atribuídas pelo novo rastreamento.</p>
              <RevenueLineChart data={data.revenueByDay} />
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <h2 className="text-lg font-semibold">Compras recuperadas por e-mail</h2>
              <p className="mb-5 mt-1 text-sm text-slate-500">Mostra qual contato recebeu o último clique antes da compra.</p>
              <StepBarChart data={data.byStep} />
            </article>
          </section>
        </>
      )}

      <p className="mt-6 text-xs leading-5 text-slate-400">
        Cliques e compras são medidos a partir da ativação do novo rastreamento. Abertura, entrega final e rejeição ainda não possuem uma fonte confiável.
      </p>
    </>
  );
}

function PlatformSummary({
  name,
  href,
  entries,
  sent,
  clicks,
  exact,
  attributed,
}: {
  name: string;
  href: string;
  entries: number;
  sent: number;
  clicks: number;
  exact: number;
  attributed: number;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-kicker">Plataforma</p>
          <h2 className="text-lg font-semibold">{name}</h2>
        </div>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
          Abrir detalhes <ChevronRight size={16} />
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <SummaryValue label="Entradas" value={entries} />
        <SummaryValue label="Enviados" value={sent} />
        <SummaryValue label="Cliques" value={clicks} />
        <SummaryValue label="Com clique" value={exact} />
        <SummaryValue label="Atribuídas" value={attributed} />
      </div>
    </article>
  );
}

function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function RecoverySource({ value }: { value: "tracked" | "historical" | "inferred" }) {
  if (value === "tracked") {
    return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Clique confirmado</span>;
  }
  if (value === "inferred") {
    return <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">Inferida</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Histórica</span>;
}
