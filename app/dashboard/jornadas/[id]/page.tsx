import { notFound } from "next/navigation";
import { flowLabel } from "@/components/flow-filter";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getJourneyDetails } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function JourneyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getJourneyDetails(Number(id));

  if (!detail) notFound();

  const { journey, logs, events } = detail;

  const timeline = [
    ...events.map((event) => ({
      at: eventOccurredAt(event.event_created_at, event.created_at),
      kind: "EVENTO",
      title: event.event_type || "Evento Hotmart",
      detail: statusLabel(event.purchase_status),
    })),
    ...logs.map((log) => ({
      at: log.sent_at || log.created_at,
      kind: "EMAIL",
      title: `E-mail etapa ${log.step || "?"}`,
      detail: `${flowLabel(log.recovery_flow || "")} · ${statusLabel(log.status)}${Number(log.click_count || 0) > 0 ? ` · ${Number(log.click_count || 0)} clique(s)` : ""}`,
    })),
    ...logs
      .filter((log) => Boolean(log.first_clicked_at))
      .map((log) => ({
        at: log.first_clicked_at,
        kind: "CLIQUE",
        title: `Primeiro clique no e-mail ${log.step || "?"}`,
        detail: `${flowLabel(log.recovery_flow || "")} · ${Number(log.click_count || 0)} clique(s) registrado(s)`,
      })),
    ...logs
      .filter((log) => Boolean(log.converted_at))
      .map((log) => ({
        at: log.converted_at,
        kind: "COMPRA",
        title: `Compra atribuída ao e-mail ${log.step || "?"}`,
        detail: formatMoney(
          Number(log.converted_revenue || 0),
          journey.currency || "BRL"
        ),
      })),
  ].sort(
    (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()
  );

  return (
    <>
      <PageHeader
        eyebrow={`Jornada #${journey.id}`}
        title={journey.buyer_name || "Jornada sem nome"}
        description={journey.buyer_email || undefined}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Info label="Status" value={<StatusBadge value={journey.current_status} />} />
        <Info
          label="Fluxo"
          value={flowLabel(
            journey.dashboardRecovery.flow || journey.recovery_flow || ""
          )}
        />
        <Info label="Última etapa" value={String(journey.last_step_sent || 0)} />
        <Info
          label="Cliques registrados"
          value={String(
            logs.reduce(
              (sum, log) => sum + Number(log.click_count || 0),
              0
            )
          )}
        />
        <Info
          label="Recuperação"
          value={
            journey.dashboardRecovery.recovered
              ? "Sim · etapa " +
                (journey.dashboardRecovery.step || "?") +
                " · " +
                formatMoney(
                  journey.dashboardRecovery.revenue,
                  journey.currency || "BRL"
                ) +
                (journey.dashboardRecovery.source === "inferred"
                  ? " · inferida pelo painel"
                  : "")
              : "Não"
          }
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="mb-4 font-semibold">Dados da jornada</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Produto" value={String(journey.product_id || "—")} />
            <Row label="Oferta" value={journey.offer_code || "—"} />
            <Row label="Transação" value={journey.transaction_id || "—"} />
            <Row
              label="Recuperação permitida"
              value={journey.recovery_allowed ? "Sim" : "Não"}
            />
            <Row label="Próxima etapa" value={formatDateTime(journey.next_step_at)} />
            <Row label="Aprovada em" value={formatDateTime(journey.approved_at)} />
            <Row
              label="Fonte da recuperação"
              value={
                journey.dashboardRecovery.source === "inferred"
                  ? "Inferida pelo painel"
                  : journey.dashboardRecovery.source === "stored"
                    ? "Confirmada no banco"
                    : "—"
              }
            />
            <Row label="Atualizada em" value={formatDateTime(journey.updated_at)} />
          </dl>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="font-semibold">Linha do tempo</h2>
          <p className="mb-5 text-sm text-slate-500">
            Eventos da Hotmart, e-mails enviados, cliques e compras atribuídas.
          </p>

          <div className="space-y-4">
            {timeline.length ? (
              timeline.map((item, index) => (
                <div key={`${item.kind}-${index}`} className="flex gap-4">
                  <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${timelineDot(item.kind)}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-600">
                        {item.kind}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDateTime(item.at)}
                      </span>
                    </div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-slate-500">{item.detail}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">
                Nenhum evento relacionado foi encontrado.
              </p>
            )}
          </div>
        </article>
      </section>
    </>
  );
}

function eventOccurredAt(
  eventCreatedAt: string | number | null | undefined,
  fallback: string | null | undefined
) {
  if (eventCreatedAt == null || eventCreatedAt === "") return fallback;
  const raw = Number(eventCreatedAt);
  if (!Number.isFinite(raw)) return fallback;
  const milliseconds = raw < 10_000_000_000 ? raw * 1_000 : raw;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function timelineDot(kind: string) {
  if (kind === "COMPRA") return "bg-emerald-500";
  if (kind === "CLIQUE") return "bg-violet-500";
  if (kind === "EMAIL") return "bg-blue-500";
  return "bg-slate-500";
}

function Info({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[60%] break-all text-right font-medium">{value}</dd>
    </div>
  );
}
