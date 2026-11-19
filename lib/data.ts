import "server-only";
import { cached } from "@/lib/server-cache";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  DashboardJourney,
  DashboardRecovery,
  HotmartEvent,
  Period,
  PurchaseJourney,
  RecoveryConversion,
  RecoveryEmailLog,
} from "@/types/domain";

const PAGE_SIZE = 1000;
const RECOVERY_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const OPERATION_GRACE_MS = 15 * 60 * 1000;
const MINIMUM_BEST_HOUR_SENDS = 10;
const RECOVERY_FLOWS = [
  "ABANDONED",
  "WAITING_PAYMENT",
  "CANCELED",
  "DELAYED",
  "EXPIRED",
] as const;
const ENTRY_EVENTS_BY_FLOW: Record<string, string[]> = {
  ABANDONED: ["PURCHASE_OUT_OF_SHOPPING_CART"],
  WAITING_PAYMENT: ["PURCHASE_BILLET_PRINTED"],
  CANCELED: ["PURCHASE_CANCELED"],
  DELAYED: ["PURCHASE_DELAYED"],
  EXPIRED: ["PURCHASE_EXPIRED"],
};
const DISCOUNT_FLOWS = new Set(["ABANDONED", "CANCELED", "EXPIRED"]);

type TableName =
  | "purchase_journeys"
  | "recovery_email_logs"
  | "hotmart_events"
  | "recovery_conversions";

async function fetchAllUncached(
  table: TableName,
  select: string
): Promise<Array<{ id: number }>> {
  const supabase = getAdminClient();
  const rows: Array<{ id: number }> = [];
  let afterId: number | null = null;

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (afterId != null) {
      query = query.gt("id", afterId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(table + ": " + error.message);
    }

    const batch = (data || []) as unknown as Array<{ id: number }>;
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;

    const nextId = Number(batch[batch.length - 1]?.id);
    if (!Number.isFinite(nextId) || nextId === afterId) {
      throw new Error("Paginação inválida em " + table + ".");
    }
    afterId = nextId;
  }

  return rows;
}

async function fetchAll<T extends { id: number }>(
  table: TableName,
  select = "*"
): Promise<T[]> {
  return cached(
    `hotmart-table:${table}:${select}`,
    30_000,
    () => fetchAllUncached(table, select) as Promise<T[]>
  );
}

function periodStart(period: Period) {
  if (period === "all") return null;
  if (period === "today") {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const [year, month, day] = formatter.format(new Date()).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function selectedFlow(flow?: string | null) {
  const value = String(flow || "").trim().toUpperCase();
  return RECOVERY_FLOWS.includes(value as (typeof RECOVERY_FLOWS)[number])
    ? value
    : null;
}

function matchesFlow(value: string | null | undefined, flow: string | null) {
  return !flow || String(value || "").trim().toUpperCase() === flow;
}

function isEntryEvent(event: HotmartEvent, flow: string | null) {
  const type = String(event.event_type || "").toUpperCase();
  if (flow) return (ENTRY_EVENTS_BY_FLOW[flow] || []).includes(type);
  return Object.values(ENTRY_EVENTS_BY_FLOW).flat().includes(type);
}

function inEventPeriod(event: HotmartEvent, start: Date | null) {
  return !start || eventTimestamp(event) >= start.getTime();
}

function safeCheckoutProblem(log: RecoveryEmailLog) {
  if (!log.checkout_url) return null;
  try {
    const url = new URL(log.checkout_url);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "pay.hotmart.com") {
      return "O botão não aponta para o checkout oficial da Hotmart.";
    }
  } catch {
    return "O endereço do botão é inválido.";
  }

  const flow = String(log.recovery_flow || "").toUpperCase();
  let text = log.checkout_url.toUpperCase();
  try {
    text = decodeURIComponent(log.checkout_url).toUpperCase();
  } catch {
    // The URL host was already validated; keep the raw string for coupon checks.
  }
  const discounted = DISCOUNT_FLOWS.has(flow);
  if (discounted && Number(log.step) === 2 && !text.includes("CUPOM1")) {
    return "O segundo e-mail deveria usar o CUPOM1.";
  }
  if (discounted && Number(log.step) === 3 && !text.includes("CUPOM2")) {
    return "O terceiro e-mail deveria usar o CUPOM2.";
  }
  if (!discounted && /CUPOM1|CUPOM2/.test(text)) {
    return "Esta jornada não deveria receber desconto.";
  }
  return null;
}

function inPeriod(value: string | null | undefined, start: Date | null) {
  if (!start) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= start.getTime();
}

function timestamp(value: string | null | undefined) {
  const result = new Date(value || 0).getTime();
  return Number.isFinite(result) ? result : 0;
}

function eventTimestamp(event: HotmartEvent) {
  const raw = Number(event.event_created_at);
  if (Number.isFinite(raw) && raw > 0) {
    return raw < 10_000_000_000 ? raw * 1000 : raw;
  }
  return timestamp(event.created_at);
}

function dateKey(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function normalized(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function recoveryIdentity(
  email: string | null | undefined,
  productId: number | null | undefined,
  offerCode: string | null | undefined
) {
  const normalizedEmail = normalized(email);
  if (!normalizedEmail) return null;
  return [normalizedEmail, Number(productId || 0), normalized(offerCode)].join("|");
}

function isActiveRecoveryJourney(journey: DashboardJourney) {
  return (
    journey.recovery_allowed === true &&
    !journey.dashboardRecovery.recovered &&
    Number(journey.last_step_sent || 0) < 3
  );
}

function journeyRecency(journey: DashboardJourney) {
  return Math.max(
    timestamp(journey.created_at),
    Number(journey.last_event_created_at || 0),
    Number(journey.id || 0)
  );
}

function effectiveActiveJourneys(journeys: DashboardJourney[]) {
  const newestByIdentity = new Map<string, DashboardJourney>();
  const withoutIdentity: DashboardJourney[] = [];

  for (const journey of journeys.filter(isActiveRecoveryJourney)) {
    const key = recoveryIdentity(
      journey.buyer_email,
      journey.product_id,
      journey.offer_code
    );
    if (!key) {
      withoutIdentity.push(journey);
      continue;
    }
    const current = newestByIdentity.get(key);
    if (!current || journeyRecency(journey) > journeyRecency(current)) {
      newestByIdentity.set(key, journey);
    }
  }

  return [...newestByIdentity.values(), ...withoutIdentity];
}

function isQaMarker(value: string | null | undefined) {
  return /^(qa|test|teste)(?:[-_: ]|$)/i.test(String(value || "").trim());
}

function isQaEmail(value: string | null | undefined) {
  return normalized(value).endsWith("@example.com");
}

function isQaJourney(journey: PurchaseJourney) {
  return (
    isQaEmail(journey.buyer_email) ||
    isQaMarker(journey.recovery_flow) ||
    isQaMarker(journey.first_event_id) ||
    isQaMarker(journey.last_event_id)
  );
}

function isQaEvent(event: HotmartEvent) {
  return (
    isQaEmail(event.buyer_email) ||
    isQaMarker(event.event_id) ||
    String(event.event_type || "").toUpperCase().includes("_QA_")
  );
}

function latestSentLogBefore(
  journey: PurchaseJourney,
  logsByJourney: Map<number, RecoveryEmailLog[]>,
  approvalTime?: number
) {
  const logs = (logsByJourney.get(journey.id) || [])
    .filter(
      (log) =>
        String(log.status || "").toUpperCase() === "SENT" &&
        Boolean(log.sent_at || log.created_at)
    )
    .sort(
      (a, b) =>
        timestamp(b.sent_at || b.created_at) -
        timestamp(a.sent_at || a.created_at)
    );

  if (!approvalTime) return logs[0] || null;

  return (
    logs.find(
      (log) => timestamp(log.sent_at || log.created_at) <= approvalTime
    ) || null
  );
}

function eventMatchesJourney(event: HotmartEvent, journey: PurchaseJourney) {
  if (
    journey.transaction_id &&
    event.transaction_id &&
    event.transaction_id === journey.transaction_id
  ) {
    return true;
  }

  return (
    normalized(event.buyer_email) === normalized(journey.buyer_email) &&
    Number(event.product_id || 0) === Number(journey.product_id || 0) &&
    normalized(event.offer_code) === normalized(journey.offer_code)
  );
}

function approvalRevenue(
  journey: PurchaseJourney,
  events: HotmartEvent[],
  approvalTime: number
) {
  const candidates = events
    .filter(
      (event) =>
        eventMatchesJourney(event, journey) &&
        ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"].includes(
          String(event.event_type || "").toUpperCase()
        ) &&
        event.price != null
    )
    .sort(
      (a, b) =>
        Math.abs(eventTimestamp(a) - approvalTime) -
        Math.abs(eventTimestamp(b) - approvalTime)
    );

  return Number(candidates[0]?.price || 0);
}

function recoveryForJourney(
  journey: PurchaseJourney,
  logsByJourney: Map<number, RecoveryEmailLog[]>,
  events: HotmartEvent[]
): DashboardRecovery {
  const approvedAt = journey.approved_at || null;
  const approvalTime = timestamp(approvedAt);
  const latestLog = latestSentLogBefore(
    journey,
    logsByJourney,
    approvalTime || undefined
  );

  if (journey.recovered === true) {
    return {
      recovered: true,
      step: Number(journey.recovered_step || latestLog?.step || 0) || null,
      revenue: Number(journey.recovered_revenue || 0),
      flow: latestLog?.recovery_flow || journey.recovery_flow || null,
      approvedAt: approvedAt || journey.updated_at || null,
      source: "stored",
    };
  }

  const eligibleStatus = ["APPROVED", "COMPLETED"].includes(
    String(journey.current_status || "").toUpperCase()
  );
  const sentTime = timestamp(latestLog?.sent_at || latestLog?.created_at);
  const insideWindow =
    approvalTime > 0 &&
    sentTime > 0 &&
    sentTime <= approvalTime &&
    approvalTime - sentTime <= RECOVERY_ATTRIBUTION_WINDOW_MS;

  if (eligibleStatus && latestLog && insideWindow) {
    return {
      recovered: true,
      step: Number(latestLog.step || 0) || null,
      revenue: approvalRevenue(journey, events, approvalTime),
      flow: latestLog.recovery_flow || journey.recovery_flow || null,
      approvedAt,
      source: "inferred",
    };
  }

  return {
    recovered: false,
    step: null,
    revenue: 0,
    flow: null,
    approvedAt,
    source: null,
  };
}

function prepareProductionData(
  journeys: PurchaseJourney[],
  logs: RecoveryEmailLog[],
  events: HotmartEvent[]
) {
  const qaJourneyIds = new Set(
    journeys.filter(isQaJourney).map((journey) => Number(journey.id))
  );
  const productionJourneys = journeys.filter(
    (journey) => !qaJourneyIds.has(Number(journey.id))
  );
  const productionLogs = logs.filter(
    (log) =>
      !qaJourneyIds.has(Number(log.journey_id)) &&
      !isQaMarker(log.recovery_flow)
  );
  const productionEvents = events.filter((event) => !isQaEvent(event));

  const logsByJourney = new Map<number, RecoveryEmailLog[]>();
  for (const log of productionLogs) {
    const list = logsByJourney.get(Number(log.journey_id)) || [];
    list.push(log);
    logsByJourney.set(Number(log.journey_id), list);
  }

  const dashboardJourneys: DashboardJourney[] = productionJourneys.map(
    (journey) => ({
      ...journey,
      dashboardRecovery: recoveryForJourney(
        journey,
        logsByJourney,
        productionEvents
      ),
    })
  );

  return {
    journeys: dashboardJourneys,
    logs: productionLogs,
    events: productionEvents,
    ignoredQa: {
      journeys: qaJourneyIds.size,
      logs: logs.length - productionLogs.length,
      events: events.length - productionEvents.length,
    },
  };
}

function activeDuplicateGroups(journeys: DashboardJourney[]) {
  const active = journeys.filter(isActiveRecoveryJourney);
  const groups = new Map<string, DashboardJourney[]>();

  for (const journey of active) {
    if (!journey.buyer_email) continue;
    const key = recoveryIdentity(
      journey.buyer_email,
      journey.product_id,
      journey.offer_code
    );
    if (!key) continue;
    const rows = groups.get(key) || [];
    rows.push(journey);
    groups.set(key, rows);
  }

  return [...groups.values()]
    .filter((rows) => rows.length > 1)
    .map((rows) =>
      [...rows].sort(
        (a, b) => timestamp(b.created_at) - timestamp(a.created_at)
      )
    );
}

async function getOverviewUncached(period: Period, flow?: string) {
  const [rawJourneys, rawLogs, rawEvents, rawConversions] = await Promise.all([
    fetchAll<PurchaseJourney>("purchase_journeys"),
    fetchAll<RecoveryEmailLog>("recovery_email_logs"),
    fetchAll<HotmartEvent>("hotmart_events"),
    fetchAll<RecoveryConversion>("recovery_conversions"),
  ]);
  const { journeys, logs, events, ignoredQa } = prepareProductionData(
    rawJourneys,
    rawLogs,
    rawEvents
  );

  const start = periodStart(period);
  const flowFilter = selectedFlow(flow);
  const productionJourneyIds = new Set(
    journeys.map((journey) => Number(journey.id))
  );
  const sentLogs = logs.filter(
    (log) =>
      String(log.status || "").toUpperCase() === "SENT" &&
      inPeriod(log.sent_at || log.created_at, start) &&
      matchesFlow(log.recovery_flow, flowFilter)
  );
  const trackedLogs = sentLogs.filter((log) => Boolean(log.checkout_url));
  const trackedLogIds = new Set(trackedLogs.map((log) => Number(log.id)));
  const conversions = rawConversions.filter(
    (conversion) =>
      productionJourneyIds.has(Number(conversion.journey_id)) &&
      trackedLogIds.has(Number(conversion.email_log_id)) &&
      matchesFlow(conversion.recovery_flow, flowFilter)
  );
  const clickedLogs = trackedLogs.filter(
    (log) => Number(log.click_count || 0) > 0
  );

  const activeRecoveries = effectiveActiveJourneys(journeys).filter((journey) =>
    matchesFlow(journey.recovery_flow, flowFilter)
  );

  const trackedJourneyIds = new Set(
    trackedLogs.map((log) => Number(log.journey_id))
  );
  const recoveredRevenue = conversions.reduce(
    (sum, conversion) => sum + Number(conversion.revenue || 0),
    0
  );
  const recoveryRate =
    trackedJourneyIds.size > 0
      ? (conversions.length / trackedJourneyIds.size) * 100
      : 0;
  const clickRate =
    trackedLogs.length > 0 ? (clickedLogs.length / trackedLogs.length) * 100 : 0;

  const sequence = [1, 2, 3].map((step) => {
    const sentAtStep = sentLogs.filter((log) => Number(log.step) === step);
    const trackedAtStep = sentAtStep.filter((log) => Boolean(log.checkout_url));
    const trackedIdsAtStep = new Set(
      trackedAtStep.map((log) => Number(log.id))
    );
    const clickedAtStep = trackedAtStep.filter(
      (log) => Number(log.click_count || 0) > 0
    );
    const conversionsAtStep = conversions.filter((conversion) =>
      trackedIdsAtStep.has(Number(conversion.email_log_id))
    );
    return {
      step,
      sent: sentAtStep.length,
      tracked: trackedAtStep.length,
      clicks: clickedAtStep.length,
      clickRate:
        trackedAtStep.length > 0
          ? (clickedAtStep.length / trackedAtStep.length) * 100
          : 0,
      recovered: conversionsAtStep.length,
      conversionRate:
        trackedAtStep.length > 0
          ? (conversionsAtStep.length / trackedAtStep.length) * 100
          : 0,
      revenue: conversionsAtStep.reduce(
        (sum, row) => sum + Number(row.revenue || 0),
        0
      ),
    };
  });
  const byStep = sequence.map((row) => ({
    step: "E-mail " + row.step,
    recovered: row.recovered,
    revenue: row.revenue,
  }));

  const flowMap = new Map<string, { recovered: number; revenue: number }>();
  for (const conversion of conversions) {
    const flow = conversion.recovery_flow || "NÃO IDENTIFICADO";
    const current = flowMap.get(flow) || { recovered: 0, revenue: 0 };
    current.recovered += 1;
    current.revenue += Number(conversion.revenue || 0);
    flowMap.set(flow, current);
  }

  const byFlow = [...flowMap.entries()]
    .map(([flow, values]) => ({ flow, ...values }))
    .sort((a, b) => b.recovered - a.recovered);

  const dailyMap = new Map<string, { recovered: number; revenue: number }>();
  for (const conversion of conversions) {
    const value = conversion.converted_at;
    if (!value) continue;
    const key = dateKey(value);
    const current = dailyMap.get(key) || { recovered: 0, revenue: 0 };
    current.recovered += 1;
    current.revenue += Number(conversion.revenue || 0);
    dailyMap.set(key, current);
  }

  const revenueByDay = [...dailyMap.entries()]
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const entryEvents = events.filter(
    (event) => isEntryEvent(event, flowFilter) && inEventPeriod(event, start)
  );
  const entryIdentityKeys = new Set<string>();
  for (const event of entryEvents) {
    const key = recoveryIdentity(
      event.buyer_email,
      event.product_id,
      event.offer_code
    );
    if (key) {
      entryIdentityKeys.add(key);
    }
  }
  const funnelJourneyByIdentity = new Map<string, DashboardJourney>();
  for (const journey of journeys) {
    const key = recoveryIdentity(
      journey.buyer_email,
      journey.product_id,
      journey.offer_code
    );
    if (!key || !entryIdentityKeys.has(key)) continue;
    const current = funnelJourneyByIdentity.get(key);
    if (!current || journeyRecency(journey) > journeyRecency(current)) {
      funnelJourneyByIdentity.set(key, journey);
    }
  }
  const funnelJourneyIds = new Set(
    [...funnelJourneyByIdentity.values()].map((journey) => Number(journey.id))
  );
  const funnelLogs = logs.filter(
    (log) =>
      String(log.status || "").toUpperCase() === "SENT" &&
      funnelJourneyIds.has(Number(log.journey_id)) &&
      matchesFlow(log.recovery_flow, flowFilter)
  );
  const funnelTrackedLogs = funnelLogs.filter((log) => Boolean(log.checkout_url));
  const funnelTrackedIds = new Set(
    funnelTrackedLogs.map((log) => Number(log.id))
  );
  const funnelEmailedJourneys = new Set(
    funnelLogs.map((log) => Number(log.journey_id))
  );
  const funnelClickedJourneys = new Set(
    funnelTrackedLogs
      .filter((log) => Number(log.click_count || 0) > 0)
      .map((log) => Number(log.journey_id))
  );
  const funnelConversions = rawConversions.filter(
    (conversion) =>
      productionJourneyIds.has(Number(conversion.journey_id)) &&
      funnelTrackedIds.has(Number(conversion.email_log_id))
  );
  const funnel = [
    {
      label: flowFilter === "ABANDONED" ? "Abandonos únicos" : "Entradas únicas",
      value: entryIdentityKeys.size,
      helper: `${entryEvents.length} evento(s) bruto(s) recebido(s) da Hotmart`,
    },
    {
      label: "Jornadas",
      value: funnelJourneyIds.size,
      helper: "Entradas transformadas em jornada",
    },
    {
      label: "Com e-mail",
      value: funnelEmailedJourneys.size,
      helper: "Jornadas que receberam contato",
    },
    {
      label: "Com clique",
      value: funnelClickedJourneys.size,
      helper: "Clique único por jornada",
    },
    {
      label: "Compras",
      value: funnelConversions.length,
      helper: "Atribuição exata por clique",
    },
  ];

  const flowJourneyIds = new Set(
    logs
      .filter((log) => matchesFlow(log.recovery_flow, flowFilter))
      .map((log) => Number(log.journey_id))
  );
  const visibleJourneys = journeys.filter(
    (journey) =>
      !flowFilter ||
      matchesFlow(journey.recovery_flow, flowFilter) ||
      matchesFlow(journey.current_status, flowFilter) ||
      flowJourneyIds.has(Number(journey.id))
  );
  const recentJourneys = [...visibleJourneys]
    .sort(
      (a, b) =>
        timestamp(b.updated_at || b.created_at) -
        timestamp(a.updated_at || a.created_at)
    )
    .slice(0, 8);

  const healthJourneys = visibleJourneys.filter(
    (journey) =>
      inPeriod(journey.updated_at || journey.created_at, start) ||
      inPeriod(journey.next_step_at, start)
  );
  const healthLogs = logs.filter(
    (log) =>
      matchesFlow(log.recovery_flow, flowFilter) &&
      inPeriod(log.sent_at || log.created_at, start)
  );
  const healthEvents = events.filter(
    (event) =>
      inEventPeriod(event, start) &&
      (!flowFilter ||
        isEntryEvent(event, flowFilter) ||
        healthJourneys.some((journey) => eventMatchesJourney(event, journey)))
  );
  const duplicateGroups = activeDuplicateGroups(healthJourneys);
  const eventsWithError = healthEvents.filter((event) =>
    Boolean(String(event.processing_error || "").trim())
  );
  const unprocessedEvents = healthEvents.filter(
    (event) => event.processed !== true
  );
  const allActiveRecoveries = effectiveActiveJourneys(healthJourneys);
  const dueNow = allActiveRecoveries.filter(
    (journey) =>
      Boolean(journey.next_step_at) &&
      timestamp(journey.next_step_at) <= Date.now() - OPERATION_GRACE_MS
  );
  const withoutNextStep = allActiveRecoveries.filter(
    (journey) => !journey.next_step_at
  );
  const stuckClaims = healthLogs.filter(
    (log) =>
      String(log.status || "").toUpperCase() === "CLAIMED" &&
      timestamp(log.created_at) <= Date.now() - OPERATION_GRACE_MS
  );
  const brokenCheckoutLinks = healthLogs.filter(
    (log) =>
      String(log.status || "").toUpperCase() === "SENT" &&
      Boolean(safeCheckoutProblem(log))
  );
  const journeyById = new Map(
    journeys.map((journey) => [Number(journey.id), journey])
  );
  const emailsAfterPurchase = healthLogs.filter((log) => {
    if (String(log.status || "").toUpperCase() !== "SENT") return false;
    const journey = journeyById.get(Number(log.journey_id));
    return (
      Boolean(journey?.approved_at) &&
      timestamp(log.sent_at) > timestamp(journey?.approved_at) + 60_000
    );
  });
  const missingFirstEmail = allActiveRecoveries.filter(
    (journey) =>
      Number(journey.last_step_sent || 0) === 0 &&
      Boolean(journey.next_step_at) &&
      timestamp(journey.next_step_at) <= Date.now() - OPERATION_GRACE_MS
  );
  const unmatchedEntryEvents = healthEvents.filter(
    (event) =>
      isEntryEvent(event, flowFilter) &&
      eventTimestamp(event) <= Date.now() - OPERATION_GRACE_MS &&
      !journeys.some((journey) => eventMatchesJourney(event, journey))
  );
  const sentGroups = new Map<string, number>();
  for (const log of healthLogs) {
    if (String(log.status || "").toUpperCase() !== "SENT") continue;
    const key = `${log.journey_id}|${log.recovery_flow}|${log.step}`;
    sentGroups.set(key, (sentGroups.get(key) || 0) + 1);
  }
  const duplicateEmailGroups = [...sentGroups.values()].filter(
    (count) => count > 1
  ).length;
  const missingGmailIds = healthLogs.filter(
    (log) =>
      String(log.status || "").toUpperCase() === "SENT" &&
      !String(log.gmail_message_id || "").trim()
  );
  const legacyRecoveredJourneys = visibleJourneys.filter(
    (journey) =>
      journey.dashboardRecovery.recovered &&
      inPeriod(
        journey.dashboardRecovery.approvedAt || journey.updated_at,
        start
      )
  );
  const exactRecoveredJourneyIds = new Set(
    conversions.map((conversion) => Number(conversion.journey_id))
  );
  const historicalRecoveredJourneys = legacyRecoveredJourneys.filter(
    (journey) => !exactRecoveredJourneyIds.has(Number(journey.id))
  );
  const historicalRecoveredRevenue = historicalRecoveredJourneys.reduce(
    (sum, journey) => sum + Number(journey.dashboardRecovery.revenue || 0),
    0
  );
  const journeyByIdForRecovery = new Map(
    journeys.map((journey) => [Number(journey.id), journey])
  );
  const recoveredCustomers = [
    ...conversions.map((conversion) => {
      const journey = journeyByIdForRecovery.get(Number(conversion.journey_id));
      return {
        key: `tracked-${conversion.id}`,
        journeyId: Number(conversion.journey_id),
        buyerName: journey?.buyer_name || null,
        buyerEmail: journey?.buyer_email || null,
        flow: conversion.recovery_flow || journey?.recovery_flow || null,
        step: Number(conversion.step || 0) || null,
        revenue: Number(conversion.revenue || 0),
        currency: conversion.currency || journey?.currency || null,
        purchasedAt: conversion.converted_at || journey?.approved_at || null,
        source: "tracked" as const,
      };
    }),
    ...historicalRecoveredJourneys.map((journey) => ({
      key: `historical-${journey.id}`,
      journeyId: Number(journey.id),
      buyerName: journey.buyer_name,
      buyerEmail: journey.buyer_email,
      flow: journey.dashboardRecovery.flow || journey.recovery_flow,
      step: journey.dashboardRecovery.step,
      revenue: Number(journey.dashboardRecovery.revenue || 0),
      currency: journey.currency,
      purchasedAt:
        journey.dashboardRecovery.approvedAt || journey.approved_at || journey.updated_at,
      source:
        journey.dashboardRecovery.source === "inferred"
          ? ("inferred" as const)
          : ("historical" as const),
    })),
  ]
    .sort((a, b) => timestamp(b.purchasedAt) - timestamp(a.purchasedAt))
    .slice(0, 100);
  const eventProblemCount = new Set(
    [...eventsWithError, ...unprocessedEvents].map((event) => event.id)
  ).size;

  return {
    recoveredRevenue,
    recoveredSales: conversions.length,
    historicalRecoveredSales: historicalRecoveredJourneys.length,
    historicalRecoveredRevenue,
    recoveredCustomers,
    recoveryRate,
    clickRate,
    emailsSent: sentLogs.length,
    trackedEmails: trackedLogs.length,
    uniqueClicks: clickedLogs.length,
    activeRecoveries: activeRecoveries.length,
    funnel,
    sequence,
    byStep,
    byFlow,
    revenueByDay,
    recentJourneys,
    health: {
      possibleDuplicateGroups: duplicateGroups.length,
      possibleDuplicateJourneys: duplicateGroups.reduce(
        (sum, rows) => sum + rows.length,
        0
      ),
      duplicateJourneyIds: duplicateGroups.flatMap((rows) =>
        rows.map((journey) => journey.id)
      ),
      eventsWithError: eventsWithError.length,
      unprocessedEvents: unprocessedEvents.length,
      dueNow: dueNow.length,
      withoutNextStep: withoutNextStep.length,
      stuckClaims: stuckClaims.length,
      brokenCheckoutLinks: brokenCheckoutLinks.length,
      emailsAfterPurchase: emailsAfterPurchase.length,
      missingFirstEmail: missingFirstEmail.length,
      unmatchedEntryEvents: unmatchedEntryEvents.length,
      duplicateEmailGroups,
      missingGmailIds: missingGmailIds.length,
      inferredRecoveries: legacyRecoveredJourneys.filter(
        (journey) => journey.dashboardRecovery.source === "inferred"
      ).length,
      totalActionable:
        eventProblemCount +
        dueNow.length +
        withoutNextStep.length +
        stuckClaims.length +
        brokenCheckoutLinks.length +
        emailsAfterPurchase.length +
        unmatchedEntryEvents.length +
        duplicateEmailGroups +
        missingGmailIds.length,
      ignoredQa,
    },
  };
}

async function getJourneysUncached() {
  const [rawJourneys, rawLogs, rawEvents] = await Promise.all([
    fetchAll<PurchaseJourney>("purchase_journeys"),
    fetchAll<RecoveryEmailLog>("recovery_email_logs"),
    fetchAll<HotmartEvent>("hotmart_events"),
  ]);
  const { journeys } = prepareProductionData(
    rawJourneys,
    rawLogs,
    rawEvents
  );

  return journeys.sort(
    (a, b) =>
      timestamp(b.updated_at || b.created_at) -
      timestamp(a.updated_at || a.created_at)
  );
}

async function getAlertsUncached(period: Period, flow?: string) {
  const [rawJourneys, rawLogs, rawEvents] = await Promise.all([
    fetchAll<PurchaseJourney>("purchase_journeys"),
    fetchAll<RecoveryEmailLog>("recovery_email_logs"),
    fetchAll<HotmartEvent>("hotmart_events"),
  ]);
  const { journeys, logs, events, ignoredQa } = prepareProductionData(
    rawJourneys,
    rawLogs,
    rawEvents
  );
  const start = periodStart(period);
  const flowFilter = selectedFlow(flow);
  const now = Date.now();
  const journeyById = new Map(
    journeys.map((journey) => [Number(journey.id), journey])
  );
  type Alert = {
    id: string;
    severity: "critical" | "warning" | "info";
    category: string;
    title: string;
    detail: string;
    journeyId: number | null;
    buyerName: string | null;
    buyerEmail: string | null;
    at: string | null;
  };
  const alerts: Alert[] = [];
  const addJourneyAlert = (
    alert: Omit<Alert, "journeyId" | "buyerName" | "buyerEmail">,
    journey: DashboardJourney
  ) => {
    if (!inPeriod(alert.at, start)) return;
    if (
      flowFilter &&
      !matchesFlow(journey.recovery_flow, flowFilter) &&
      !logs.some(
        (log) =>
          Number(log.journey_id) === Number(journey.id) &&
          matchesFlow(log.recovery_flow, flowFilter)
      )
    ) {
      return;
    }
    alerts.push({
      ...alert,
      journeyId: Number(journey.id),
      buyerName: journey.buyer_name,
      buyerEmail: journey.buyer_email,
    });
  };

  const active = effectiveActiveJourneys(journeys);
  for (const journey of active) {
    const due = timestamp(journey.next_step_at);
    if (due > 0 && due <= now - OPERATION_GRACE_MS) {
      const first = Number(journey.last_step_sent || 0) === 0;
      addJourneyAlert(
        {
          id: `due-${journey.id}`,
          severity: first ? "critical" : "warning",
          category: "Envio atrasado",
          title: first
            ? "O primeiro e-mail ainda não foi enviado"
            : "A próxima etapa da jornada está atrasada",
          detail: first
            ? "A jornada já passou do horário e continua sem o primeiro contato."
            : `A etapa ${Number(journey.last_step_sent || 0) + 1} já deveria ter sido processada.`,
          at: journey.next_step_at,
        },
        journey
      );
    }
    if (!journey.next_step_at) {
      addJourneyAlert(
        {
          id: `schedule-${journey.id}`,
          severity: "critical",
          category: "Jornada interrompida",
          title: "A jornada está ativa, mas não tem próximo horário",
          detail: "Sem próximo horário, nenhum novo e-mail será agendado.",
          at: journey.updated_at || journey.created_at,
        },
        journey
      );
    }
  }

  for (const log of logs) {
    if (!matchesFlow(log.recovery_flow, flowFilter)) continue;
    const journey = journeyById.get(Number(log.journey_id));
    if (!journey) continue;
    const status = String(log.status || "").toUpperCase();
    if (
      status === "CLAIMED" &&
      timestamp(log.created_at) <= now - OPERATION_GRACE_MS
    ) {
      addJourneyAlert(
        {
          id: `claimed-${log.id}`,
          severity: "critical",
          category: "Envio travado",
          title: "Um e-mail foi reservado, mas não terminou",
          detail: `Etapa ${log.step || "?"} em CLAIMED há mais de 15 minutos.`,
          at: log.created_at,
        },
        journey
      );
    }
    if (
      status === "SENT" &&
      journey.approved_at &&
      timestamp(log.sent_at) > timestamp(journey.approved_at) + 60_000
    ) {
      addJourneyAlert(
        {
          id: `after-purchase-${log.id}`,
          severity: "critical",
          category: "Envio após compra",
          title: "O cliente recebeu e-mail depois de comprar",
          detail: `A etapa ${log.step || "?"} saiu após a aprovação registrada.`,
          at: log.sent_at,
        },
        journey
      );
    }
    const checkoutProblem = status === "SENT" ? safeCheckoutProblem(log) : null;
    if (checkoutProblem) {
      addJourneyAlert(
        {
          id: `checkout-${log.id}`,
          severity: "critical",
          category: "Link ou cupom",
          title: "O botão do e-mail precisa de revisão",
          detail: checkoutProblem,
          at: log.sent_at || log.created_at,
        },
        journey
      );
    }
    if (status === "SENT" && !String(log.gmail_message_id || "").trim()) {
      addJourneyAlert(
        {
          id: `gmail-${log.id}`,
          severity: "warning",
          category: "Confirmação do envio",
          title: "O Gmail não devolveu um identificador",
          detail: `A etapa ${log.step || "?"} está como enviada, mas sem confirmação.`,
          at: log.sent_at || log.created_at,
        },
        journey
      );
    }
  }

  const sentGroups = new Map<string, RecoveryEmailLog[]>();
  for (const log of logs) {
    if (String(log.status || "").toUpperCase() !== "SENT") continue;
    if (!matchesFlow(log.recovery_flow, flowFilter)) continue;
    const key = `${log.journey_id}|${log.recovery_flow}|${log.step}`;
    const rows = sentGroups.get(key) || [];
    rows.push(log);
    sentGroups.set(key, rows);
  }
  for (const rows of sentGroups.values()) {
    if (rows.length < 2) continue;
    const log = rows[rows.length - 1];
    const journey = journeyById.get(Number(log.journey_id));
    if (!journey) continue;
    addJourneyAlert(
      {
        id: `duplicate-email-${log.id}`,
        severity: "critical",
        category: "Duplicação",
        title: "A mesma etapa foi enviada mais de uma vez",
        detail: `${rows.length} envios encontrados para a etapa ${log.step || "?"}.`,
        at: log.sent_at || log.created_at,
      },
      journey
    );
  }

  for (const event of events) {
    if (!inEventPeriod(event, start)) continue;
    if (
      flowFilter &&
      !isEntryEvent(event, flowFilter) &&
      !journeys.some(
        (journey) =>
          matchesFlow(journey.recovery_flow, flowFilter) &&
          eventMatchesJourney(event, journey)
      )
    ) {
      continue;
    }
    if (event.processing_error || event.processed !== true) {
      alerts.push({
        id: `event-${event.id}`,
        severity: event.processing_error ? "critical" : "warning",
        category: "Evento Hotmart",
        title: event.processing_error
          ? "Um evento terminou com erro"
          : "Um evento ainda não foi processado",
        detail: event.processing_error || event.event_type || "Evento sem identificação.",
        journeyId: null,
        buyerName: event.buyer_name,
        buyerEmail: event.buyer_email,
        at: event.created_at,
      });
    }
    if (
      isEntryEvent(event, flowFilter) &&
      eventTimestamp(event) <= now - OPERATION_GRACE_MS &&
      !journeys.some((journey) => eventMatchesJourney(event, journey))
    ) {
      alerts.push({
        id: `unmatched-${event.id}`,
        severity: "critical",
        category: "Jornada ausente",
        title: "A entrada da Hotmart não virou uma jornada",
        detail: event.event_type || "Evento de recuperação sem jornada correspondente.",
        journeyId: null,
        buyerName: event.buyer_name,
        buyerEmail: event.buyer_email,
        at: event.created_at,
      });
    }
  }

  const priority = { critical: 0, warning: 1, info: 2 } as const;
  alerts.sort(
    (a, b) =>
      priority[a.severity] - priority[b.severity] ||
      timestamp(b.at) - timestamp(a.at)
  );

  return {
    alerts: alerts.slice(0, 300),
    total: alerts.length,
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    warning: alerts.filter((alert) => alert.severity === "warning").length,
    info: alerts.filter((alert) => alert.severity === "info").length,
    ignoredQa,
    checkedAt: new Date().toISOString(),
  };
}

async function getJourneyDetailsUncached(id: number) {
  const supabase = getAdminClient();
  const { data: rawJourney, error: journeyError } = await supabase
    .from("purchase_journeys")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (journeyError) {
    throw new Error("purchase_journeys: " + journeyError.message);
  }
  if (!rawJourney) return null;

  const journey = rawJourney as PurchaseJourney;
  if (isQaJourney(journey)) return null;

  const { data: rawLogs, error: logsError } = await supabase
    .from("recovery_email_logs")
    .select("*")
    .eq("journey_id", id)
    .order("created_at", { ascending: true });

  if (logsError) {
    throw new Error("recovery_email_logs: " + logsError.message);
  }

  const eventQueries = [];
  if (journey.transaction_id) {
    eventQueries.push(
      supabase
        .from("hotmart_events")
        .select("*")
        .eq("transaction_id", journey.transaction_id)
    );
  }
  if (journey.buyer_email) {
    let identityQuery = supabase
      .from("hotmart_events")
      .select("*")
      .eq("buyer_email", journey.buyer_email);

    identityQuery =
      journey.product_id != null
        ? identityQuery.eq("product_id", journey.product_id)
        : identityQuery.is("product_id", null);

    identityQuery = journey.offer_code
      ? identityQuery.eq("offer_code", journey.offer_code)
      : identityQuery.is("offer_code", null);
    eventQueries.push(identityQuery);
  }

  const eventResults = await Promise.all(eventQueries);
  const eventMap = new Map<number, HotmartEvent>();
  for (const result of eventResults) {
    if (result.error) {
      throw new Error("hotmart_events: " + result.error.message);
    }
    for (const event of (result.data || []) as HotmartEvent[]) {
      if (!isQaEvent(event)) eventMap.set(Number(event.id), event);
    }
  }

  const logs = ((rawLogs || []) as RecoveryEmailLog[]).filter(
    (log) => !isQaMarker(log.recovery_flow)
  );
  const events = [...eventMap.values()].sort(
    (a, b) => eventTimestamp(a) - eventTimestamp(b)
  );
  const logsByJourney = new Map<number, RecoveryEmailLog[]>([[id, logs]]);
  const dashboardJourney: DashboardJourney = {
    ...journey,
    dashboardRecovery: recoveryForJourney(journey, logsByJourney, events),
  };

  return { journey: dashboardJourney, logs, events };
}

async function getEmailAnalyticsUncached(period: Period, flow?: string) {
  const [rawJourneys, rawLogs, rawEvents, rawConversions] = await Promise.all([
    fetchAll<PurchaseJourney>("purchase_journeys"),
    fetchAll<RecoveryEmailLog>("recovery_email_logs"),
    fetchAll<HotmartEvent>("hotmart_events"),
    fetchAll<RecoveryConversion>("recovery_conversions"),
  ]);
  const { journeys, logs, events, ignoredQa } = prepareProductionData(
    rawJourneys,
    rawLogs,
    rawEvents
  );

  const start = periodStart(period);
  const flowFilter = selectedFlow(flow);
  const allSent = logs.filter(
    (log) =>
      String(log.status || "").toUpperCase() === "SENT" &&
      matchesFlow(log.recovery_flow, flowFilter)
  );
  const lastSentAt = [...allSent]
    .sort(
      (a, b) =>
        timestamp(b.sent_at || b.created_at) -
        timestamp(a.sent_at || a.created_at)
    )[0]?.sent_at || null;
  const lastEventAt = [...events]
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))[0]?.created_at || null;
  const stuckClaims = logs.filter(
    (log) =>
      String(log.status || "").toUpperCase() === "CLAIMED" &&
      matchesFlow(log.recovery_flow, flowFilter) &&
      timestamp(log.sent_at || log.created_at) <= Date.now() - OPERATION_GRACE_MS
  ).length;
  const overdueJourneys = effectiveActiveJourneys(journeys).filter(
    (journey) =>
      matchesFlow(journey.recovery_flow, flowFilter) &&
      Boolean(journey.next_step_at) &&
      timestamp(journey.next_step_at) <= Date.now() - OPERATION_GRACE_MS
  ).length;
  const sent = logs.filter(
    (log) =>
      String(log.status || "").toUpperCase() === "SENT" &&
      inPeriod(log.sent_at || log.created_at, start) &&
      matchesFlow(log.recovery_flow, flowFilter)
  );
  const productionJourneyIds = new Set(
    journeys.map((journey) => Number(journey.id))
  );
  const sentLogIds = new Set(sent.map((log) => Number(log.id)));
  const conversions = rawConversions.filter(
    (conversion) =>
      productionJourneyIds.has(Number(conversion.journey_id)) &&
      sentLogIds.has(Number(conversion.email_log_id)) &&
      matchesFlow(conversion.recovery_flow, flowFilter)
  );

  const byStep = [1, 2, 3].map((step) => {
    const sentAtStep = sent.filter(
      (log) => Number(log.step || 0) === step
    );
    const trackedAtStep = sentAtStep.filter((log) => Boolean(log.checkout_url));
    const sentIdsAtStep = new Set(
      sentAtStep.map((log) => Number(log.id))
    );
    const conversionsAtStep = conversions.filter((conversion) =>
      sentIdsAtStep.has(Number(conversion.email_log_id))
    );
    const uniqueClicks = trackedAtStep.filter(
      (log) => Number(log.click_count || 0) > 0
    ).length;

    return {
      step,
      sent: sentAtStep.length,
      trackedSent: trackedAtStep.length,
      clicks: trackedAtStep.reduce(
        (sum, log) => sum + Number(log.click_count || 0),
        0
      ),
      uniqueClicks,
      clickRate:
        trackedAtStep.length > 0
          ? (uniqueClicks / trackedAtStep.length) * 100
          : 0,
      recovered: conversionsAtStep.length,
      revenue: conversionsAtStep.reduce(
        (sum, conversion) => sum + Number(conversion.revenue || 0),
        0
      ),
      conversionRate:
        trackedAtStep.length > 0
          ? (conversionsAtStep.length / trackedAtStep.length) * 100
          : 0,
      clickToPurchaseRate:
        uniqueClicks > 0
          ? (conversionsAtStep.length / uniqueClicks) * 100
          : 0,
    };
  });

  const conversionsByLog = new Map<number, RecoveryConversion>();
  for (const conversion of conversions) {
    conversionsByLog.set(Number(conversion.email_log_id), conversion);
  }

  const flowMap = new Map<
    string,
    {
      sent: number;
      trackedSent: number;
      uniqueClicks: number;
      recovered: number;
      revenue: number;
    }
  >();
  for (const log of sent) {
    const flow = log.recovery_flow || "NÃO IDENTIFICADO";
    const current = flowMap.get(flow) || {
      sent: 0,
      trackedSent: 0,
      uniqueClicks: 0,
      recovered: 0,
      revenue: 0,
    };
    current.sent += 1;
    if (log.checkout_url) current.trackedSent += 1;
    if (Number(log.click_count || 0) > 0) current.uniqueClicks += 1;
    const conversion = conversionsByLog.get(Number(log.id));
    if (conversion) {
      current.recovered += 1;
      current.revenue += Number(conversion.revenue || 0);
    }
    flowMap.set(flow, current);
  }

  const byFlow = [...flowMap.entries()]
    .map(([flow, value]) => ({
      flow,
      ...value,
      clickRate:
        value.trackedSent > 0
          ? (value.uniqueClicks / value.trackedSent) * 100
          : 0,
    }))
    .sort((a, b) => b.sent - a.sent);

  const recent = [...sent]
    .sort(
      (a, b) =>
        timestamp(b.sent_at || b.created_at) -
        timestamp(a.sent_at || a.created_at)
    )
    .slice(0, 100);

  const trackedSent = sent.filter((log) => Boolean(log.checkout_url));
  const clickDelays = trackedSent
    .filter((log) => log.first_clicked_at && timestamp(log.sent_at) > 0)
    .map(
      (log) =>
        (timestamp(log.first_clicked_at) - timestamp(log.sent_at)) / 60_000
    )
    .filter((minutes) => minutes >= 0);
  const purchaseDelays = conversions
    .map(
      (conversion) =>
        (timestamp(conversion.converted_at) - timestamp(conversion.clicked_at)) /
        60_000
    )
    .filter((minutes) => minutes >= 0);
  const hourMap = new Map<number, { sent: number; clicked: number }>();
  const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  });
  for (const log of trackedSent) {
    if (!log.sent_at) continue;
    const hour = Number(hourFormatter.format(new Date(log.sent_at)));
    if (!Number.isFinite(hour)) continue;
    const current = hourMap.get(hour) || { sent: 0, clicked: 0 };
    current.sent += 1;
    if (Number(log.click_count || 0) > 0) current.clicked += 1;
    hourMap.set(hour, current);
  }
  const bestHour = [...hourMap.entries()]
    .map(([hour, value]) => ({
      hour,
      sent: value.sent,
      clickRate: value.sent > 0 ? (value.clicked / value.sent) * 100 : 0,
    }))
    .filter((row) => row.sent >= MINIMUM_BEST_HOUR_SENDS)
    .sort((a, b) => b.clickRate - a.clickRate || b.sent - a.sent)[0] || null;

  const offerMap = new Map<
    string,
    { sent: number; tracked: number; clicks: number; purchases: number; revenue: number }
  >();
  for (const log of sent) {
    const logFlow = String(log.recovery_flow || "").toUpperCase();
    const offer =
      DISCOUNT_FLOWS.has(logFlow) && Number(log.step) === 2
        ? "CUPOM1"
        : DISCOUNT_FLOWS.has(logFlow) && Number(log.step) === 3
          ? "CUPOM2"
          : "Sem desconto";
    const current = offerMap.get(offer) || {
      sent: 0,
      tracked: 0,
      clicks: 0,
      purchases: 0,
      revenue: 0,
    };
    current.sent += 1;
    if (log.checkout_url) current.tracked += 1;
    if (Number(log.click_count || 0) > 0) current.clicks += 1;
    const conversion = conversionsByLog.get(Number(log.id));
    if (conversion) {
      current.purchases += 1;
      current.revenue += Number(conversion.revenue || 0);
    }
    offerMap.set(offer, current);
  }
  const byOffer = [...offerMap.entries()].map(([offer, value]) => ({
    offer,
    ...value,
    clickRate: value.tracked > 0 ? (value.clicks / value.tracked) * 100 : 0,
    conversionRate:
      value.tracked > 0 ? (value.purchases / value.tracked) * 100 : 0,
  }));

  return {
    system: {
      lastSentAt,
      lastEventAt,
      stuckClaims,
      overdueJourneys,
    },
    byStep,
    byFlow,
    recent,
    totalSent: sent.length,
    trackedSent: trackedSent.length,
    totalClicks: sent.reduce(
      (sum, log) => sum + Number(log.click_count || 0),
      0
    ),
    uniqueClicks: sent.filter((log) => Number(log.click_count || 0) > 0)
      .length,
    conversions: conversions.length,
    recoveredRevenue: conversions.reduce(
      (sum, conversion) => sum + Number(conversion.revenue || 0),
      0
    ),
    avgClickMinutes:
      clickDelays.length > 0
        ? clickDelays.reduce((sum, value) => sum + value, 0) / clickDelays.length
        : null,
    avgPurchaseMinutes:
      purchaseDelays.length > 0
        ? purchaseDelays.reduce((sum, value) => sum + value, 0) /
          purchaseDelays.length
        : null,
    bestHour,
    bestHourMinimum: MINIMUM_BEST_HOUR_SENDS,
    byOffer,
    ignoredQa,
  };
}

async function getEventsUncached() {
  const rawEvents = await fetchAll<HotmartEvent>("hotmart_events");
  const events = rawEvents
    .filter((event) => !isQaEvent(event))
    .sort(
      (a, b) =>
        timestamp(b.created_at) - timestamp(a.created_at)
    );
  const problems = events.filter(
    (event) =>
      event.processed !== true ||
      Boolean(String(event.processing_error || "").trim())
  );

  return {
    events: events.slice(0, 300),
    problems,
    total: events.length,
    shown: Math.min(events.length, 300),
    errors: events.filter((event) =>
      Boolean(String(event.processing_error || "").trim())
    ).length,
    unprocessed: events.filter((event) => event.processed !== true).length,
    ignoredQa: rawEvents.length - events.length,
  };
}

export function getOverview(period: Period, flow?: string) {
  return cached(`overview:${period}:${flow || ""}`, 30_000, () =>
    getOverviewUncached(period, flow)
  );
}

export function getJourneys() {
  return cached("journeys", 30_000, getJourneysUncached);
}

export function getAlerts(period: Period, flow?: string) {
  return cached(`alerts:${period}:${flow || ""}`, 30_000, () =>
    getAlertsUncached(period, flow)
  );
}

export function getJourneyDetails(id: number) {
  return cached(`journey-details:${id}`, 30_000, () =>
    getJourneyDetailsUncached(id)
  );
}

export function getEmailAnalytics(period: Period, flow?: string) {
  return cached(`email-analytics:${period}:${flow || ""}`, 30_000, () =>
    getEmailAnalyticsUncached(period, flow)
  );
}

export function getEvents() {
  return cached("events", 30_000, getEventsUncached);
}
