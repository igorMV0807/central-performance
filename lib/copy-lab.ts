import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";

export type CopyVariant = {
  id: string;
  platform: "hotmart" | "perfectpay";
  recovery_flow: string;
  step: number;
  version_number: number;
  role: string;
  status: string;
  subject: string;
  preheader: string;
  body: string;
  button_text: string;
  footer: string;
  offer_code: string | null;
  original_price: number | null;
  displayed_price: number | null;
  hypothesis: string | null;
  generated_by: string;
  qa_passed: boolean;
  qa_report: Record<string, unknown> | null;
  approval_required: boolean;
  approved_at: string | null;
  activated_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type CopyExperiment = {
  id: string;
  platform: "hotmart" | "perfectpay";
  recovery_flow: string;
  step: number;
  champion_variant_id: string;
  challenger_variant_id: string;
  status: string;
  traffic_challenger_percent: number;
  primary_metric: string;
  minimum_sends_per_variant: number;
  minimum_purchases_total: number;
  winner_variant_id: string | null;
  decision_reason: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

type CopyEvaluation = {
  id: number;
  platform: "hotmart" | "perfectpay";
  experiment_id: string;
  evaluated_at: string;
  champion_metrics: Record<string, unknown> | string | null;
  challenger_metrics: Record<string, unknown> | string | null;
  decision: string;
  reason: string | null;
  promoted: boolean;
};

type CopyMetricSource = {
  copy_experiment_id: string;
  copy_variant_id: string;
  status: string;
  click_count: number | null;
  converted_at: string | null;
  converted_revenue: number | string | null;
};

export type CopyLiveMetrics = {
  sent: number;
  clicked: number;
  purchases: number;
  revenue: number;
  click_rate: number;
  conversion_rate: number;
  revenue_per_sent: number;
};

export type CopyTournamentCandidate = {
  id: string;
  platform: "hotmart" | "perfectpay";
  recovery_flow: string;
  step: number;
  variant_id: string;
  angle: string;
  sequence_number: number;
  stage: "screening" | "confirmation";
  status: "queued" | "manual_review" | "testing" | "completed" | "skipped";
  experiment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CopyAsset = {
  id: number;
  asset_type: string;
  title: string;
  content: string;
  source_url: string | null;
  is_active: boolean;
  updated_at: string;
};

type LabSettings = {
  mode: string;
  automatic_generation: boolean;
  automatic_promotion: boolean;
  default_challenger_percent: number;
  minimum_sends_per_variant: number;
  minimum_purchases_total: number;
  last_generated_at: string | null;
  last_evaluated_at: string | null;
};

function metricObject(value: CopyEvaluation["champion_metrics"]) {
  if (!value) return {} as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  }
  return value;
}

export async function getCopyLaboratory() {
  const supabase = getAdminClient();
  const [settingsResult, variantsResult, experimentsResult, evaluationsResult, assetsResult, tournamentResult, metricsResult] =
    await Promise.all([
      supabase.from("copy_laboratory_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("copy_variants").select("*").order("platform").order("recovery_flow").order("step").order("version_number", { ascending: false }),
      supabase.from("copy_experiments").select("*").order("platform").order("created_at", { ascending: false }),
      supabase.from("copy_evaluations").select("*").order("evaluated_at", { ascending: false }).limit(100),
      supabase.from("copy_laboratory_assets").select("*").order("updated_at", { ascending: false }),
      supabase.from("copy_tournament_candidates").select("*").order("platform").order("recovery_flow").order("step").order("sequence_number"),
      supabase
        .from("copy_experiment_email_metrics_source")
        .select("copy_experiment_id,copy_variant_id,status,click_count,converted_at,converted_revenue")
        .not("copy_experiment_id", "is", null),
    ]);

  for (const [name, result] of [
    ["copy_laboratory_settings", settingsResult],
    ["copy_variants", variantsResult],
    ["copy_experiments", experimentsResult],
    ["copy_evaluations", evaluationsResult],
    ["copy_laboratory_assets", assetsResult],
    ["copy_tournament_candidates", tournamentResult],
    ["copy_experiment_email_metrics_source", metricsResult],
  ] as const) {
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
  }

  const settings = settingsResult.data as LabSettings | null;
  const variants = (variantsResult.data || []) as CopyVariant[];
  const experiments = (experimentsResult.data || []) as CopyExperiment[];
  const evaluations = (evaluationsResult.data || []) as CopyEvaluation[];
  const assets = (assetsResult.data || []) as CopyAsset[];
  const tournamentCandidates = (tournamentResult.data || []) as CopyTournamentCandidate[];
  const metricRows = (metricsResult.data || []) as CopyMetricSource[];
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const latestEvaluationByExperiment = new Map<string, CopyEvaluation>();
  const liveMetricsByVariant = buildLiveMetrics(metricRows);

  for (const evaluation of evaluations) {
    if (!latestEvaluationByExperiment.has(evaluation.experiment_id)) {
      latestEvaluationByExperiment.set(evaluation.experiment_id, evaluation);
    }
  }

  return {
    settings,
    champions: variants.filter((variant) => variant.role === "champion"),
    challengers: variants.filter((variant) => variant.role === "challenger"),
    rejected: variants.filter((variant) => variant.role === "rejected"),
    draftsForReview: variants
      .filter((variant) =>
        variant.platform === "perfectpay" &&
        variant.status === "qa_passed" &&
        variant.approval_required &&
        !variant.approved_at &&
        !variant.archived_at
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    experiments: experiments.map((experiment) => {
      const evaluation = latestEvaluationByExperiment.get(experiment.id) || null;
      return {
        ...experiment,
        championLiveMetrics: liveMetricsByVariant.get(`${experiment.id}:${experiment.champion_variant_id}`) || emptyLiveMetrics(),
        challengerLiveMetrics: liveMetricsByVariant.get(`${experiment.id}:${experiment.challenger_variant_id}`) || emptyLiveMetrics(),
        champion: variantById.get(experiment.champion_variant_id) || null,
        challenger: variantById.get(experiment.challenger_variant_id) || null,
        evaluation: evaluation
          ? {
              ...evaluation,
              champion_metrics: metricObject(evaluation.champion_metrics),
              challenger_metrics: metricObject(evaluation.challenger_metrics),
            }
          : null,
      };
    }),
    assets,
    tournamentCandidates: tournamentCandidates.map((candidate) => ({
      ...candidate,
      variant: variantById.get(candidate.variant_id) || null,
    })),
    activeAssets: assets.filter((asset) => asset.is_active),
    hasActiveVideo: assets.some((asset) => asset.asset_type === "video_transcript" && asset.is_active),
    hasOfferRules: assets.some((asset) => asset.asset_type === "offer_rules" && asset.is_active),
    hasBrandRules: assets.some((asset) => asset.asset_type === "brand_rules" && asset.is_active),
    lastResearchNote: assets.find((asset) => asset.asset_type === "research_note" && asset.is_active) || null,
  };
}

function emptyLiveMetrics(): CopyLiveMetrics {
  return {
    sent: 0,
    clicked: 0,
    purchases: 0,
    revenue: 0,
    click_rate: 0,
    conversion_rate: 0,
    revenue_per_sent: 0,
  };
}

function buildLiveMetrics(rows: CopyMetricSource[]) {
  const counters = new Map<string, { sent: number; clicked: number; purchases: number; revenue: number }>();

  for (const row of rows) {
    if (!row.copy_experiment_id || !row.copy_variant_id) continue;
    const key = `${row.copy_experiment_id}:${row.copy_variant_id}`;
    const counter = counters.get(key) || { sent: 0, clicked: 0, purchases: 0, revenue: 0 };

    if (String(row.status || "").toUpperCase() === "SENT") counter.sent += 1;
    if (Number(row.click_count || 0) > 0) counter.clicked += 1;
    if (row.converted_at) counter.purchases += 1;
    counter.revenue += Number(row.converted_revenue || 0);
    counters.set(key, counter);
  }

  const result = new Map<string, CopyLiveMetrics>();
  for (const [key, counter] of counters) {
    result.set(key, {
      ...counter,
      revenue: Number(counter.revenue.toFixed(2)),
      click_rate: counter.sent ? Number(((counter.clicked / counter.sent) * 100).toFixed(2)) : 0,
      conversion_rate: counter.sent ? Number(((counter.purchases / counter.sent) * 100).toFixed(2)) : 0,
      revenue_per_sent: counter.sent ? Number((counter.revenue / counter.sent).toFixed(4)) : 0,
    });
  }
  return result;
}
