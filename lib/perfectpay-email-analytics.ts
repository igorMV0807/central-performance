import "server-only";
import { cached } from "@/lib/server-cache";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Period } from "@/types/domain";

const PAGE_SIZE = 1000;
const MINIMUM_BEST_HOUR_SENDS = 10;
const OPERATION_GRACE_MS = 15 * 60 * 1000;
const DISCOUNT_FLOWS = new Set(["ABANDONED", "CANCELED", "EXPIRED"]);
const ALL_FLOWS = ["ABANDONED", "WAITING_PAYMENT", "CANCELED", "DELAYED", "EXPIRED"];

type PerfectPayLog = {
  id: number;
  journey_id: number;
  recovery_flow: string | null;
  step: number | null;
  customer_email: string | null;
  subject: string | null;
  status: string | null;
  sent_at: string | null;
  claimed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  checkout_url: string | null;
  gmail_message_id: string | null;
  click_count: number | null;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  converted_at: string | null;
  error_message: string | null;
  attempt_count: number | null;
  next_retry_at: string | null;
  copy_variant_role: string | null;
  copy_experiment_id: string | null;
};

type PerfectPayJourney = {
  id: number;
  customer_email: string | null;
  recovery_flow: string | null;
  current_status: string | null;
  recovery_allowed: boolean | null;
  last_step_sent: number | null;
  next_step_at: string | null;
  approved_at: string | null;
  stopped_at: string | null;
  recovered: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type PerfectPayConversion = {
  id: number;
  email_log_id: number | null;
  journey_id: number;
  recovery_flow: string | null;
  step: number | null;
  revenue: number | null;
  clicked_at: string | null;
  converted_at: string | null;
  attribution_model: string | null;
};

type PerfectPayEvent = {
  id: number;
  sale_status: string | null;
  customer_email: string | null;
  processed: boolean | null;
  processing_error: string | null;
  event_at: string | null;
  created_at: string | null;
};

type PerfectPayTable =
  | "perfectpay_email_logs"
  | "perfectpay_journeys"
  | "perfectpay_conversions"
  | "perfectpay_events";

export type PerfectPayHealthIssue = {
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  count: number;
};

async function fetchAllUncached(table: PerfectPayTable) {
  const supabase = getAdminClient();
  const rows: Array<{ id: number }> = [];
  let afterId: number | null = null;

  while (true) {
    let query = supabase.from(table).select("*").order("id", { ascending: true }).limit(PAGE_SIZE);
    if (afterId != null) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data || []) as unknown as Array<{ id: number }>;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const nextId = Number(batch.at(-1)?.id);
    if (!Number.isFinite(nextId) || nextId === afterId) throw new Error(`Paginação inválida em ${table}.`);
    afterId = nextId;
  }

  return rows;
}

async function fetchAll<T extends { id: number }>(table: PerfectPayTable) {
  return cached(
    `perfectpay-table:${table}`,
    30_000,
    () => fetchAllUncached(table) as Promise<T[]>
  );
}

function timestamp(value?: string | null) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function periodStart(period: Period) {
  if (period === "all") return null;
  const now = new Date();
  if (period === "today") {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const [year, month, day] = formatter.format(now).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 3, 0, 0)).getTime();
  }
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

function isQaEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase().endsWith("@example.com");
}

function normalized(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function inPeriod(value: string | null | undefined, start: number | null) {
  return !start || timestamp(value) >= start;
}

function percent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

async function getPerfectPayEmailAnalyticsUncached(period: Period, selectedFlow?: string) {
  const [allJourneys, allLogs, allConversions, allEvents] = await Promise.all([
    fetchAll<PerfectPayJourney>("perfectpay_journeys"),
    fetchAll<PerfectPayLog>("perfectpay_email_logs"),
    fetchAll<PerfectPayConversion>("perfectpay_conversions"),
    fetchAll<PerfectPayEvent>("perfectpay_events"),
  ]);

  const qaJourneyIds = new Set(allJourneys.filter((row) => isQaEmail(row.customer_email)).map((row) => Number(row.id)));
  const journeys = allJourneys.filter((row) => !qaJourneyIds.has(Number(row.id)));
  const logs = allLogs.filter((row) => !qaJourneyIds.has(Number(row.journey_id)) && !isQaEmail(row.customer_email));
  const events = allEvents.filter((row) => !isQaEmail(row.customer_email));
  const ignoredLogs = allLogs.length - logs.length;
  const ignoredEvents = allEvents.length - events.length;
  const start = periodStart(period);
  const flow = normalized(selectedFlow);
  const matchesFlow = (value?: string | null) => !flow || normalized(value) === flow;

  const logsByJourney = new Map<number, PerfectPayLog[]>();
  for (const log of logs) logsByJourney.set(Number(log.journey_id), [...(logsByJourney.get(Number(log.journey_id)) || []), log]);
  const resolvedJourneyFlow = (journey: PerfectPayJourney) =>
    journey.recovery_flow || logsByJourney.get(Number(journey.id))?.find((row) => row.recovery_flow)?.recovery_flow || null;

  const enteredJourneys = journeys.filter((journey) =>
    inPeriod(journey.created_at, start) && Boolean(resolvedJourneyFlow(journey)) && matchesFlow(resolvedJourneyFlow(journey))
  );
  const activeRecoveries = journeys.filter((journey) =>
    inPeriod(journey.created_at, start) &&
    matchesFlow(resolvedJourneyFlow(journey)) &&
    journey.recovery_allowed === true &&
    journey.recovered !== true &&
    Number(journey.last_step_sent || 0) < 3
  );
  const attempts = logs.filter((row) => inPeriod(row.created_at, start) && matchesFlow(row.recovery_flow));
  const sent = attempts.filter((row) => normalized(row.status) === "SENT");
  const failed = attempts.filter((row) => normalized(row.status) === "FAILED");
  const skipped = attempts.filter((row) => normalized(row.status) === "SKIPPED");
  const claimed = attempts.filter((row) => normalized(row.status) === "CLAIMED");
  const sentIds = new Set(sent.map((row) => Number(row.id)));
  const journeyIds = new Set(journeys.map((row) => Number(row.id)));
  const conversions = allConversions.filter((row) =>
    row.email_log_id != null && sentIds.has(Number(row.email_log_id)) && journeyIds.has(Number(row.journey_id)) && matchesFlow(row.recovery_flow)
  );
  const conversionsByLog = new Map<number, PerfectPayConversion>();
  for (const conversion of conversions) conversionsByLog.set(Number(conversion.email_log_id), conversion);

  const metricsFor = (rows: PerfectPayLog[]) => {
    const rowsSent = rows.filter((row) => normalized(row.status) === "SENT");
    const tracked = rowsSent.filter((row) => Boolean(row.checkout_url));
    const rowIds = new Set(rowsSent.map((row) => Number(row.id)));
    const purchases = conversions.filter((row) => row.email_log_id != null && rowIds.has(Number(row.email_log_id)));
    const purchasesWithClick = purchases.filter((row) => Boolean(row.clicked_at));
    const uniqueClicks = tracked.filter((row) => Number(row.click_count || 0) > 0).length;
    const revenue = purchases.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    return {
      attempted: rows.length,
      sent: rowsSent.length,
      failed: rows.filter((row) => normalized(row.status) === "FAILED").length,
      skipped: rows.filter((row) => normalized(row.status) === "SKIPPED").length,
      claimed: rows.filter((row) => normalized(row.status) === "CLAIMED").length,
      trackedSent: tracked.length,
      clicks: tracked.reduce((sum, row) => sum + Number(row.click_count || 0), 0),
      uniqueClicks,
      clickRate: percent(uniqueClicks, tracked.length),
      recovered: purchases.length,
      revenue,
      conversionRate: percent(purchases.length, rowsSent.length),
      clickToPurchaseRate: percent(purchasesWithClick.length, uniqueClicks),
      sendCoverageRate: percent(rowsSent.length, rows.length),
      trackingCoverageRate: percent(tracked.length, rowsSent.length),
      revenuePerSent: rowsSent.length ? revenue / rowsSent.length : 0,
    };
  };

  const byStep = [1, 2, 3].map((step) => ({ step, ...metricsFor(attempts.filter((row) => Number(row.step) === step)) }));
  const byFlow = ALL_FLOWS.filter((item) => !flow || item === flow)
    .map((item) => ({ flow: item, ...metricsFor(attempts.filter((row) => normalized(row.recovery_flow) === item)) }));

  const trackedSent = sent.filter((row) => Boolean(row.checkout_url));
  const uniqueClicks = trackedSent.filter((row) => Number(row.click_count || 0) > 0).length;
  const clickDelays = trackedSent
    .filter((row) => row.first_clicked_at && timestamp(row.sent_at) > 0)
    .map((row) => (timestamp(row.first_clicked_at) - timestamp(row.sent_at)) / 60_000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);
  const purchaseDelays = conversions
    .filter((row) => row.converted_at)
    .map((row) => (timestamp(row.converted_at) - timestamp(sent.find((log) => Number(log.id) === Number(row.email_log_id))?.sent_at)) / 60_000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);

  const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const hours = new Map<number, { sent: number; clicked: number }>();
  for (const row of trackedSent) {
    if (!row.sent_at) continue;
    const hour = Number(hourFormatter.format(new Date(row.sent_at)));
    if (!Number.isFinite(hour)) continue;
    const current = hours.get(hour) || { sent: 0, clicked: 0 };
    current.sent += 1;
    if (Number(row.click_count || 0) > 0) current.clicked += 1;
    hours.set(hour, current);
  }
  const bestHour = [...hours.entries()]
    .map(([hour, value]) => ({ hour, sent: value.sent, clickRate: percent(value.clicked, value.sent) }))
    .filter((row) => row.sent >= MINIMUM_BEST_HOUR_SENDS)
    .sort((a, b) => b.clickRate - a.clickRate || b.sent - a.sent)[0] || null;

  const offerGroups = new Map<string, PerfectPayLog[]>();
  for (const row of attempts) {
    const rowFlow = normalized(row.recovery_flow);
    const offer = DISCOUNT_FLOWS.has(rowFlow) && Number(row.step) === 2
      ? "Plano R$ 25,90"
      : DISCOUNT_FLOWS.has(rowFlow) && Number(row.step) === 3
        ? "Plano R$ 23,90"
        : "Sem desconto";
    offerGroups.set(offer, [...(offerGroups.get(offer) || []), row]);
  }
  const byOffer = [...offerGroups.entries()].map(([offer, rows]) => {
    const metrics = metricsFor(rows);
    return {
      offer,
      ...metrics,
      tracked: metrics.trackedSent,
      clicks: metrics.uniqueClicks,
      purchases: metrics.recovered,
    };
  });

  const noSendReasonMap = new Map<string, number>();
  for (const row of attempts.filter((item) => normalized(item.status) !== "SENT")) {
    const reason = String(row.error_message || "").trim() || normalized(row.status) || "NÃO IDENTIFICADO";
    noSendReasonMap.set(reason, (noSendReasonMap.get(reason) || 0) + 1);
  }
  const noSendReasons = [...noSendReasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

  const journeyById = new Map(journeys.map((row) => [Number(row.id), row]));
  const now = Date.now();
  const stuckClaims = logs.filter((row) => normalized(row.status) === "CLAIMED" && timestamp(row.claimed_at || row.created_at) < now - OPERATION_GRACE_MS);
  const overdueJourneys = journeys.filter((row) => row.recovery_allowed === true && row.next_step_at && timestamp(row.next_step_at) < now - OPERATION_GRACE_MS);
  const eventProblems = events.filter((row) => inPeriod(row.event_at || row.created_at, start) && (row.processed !== true || Boolean(String(row.processing_error || "").trim())));
  const incompletePrecheckoutEvents = eventProblems.filter((row) =>
    normalized(row.sale_status) === "PRECHECKOUT" && !String(row.customer_email || "").trim()
  );
  const incompletePrecheckoutIds = new Set(incompletePrecheckoutEvents.map((row) => Number(row.id)));
  const actionableEventProblems = eventProblems.filter((row) => !incompletePrecheckoutIds.has(Number(row.id)));
  const missingTracking = sent.filter((row) => !row.checkout_url);
  const missingGmailId = sent.filter((row) => !String(row.gmail_message_id || "").trim());
  const sentAfterPurchase = sent.filter((row) => {
    const approvedAt = journeyById.get(Number(row.journey_id))?.approved_at;
    return Boolean(approvedAt && timestamp(row.sent_at) > timestamp(approvedAt) + 60_000);
  });
  const sentGroups = new Map<string, number>();
  for (const row of sent) {
    const key = `${row.journey_id}|${normalized(row.recovery_flow)}|${row.step}`;
    sentGroups.set(key, (sentGroups.get(key) || 0) + 1);
  }
  const duplicateSends = [...sentGroups.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);

  const healthIssues: PerfectPayHealthIssue[] = [];
  const addIssue = (severity: PerfectPayHealthIssue["severity"], title: string, detail: string, count: number) => {
    if (count > 0) healthIssues.push({ severity, title, detail, count });
  };
  addIssue("critical", "Eventos com falha real", "Eventos da PerfectPay que falharam mesmo contendo os dados necessários.", actionableEventProblems.length);
  addIssue("critical", "Envios reservados e travados", "Reservas em CLAIMED há mais de 15 minutos.", stuckClaims.length);
  addIssue("critical", "Jornadas atrasadas", "Jornadas passaram do horário do próximo contato.", overdueJourneys.length);
  addIssue("critical", "Envios depois da compra", "E-mails enviados após a aprovação registrada.", sentAfterPurchase.length);
  addIssue("critical", "Etapas duplicadas", "A mesma etapa foi enviada mais de uma vez.", duplicateSends);
  addIssue("warning", "Falhas de envio", "Tentativas que o Gmail ou o workflow não concluíram.", failed.length);
  addIssue("warning", "Links sem rastreamento", "Envios sem URL individual de clique.", missingTracking.length);
  addIssue("warning", "Envios sem ID do Gmail", "Status enviado sem identificador retornado pelo Gmail.", missingGmailId.length);
  addIssue("warning", "Pré-checkouts sem e-mail", "A PerfectPay informou uma intenção de compra sem endereço de e-mail; não existe destinatário para iniciar a recuperação.", incompletePrecheckoutEvents.length);
  addIssue("info", "Envios bloqueados corretamente", "Etapas puladas por compra, substituição ou proteção contra duplicidade.", skipped.length);
  const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
  healthIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.count - a.count);

  const eventsInPeriod = events.filter((row) => inPeriod(row.event_at || row.created_at, start));
  const lastEventAt = events.reduce((latest, row) => timestamp(row.event_at || row.created_at) > timestamp(latest) ? (row.event_at || row.created_at) : latest, null as string | null);
  const lastSentAt = logs.reduce((latest, row) => timestamp(row.sent_at) > timestamp(latest) ? row.sent_at : latest, null as string | null);
  const recoveredRevenue = conversions.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const recoveredRevenueWithClick = conversions
    .filter((row) => Boolean(row.clicked_at))
    .reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const recoveredRevenueWithoutClick = recoveredRevenue - recoveredRevenueWithClick;

  const recent = [...attempts]
    .sort((a, b) => timestamp(b.sent_at || b.created_at) - timestamp(a.sent_at || a.created_at))
    .slice(0, 100)
    .map((row) => {
      const conversion = conversionsByLog.get(Number(row.id));
      return { ...row, buyer_email: row.customer_email, converted_at: conversion?.converted_at || row.converted_at, converted_revenue: conversion?.revenue || 0 };
    });

  return {
    byStep,
    byFlow,
    byOffer,
    recent,
    enteredJourneys: enteredJourneys.length,
    activeRecoveries: activeRecoveries.length,
    attempted: attempts.length,
    failed: failed.length,
    skipped: skipped.length,
    claimed: claimed.length,
    totalSent: sent.length,
    trackedSent: trackedSent.length,
    totalClicks: sent.reduce((sum, row) => sum + Number(row.click_count || 0), 0),
    uniqueClicks,
    conversions: conversions.length,
    conversionsWithClick: conversions.filter((row) => Boolean(row.clicked_at)).length,
    conversionsWithoutClick: conversions.filter((row) => !row.clicked_at).length,
    recoveredRevenue,
    recoveredRevenueWithClick,
    recoveredRevenueWithoutClick,
    sendCoverageRate: percent(sent.length, attempts.length),
    trackingCoverageRate: percent(trackedSent.length, sent.length),
    clickRate: percent(uniqueClicks, trackedSent.length),
    conversionRate: percent(conversions.length, sent.length),
    clickToPurchaseRate: percent(conversions.filter((row) => Boolean(row.clicked_at)).length, uniqueClicks),
    recoveryRate: percent(conversions.length, enteredJourneys.length),
    revenuePerSent: sent.length ? recoveredRevenue / sent.length : 0,
    revenuePer100Sent: sent.length ? (recoveredRevenue / sent.length) * 100 : 0,
    avgClickMinutes: clickDelays.length ? clickDelays.reduce((sum, value) => sum + value, 0) / clickDelays.length : null,
    avgPurchaseMinutes: purchaseDelays.length ? purchaseDelays.reduce((sum, value) => sum + value, 0) / purchaseDelays.length : null,
    bestHour,
    bestHourMinimum: MINIMUM_BEST_HOUR_SENDS,
    noSendReasons,
    healthIssues,
    healthSummary: {
      critical: healthIssues.filter((issue) => issue.severity === "critical").reduce((sum, issue) => sum + issue.count, 0),
      warning: healthIssues.filter((issue) => issue.severity === "warning").reduce((sum, issue) => sum + issue.count, 0),
      info: healthIssues.filter((issue) => issue.severity === "info").reduce((sum, issue) => sum + issue.count, 0),
    },
    system: {
      lastEventAt,
      lastSentAt,
      eventsInPeriod: eventsInPeriod.length,
      processedEvents: eventsInPeriod.filter((row) => row.processed === true && !row.processing_error).length,
      eventProblems: eventProblems.length,
      actionableEventProblems: actionableEventProblems.length,
      incompletePrecheckoutEvents: incompletePrecheckoutEvents.length,
    },
    availability: { sent: true, clicks: true, purchases: true, revenue: true, delivered: false, opens: false, bounces: false, complaints: false },
    delayedFlowAvailable: false,
    ignoredQa: { journeys: qaJourneyIds.size, logs: ignoredLogs, events: ignoredEvents },
  };
}

export function getPerfectPayEmailAnalytics(period: Period, selectedFlow?: string) {
  return cached(
    `perfectpay-analytics:${period}:${selectedFlow || ""}`,
    30_000,
    () => getPerfectPayEmailAnalyticsUncached(period, selectedFlow)
  );
}
