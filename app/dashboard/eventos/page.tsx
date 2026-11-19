import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getEvents } from "@/lib/data";
import type { HotmartEvent } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const data = await getEvents();

  return (
    <>
      <PageHeader
        eyebrow="Eventos · Hotmart"
        title="Eventos recebidos da Hotmart"
        description="Esta tela mostra somente eventos da Hotmart. Problemas antigos continuam visíveis e dados de QA são ignorados."
      >
        <Link href="/dashboard/emails/perfectpay" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
          Ver métricas da PerfectPay
        </Link>
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Eventos de produção" value={String(data.total)} />
        <MetricCard label="Mostrados na lista" value={String(data.shown)} />
        <MetricCard label="Com erro" value={String(data.errors)} />
        <MetricCard label="Não processados" value={String(data.unprocessed)} />
      </section>

      {data.problems.length > 0 && (
        <section className="mt-6">
          <div className="mb-3">
            <h2 className="font-semibold text-rose-700">
              Eventos que exigem atenção
            </h2>
            <p className="text-sm text-slate-500">
              Esta lista considera todo o histórico, inclusive problemas que
              não aparecem entre os 300 eventos mais recentes.
            </p>
          </div>
          <EventTable events={data.problems} />
        </section>
      )}

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="font-semibold">Eventos mais recentes</h2>
          <p className="text-sm text-slate-500">
            Mostrando {data.shown} dos {data.total} eventos de produção.{" "}
            {data.ignoredQa} evento(s) de QA foram ignorados.
          </p>
        </div>
        <EventTable events={data.events} />
      </section>
    </>
  );
}

function EventTable({ events }: { events: HotmartEvent[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Evento</th>
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Compra</th>
              <th className="px-5 py-3">Processado</th>
              <th className="px-5 py-3">Erro</th>
              <th className="px-5 py-3">Recebido</th>
            </tr>
          </thead>
          <tbody>
            {events.length ? (
              events.map((event) => (
                <tr
                  key={event.id}
                  className="border-t border-slate-100 align-top"
                >
                  <td className="px-5 py-4">
                    <p className="font-medium">{event.event_type || "—"}</p>
                    <p className="text-xs text-slate-400">
                      {event.transaction_id || event.event_id || "—"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p>{event.buyer_name || "—"}</p>
                    <p className="text-xs text-slate-400">
                      {event.buyer_email || "—"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge value={event.purchase_status} />
                    {event.price != null && (
                      <p className="mt-2 text-xs text-slate-500">
                        {formatMoney(event.price, event.currency || "BRL")}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {event.processed ? "✅ Sim" : "⏳ Não"}
                  </td>
                  <td className="max-w-sm px-5 py-4 text-xs text-rose-600">
                    {event.processing_error || "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {formatDateTime(event.created_at)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className="px-5 py-8 text-center text-slate-400"
                  colSpan={6}
                >
                  Nenhum evento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
