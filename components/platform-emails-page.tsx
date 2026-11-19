import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { FlowFilter, flowLabel } from "@/components/flow-filter";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PeriodFilter } from "@/components/period-filter";
import { StatusBadge } from "@/components/status-badge";
import { getEmailAnalytics } from "@/lib/data";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { getPerfectPayEmailAnalytics } from "@/lib/perfectpay-email-analytics";
import type { Period } from "@/types/domain";

type Platform = "hotmart" | "perfectpay";

export async function PlatformEmailsPage({
  platform,
  searchParams,
}: {
  platform: Platform;
  searchParams: Promise<{ period?: string; flow?: string }>;
}) {
  const params = await searchParams;
  const period: Period = ["today", "7d", "30d", "90d", "all"].includes(params.period || "")
    ? (params.period as Period)
    : "30d";
  const flow = String(params.flow || "").toUpperCase();
  const hotmartData = platform === "hotmart" ? await getEmailAnalytics(period, flow) : null;
  const perfectPayData = platform === "perfectpay" ? await getPerfectPayEmailAnalytics(period, flow) : null;
  const data = hotmartData || perfectPayData!;
  const platformName = platform === "hotmart" ? "Hotmart" : "PerfectPay";
  const basePath = `/dashboard/emails/${platform}`;

  return (
    <>
      <PageHeader
        eyebrow={`E-mails · ${platformName}`}
        title={`Performance da ${platformName}`}
        description={`Somente os envios, cliques e compras da ${platformName}. As métricas da outra plataforma não entram nestes números.`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh />
          <PeriodFilter current={period} basePath={basePath} params={{ flow }} />
        </div>
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <PlatformLink href="/dashboard/emails/hotmart" label="Hotmart" active={platform === "hotmart"} detail="Cupons CUPOM1 e CUPOM2" />
        <PlatformLink href="/dashboard/emails/perfectpay" label="PerfectPay" active={platform === "perfectpay"} detail="Planos de R$ 25,90 e R$ 23,90" />
      </div>

      <FlowFilter current={flow} basePath={basePath} params={{ period }} />

      {hotmartData && (
        <OperationalStatus
          lastSentAt={hotmartData.system.lastSentAt}
          lastEventAt={hotmartData.system.lastEventAt}
          stuckClaims={hotmartData.system.stuckClaims}
          overdueJourneys={hotmartData.system.overdueJourneys}
        />
      )}

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Enviados" value={String(data.totalSent)} hint={`${data.trackedSent} rastreáveis`} tone="blue" />
        <MetricCard label="Cliques únicos" value={String(data.uniqueClicks)} hint={`${data.totalClicks} cliques totais`} tone="violet" />
        <MetricCard label="Compras" value={String(data.conversions)} hint="Atribuição exata" tone="emerald" />
        <MetricCard label="Receita" value={formatMoney(data.recoveredRevenue)} hint={`Recuperada na ${platformName}`} tone="amber" />
        <MetricCard label="Melhor horário" value={data.bestHour ? `${String(data.bestHour.hour).padStart(2, "0")}h` : "—"} hint={data.bestHour ? `CTR ${formatPercent(data.bestHour.clickRate)}` : `Amostra mínima: ${data.bestHourMinimum}`} tone="slate" />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {data.byStep.map((row) => (
          <article key={row.step} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <p className="text-sm font-medium text-slate-500">E-mail {row.step}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Small label="Enviados" value={String(row.sent)} />
              <Small label="Cliques únicos" value={String(row.uniqueClicks)} />
              <Small label="CTR" value={formatPercent(row.clickRate)} />
              <Small label="Compras" value={String(row.recovered)} />
              <Small label="Conversão" value={formatPercent(row.conversionRate)} />
              <Small label="Receita" value={formatMoney(row.revenue)} />
            </div>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <MetricCard label="Tempo até o clique" value={formatDuration(data.avgClickMinutes)} hint="Média após o envio" tone="violet" />
        <MetricCard label="Clique até a compra" value={formatDuration(data.avgPurchaseMinutes)} hint="Média das compras atribuídas" tone="emerald" />
      </section>

      <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        Esta área mostra apenas a <strong>{platformName}</strong>. Foram ignorados {data.ignoredQa.journeys} jornada(s) e {data.ignoredQa.logs} e-mail(s) de teste.
      </div>

      <section className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.4fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="font-semibold">Envios por jornada</h2>
          <div className="mt-4 space-y-3">
            {data.byFlow.length ? data.byFlow.map((row) => (
              <div key={row.flow} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div>
                  <p className="text-sm font-medium">{flowLabel(row.flow)}</p>
                  <p className="mt-1 text-xs text-slate-500">CTR {formatPercent(row.clickRate)} · {row.recovered} compra(s)</p>
                </div>
                <strong>{row.sent}</strong>
              </div>
            )) : <p className="text-sm text-slate-400">Nenhum envio no período.</p>}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 p-5"><h2 className="font-semibold">Últimos e-mails da {platformName}</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Destinatário</th><th className="px-5 py-3">Jornada</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Cliques</th><th className="px-5 py-3">Compra</th><th className="px-5 py-3">Enviado</th></tr>
              </thead>
              <tbody>
                {data.recent.length ? data.recent.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="px-5 py-4"><div className="max-w-xs truncate">{log.buyer_email || "—"}</div></td>
                    <td className="px-5 py-4">{flowLabel(log.recovery_flow)}</td>
                    <td className="px-5 py-4">{log.step || "—"}</td>
                    <td className="px-5 py-4"><StatusBadge value={log.status} /></td>
                    <td className="px-5 py-4">{Number(log.click_count || 0)}</td>
                    <td className="px-5 py-4">{log.converted_at ? `✅ ${formatMoney(Number(log.converted_revenue || 0))}` : "—"}</td>
                    <td className="px-5 py-4 text-slate-500">{formatDateTime(log.sent_at)}</td>
                  </tr>
                )) : <tr><td className="px-5 py-8 text-center text-slate-400" colSpan={7}>Nenhum e-mail enviado neste período.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 p-5">
          <p className="section-kicker">Oferta</p>
          <h2 className="text-lg font-semibold">Resultado por condição de pagamento</h2>
          <p className="mt-1 text-sm text-slate-500">Cada plataforma usa seus próprios cupons, preços e checkouts.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Oferta</th><th className="px-5 py-3">Enviados</th><th className="px-5 py-3">Cliques</th><th className="px-5 py-3">CTR</th><th className="px-5 py-3">Compras</th><th className="px-5 py-3">Conversão</th><th className="px-5 py-3">Receita</th></tr></thead>
            <tbody>
              {data.byOffer.length ? data.byOffer.map((row) => (
                <tr key={row.offer} className="border-t border-slate-100"><td className="px-5 py-4 font-semibold">{row.offer}</td><td className="px-5 py-4">{row.sent}</td><td className="px-5 py-4">{row.clicks}</td><td className="px-5 py-4 text-blue-700">{formatPercent(row.clickRate)}</td><td className="px-5 py-4">{row.purchases}</td><td className="px-5 py-4 text-emerald-700">{formatPercent(row.conversionRate)}</td><td className="px-5 py-4 font-semibold">{formatMoney(row.revenue)}</td></tr>
              )) : <tr><td className="px-5 py-8 text-center text-slate-400" colSpan={7}>Nenhum envio no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-3 text-xs text-slate-400">Mostrando {data.recent.length} dos {data.totalSent} envios. Abertura, entrega final e rejeição ainda não estão disponíveis.</p>
    </>
  );
}

function PlatformLink({ href, label, detail, active }: { href: string; label: string; detail: string; active: boolean }) {
  return (
    <Link href={href} className={`rounded-2xl border p-4 transition ${active ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-100" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
      <span className="font-semibold">{label}</span>
      <span className={`ml-2 text-xs ${active ? "text-blue-100" : "text-slate-400"}`}>{detail}</span>
    </Link>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function OperationalStatus({
  lastSentAt,
  lastEventAt,
  stuckClaims,
  overdueJourneys,
}: {
  lastSentAt: string | null;
  lastEventAt: string | null;
  stuckClaims: number;
  overdueJourneys: number;
}) {
  const needsAttention = stuckClaims > 0 || overdueJourneys > 0;
  return (
    <section className={`mt-5 rounded-2xl border px-5 py-4 ${needsAttention ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${needsAttention ? "text-amber-900" : "text-emerald-900"}`}>
            {needsAttention ? "A automação Hotmart precisa de atenção" : "Automação Hotmart sem pendências detectadas"}
          </p>
          <p className={`mt-1 text-xs ${needsAttention ? "text-amber-800" : "text-emerald-800"}`}>
            Estes dados mostram a atividade real do banco, não apenas o total histórico do período.
          </p>
        </div>
        <Link href="/dashboard/alertas" className="text-xs font-semibold text-slate-700 underline underline-offset-4">
          Ver problemas
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusItem label="Último evento" value={formatDateTime(lastEventAt)} />
        <StatusItem label="Último e-mail enviado" value={formatDateTime(lastSentAt)} />
        <StatusItem label="Envios travados" value={String(stuckClaims)} />
        <StatusItem label="Jornadas vencidas" value={String(overdueJourneys)} />
      </div>
    </section>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatDuration(minutes: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1_440) return `${(minutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${(minutes / 1_440).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}
