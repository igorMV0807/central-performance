import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  MailCheck,
  MousePointerClick,
  ShieldCheck,
  ShoppingCart,
  Wifi,
} from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { FlowFilter, flowLabel } from "@/components/flow-filter";
import { Funnel } from "@/components/funnel";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PeriodFilter } from "@/components/period-filter";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { getPerfectPayEmailAnalytics, type PerfectPayHealthIssue } from "@/lib/perfectpay-email-analytics";
import type { Period } from "@/types/domain";

export async function PerfectPayMetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; flow?: string }>;
}) {
  const params = await searchParams;
  const period: Period = ["today", "7d", "30d", "90d", "all"].includes(params.period || "")
    ? (params.period as Period)
    : "30d";
  const flow = String(params.flow || "").toUpperCase();
  const data = await getPerfectPayEmailAnalytics(period, flow);
  const basePath = "/dashboard/emails/perfectpay";

  return (
    <>
      <PageHeader
        eyebrow="Métricas · PerfectPay"
        title="Do evento até a receita recuperada"
        description="Veja quantas etapas deveriam sair, quantas foram enviadas, onde os clientes clicaram e quais compras foram atribuídas à recuperação."
      >
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh />
          <PeriodFilter current={period} basePath={basePath} params={{ flow }} />
        </div>
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <PlatformLink href="/dashboard/emails/hotmart" label="Hotmart" detail="Métricas separadas" />
        <PlatformLink href="/dashboard/emails/perfectpay" label="PerfectPay" detail="Funil completo" active />
      </div>

      <FlowFilter current={flow} basePath={basePath} params={{ period }} />

      {data.conversions > 0 && (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 shrink-0 text-amber-700" size={20} />
            <div>
              <h2 className="font-semibold text-amber-950">Atribuição não é o mesmo que compra comprovada pelo clique</h2>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                Das {data.conversions} compra(s) associadas a um e-mail anterior, {data.conversionsWithClick} têm clique registrado e {data.conversionsWithoutClick} foram atribuídas pelo último contato dos 30 dias anteriores. O painel separa esses números para não afirmar uma causa que o rastreamento não comprovou.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Jornadas iniciadas" value={String(data.enteredJourneys)} hint="Entradas recuperáveis no período" tone="slate" />
        <MetricCard label="E-mails enviados" value={String(data.totalSent)} hint={`Cobertura ${formatPercent(data.sendCoverageRate)}`} tone="blue" />
        <MetricCard label="Cliques únicos" value={String(data.uniqueClicks)} hint={`CTR ${formatPercent(data.clickRate)}`} tone="violet" />
        <MetricCard label="Compras com clique" value={String(data.conversionsWithClick)} hint="Comprovação pelo link rastreado" tone="emerald" />
        <MetricCard label="Compras atribuídas" value={String(data.conversions)} hint={`${data.conversionsWithoutClick} sem clique registrado`} tone="emerald" />
        <MetricCard label="Receita atribuída" value={formatMoney(data.recoveredRevenue)} hint={`${formatMoney(data.recoveredRevenueWithClick)} com clique comprovado`} tone="amber" />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="mb-4">
          <p className="section-kicker">Funil real</p>
          <h2 className="text-lg font-semibold">Onde os e-mails estão perdendo pessoas</h2>
          <p className="mt-1 text-sm text-slate-500">O funil começa quando uma etapa chega ao horário e o motor cria uma tentativa rastreável.</p>
        </div>
        <Funnel items={[
          { label: "Etapas processadas", value: data.attempted, helper: "Enviadas, bloqueadas ou com falha" },
          { label: "Enviadas", value: data.totalSent, helper: `${formatPercent(data.sendCoverageRate)} das processadas` },
          { label: "Clicaram", value: data.uniqueClicks, helper: `CTR ${formatPercent(data.clickRate)}` },
          { label: "Compras atribuídas", value: data.conversions, helper: `${data.conversionsWithClick} com clique comprovado` },
        ]} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-4">
        <SignalCard icon={<MailCheck size={20} />} label="Rastreamento" value={formatPercent(data.trackingCoverageRate)} detail={`${data.trackedSent} de ${data.totalSent} envios com link individual`} tone="blue" />
        <SignalCard icon={<MousePointerClick size={20} />} label="Clique → compra" value={formatPercent(data.clickToPurchaseRate)} detail="Conversão entre quem clicou" tone="violet" />
        <SignalCard icon={<ShoppingCart size={20} />} label="Receita atribuída por envio" value={formatMoney(data.revenuePerSent)} detail="Inclui atribuições sem clique registrado" tone="emerald" />
        <SignalCard icon={<ShieldCheck size={20} />} label="Compras com clique" value={`${data.conversionsWithClick}/${data.conversions}`} detail={`${data.conversionsWithoutClick} atribuída(s) sem clique registrado`} tone="amber" />
      </section>

      <section className="mt-6">
        <div className="mb-4">
          <p className="section-kicker">Sequência</p>
          <h2 className="text-lg font-semibold">E-mail 1 × E-mail 2 × E-mail 3</h2>
          <p className="mt-1 text-sm text-slate-500">Cada contato é comparado dentro da sua própria etapa; quem chega ao terceiro e-mail é naturalmente mais difícil de converter.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {data.byStep.map((row) => (
            <article key={row.step} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-500">Contato</p><h3 className="text-xl font-semibold">E-mail {row.step}</h3></div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{formatPercent(row.sendCoverageRate)} enviados</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <Small label="Processadas" value={String(row.attempted)} />
                <Small label="Enviadas" value={String(row.sent)} />
                <Small label="Cliques" value={String(row.uniqueClicks)} />
                <Small label="CTR" value={formatPercent(row.clickRate)} />
                <Small label="Compras atribuídas" value={String(row.recovered)} />
                <Small label="Atribuição/envio" value={formatPercent(row.conversionRate)} />
                <Small label="Receita atribuída" value={formatMoney(row.revenue)} />
                <Small label="Receita/envio" value={formatMoney(row.revenuePerSent)} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 p-5">
          <p className="section-kicker">Jornadas</p>
          <h2 className="text-lg font-semibold">Resultado por tipo de recuperação</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Jornada</th><th className="px-5 py-3">Processadas</th><th className="px-5 py-3">Enviadas</th><th className="px-5 py-3">Cliques</th><th className="px-5 py-3">CTR</th><th className="px-5 py-3">Atribuídas</th><th className="px-5 py-3">Taxa</th><th className="px-5 py-3">Receita atribuída</th></tr>
            </thead>
            <tbody>
              {data.byFlow.map((row) => (
                <tr key={row.flow} className="border-t border-slate-100">
                  <td className="px-5 py-4 font-semibold">{flowLabel(row.flow)}{row.flow === "DELAYED" && !data.delayedFlowAvailable ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-700">Sem evento nativo</span> : null}</td>
                  <td className="px-5 py-4">{row.attempted}</td><td className="px-5 py-4">{row.sent}</td><td className="px-5 py-4">{row.uniqueClicks}</td>
                  <td className="px-5 py-4 text-blue-700">{formatPercent(row.clickRate)}</td><td className="px-5 py-4">{row.recovered}</td>
                  <td className="px-5 py-4 text-emerald-700">{formatPercent(row.conversionRate)}</td><td className="px-5 py-4 font-semibold">{formatMoney(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.delayedFlowAvailable && <p className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">A PerfectPay não fornece um evento de venda equivalente a “pagamento atrasado”. Essa linha fica visível para deixar a ausência de dados explícita, sem inventar tráfego.</p>}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="section-kicker">Saúde técnica</p><h2 className="text-lg font-semibold">O sistema está conseguindo trabalhar?</h2></div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data.healthSummary.critical ? "bg-rose-50 text-rose-700" : data.healthSummary.warning ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{data.healthSummary.critical ? `${data.healthSummary.critical} crítico(s)` : data.healthSummary.warning ? `${data.healthSummary.warning} aviso(s)` : "Sem falhas críticas"}</span>
          </div>
          <div className="mt-4 space-y-3">
            {data.healthIssues.length ? data.healthIssues.map((issue) => <HealthIssue key={issue.title} issue={issue} />) : <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={20} /> Nenhum problema técnico foi encontrado no filtro atual.</div>}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="section-kicker">Sinais do sistema</p><h2 className="text-lg font-semibold">Última atividade observada</h2>
          <div className="mt-4 space-y-4">
            <SystemLine icon={<Wifi size={18} />} label="Último webhook" value={formatDateTime(data.system.lastEventAt)} detail={`${data.system.processedEvents}/${data.system.eventsInPeriod} eventos processados sem erro no período`} />
            <SystemLine icon={<MailCheck size={18} />} label="Último e-mail" value={formatDateTime(data.system.lastSentAt)} detail="Confirmação registrada pelo motor" />
            <SystemLine icon={<ShieldCheck size={18} />} label="Dados de teste ignorados" value={`${data.ignoredQa.logs} e-mail(s)`} detail={`${data.ignoredQa.journeys} jornada(s) e ${data.ignoredQa.events} evento(s)`} />
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="section-kicker">Não enviados</p><h2 className="text-lg font-semibold">Por que algumas etapas não saíram</h2>
          <div className="mt-4 space-y-3">
            {data.noSendReasons.length ? data.noSendReasons.map((row) => <div key={row.reason} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-700">{friendlyReason(row.reason)}</p><strong className="text-sm">{row.count}</strong></div>) : <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Nenhuma etapa deixou de ser enviada no período.</p>}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 p-5"><p className="section-kicker">Atribuição</p><h2 className="text-lg font-semibold">Últimas etapas processadas</h2></div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Destinatário</th><th className="px-5 py-3">Jornada</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Cliques</th><th className="px-5 py-3">Atribuição</th><th className="px-5 py-3">Horário</th></tr></thead>
              <tbody>{data.recent.length ? data.recent.map((log) => <tr key={log.id} className="border-t border-slate-100"><td className="px-5 py-4"><div className="max-w-[220px] truncate">{log.buyer_email || "—"}</div></td><td className="px-5 py-4">{flowLabel(log.recovery_flow)}</td><td className="px-5 py-4">{log.step || "—"}</td><td className="px-5 py-4"><StatusBadge value={log.status} /></td><td className="px-5 py-4">{Number(log.click_count || 0)}</td><td className="px-5 py-4">{log.converted_at ? `✅ ${formatMoney(Number(log.converted_revenue || 0))}` : "—"}</td><td className="px-5 py-4 text-slate-500">{formatDateTime(log.sent_at || log.created_at)}</td></tr>) : <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">Nenhuma etapa no período.</td></tr>}</tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 p-5"><p className="section-kicker">Oferta</p><h2 className="text-lg font-semibold">Resultado por condição de pagamento</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Oferta</th><th className="px-5 py-3">Processadas</th><th className="px-5 py-3">Enviadas</th><th className="px-5 py-3">Cliques</th><th className="px-5 py-3">CTR</th><th className="px-5 py-3">Atribuídas</th><th className="px-5 py-3">Taxa</th><th className="px-5 py-3">Receita atribuída</th></tr></thead><tbody>{data.byOffer.length ? data.byOffer.map((row) => <tr key={row.offer} className="border-t border-slate-100"><td className="px-5 py-4 font-semibold">{row.offer}</td><td className="px-5 py-4">{row.attempted}</td><td className="px-5 py-4">{row.sent}</td><td className="px-5 py-4">{row.uniqueClicks}</td><td className="px-5 py-4 text-blue-700">{formatPercent(row.clickRate)}</td><td className="px-5 py-4">{row.recovered}</td><td className="px-5 py-4 text-emerald-700">{formatPercent(row.conversionRate)}</td><td className="px-5 py-4 font-semibold">{formatMoney(row.revenue)}</td></tr>) : <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">Nenhum dado no período.</td></tr>}</tbody></table></div>
      </section>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3"><Info className="mt-0.5 shrink-0 text-amber-700" size={20} /><div><h2 className="font-semibold text-amber-950">O que ainda não é mensurável</h2><p className="mt-1 text-sm leading-6 text-amber-900">O Gmail confirma que aceitou o envio, mas não fornece webhooks de entrega final, rejeição, spam ou abertura. Por isso o painel não inventa essas métricas. Cliques, compras e receita permanecem rastreados normalmente.</p></div></div>
      </section>

      <p className="mt-4 text-xs text-slate-400">Atribuição atual: último e-mail enviado nos 30 dias anteriores à compra. Sem clique registrado, o painel mostra associação temporal — não comprovação de que o e-mail causou a venda. Uma compra é registrada uma única vez. Veja os testes de controle × desafiante no <Link href="/dashboard/laboratorio" className="font-semibold text-blue-600">Laboratório de Copys</Link>.</p>
    </>
  );
}

function PlatformLink({ href, label, detail, active = false }: { href: string; label: string; detail: string; active?: boolean }) {
  return <Link href={href} className={`rounded-2xl border p-4 transition ${active ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-100" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}><span className="font-semibold">{label}</span><span className={`ml-2 text-xs ${active ? "text-blue-100" : "text-slate-400"}`}>{detail}</span></Link>;
}

function Small({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function SignalCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "blue" | "violet" | "emerald" | "amber" }) {
  const colors = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700" };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"><span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}>{icon}</span><p className="mt-4 text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></article>;
}

function HealthIssue({ issue }: { issue: PerfectPayHealthIssue }) {
  const style = issue.severity === "critical" ? "border-rose-100 bg-rose-50 text-rose-900" : issue.severity === "warning" ? "border-amber-100 bg-amber-50 text-amber-900" : "border-blue-100 bg-blue-50 text-blue-900";
  const Icon = issue.severity === "critical" ? CircleAlert : issue.severity === "warning" ? AlertTriangle : Info;
  return <div className={`flex items-start gap-3 rounded-xl border p-4 ${style}`}><Icon className="mt-0.5 shrink-0" size={19} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{issue.title}</p><strong>{issue.count}</strong></div><p className="mt-1 text-xs opacity-80">{issue.detail}</p></div></div>;
}

function SystemLine({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">{icon}</span><div><p className="text-xs text-slate-400">{label}</p><p className="text-sm font-semibold">{value}</p><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div></div>;
}

function friendlyReason(reason: string) {
  if (reason.includes("cliente já comprou")) return "Cliente já havia comprado o produto";
  if (reason.includes("substituído por uma jornada mais recente")) return "Jornada substituída por uma entrada mais recente";
  if (reason === "CLAIMED") return "Envio reservado e ainda em processamento";
  if (reason === "FAILED") return "Falha sem mensagem detalhada";
  return reason;
}
