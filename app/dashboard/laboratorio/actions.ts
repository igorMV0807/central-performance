"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/admin";

type RpcResult = { error: { message: string } | null };

function callRpc(name: string, args: Record<string, unknown>) {
  const client = getAdminClient();
  const rpc = client.rpc.bind(client) as unknown as (
    functionName: string,
    functionArgs: Record<string, unknown>
  ) => Promise<RpcResult>;
  return rpc(name, args);
}

const experimentActions = new Set([
  "approve_start",
  "pause",
  "resume",
  "reject",
  "promote",
  "keep_champion",
]);

const assetTypes = new Set(["video_transcript", "offer_rules", "brand_rules", "legacy_copy"]);
const variantReviewActions = new Set(["save", "approve", "reject"]);

function labUrl(kind: "notice" | "error", message: string) {
  return `/dashboard/laboratorio?${kind}=${encodeURIComponent(message)}`;
}

export async function runExperimentAction(formData: FormData) {
  const user = await requireUser();
  const experimentId = String(formData.get("experiment_id") || "").trim();
  const action = String(formData.get("experiment_action") || "").trim();

  if (!experimentId || !experimentActions.has(action)) {
    redirect(labUrl("error", "Ação inválida. Atualize a página e tente novamente."));
  }

  const { error } = await callRpc("copy_laboratory_action", {
    p_experiment_id: experimentId,
    p_action: action,
    p_actor: user.id,
  });

  if (error) {
    redirect(labUrl("error", error.message));
  }

  const labels: Record<string, string> = {
    approve_start: "Teste aprovado e iniciado.",
    pause: "Teste pausado.",
    resume: "Teste retomado.",
    reject: "Copy desafiante rejeitada.",
    promote: "A desafiante virou a nova campeã.",
    keep_champion: "Teste encerrado e campeã mantida.",
  };

  revalidatePath("/dashboard/laboratorio");
  redirect(labUrl("notice", labels[action]));
}

export async function runVariantReviewAction(formData: FormData) {
  const user = await requireUser();
  const variantId = String(formData.get("variant_id") || "").trim();
  const action = String(formData.get("variant_action") || "").trim();

  if (!variantId || !variantReviewActions.has(action)) {
    redirect(labUrl("error", "Ação de revisão inválida. Atualize a página e tente novamente."));
  }

  const value = (name: string) => String(formData.get(name) || "").trim();
  const { error } = await callRpc("copy_review_variant", {
    p_variant_id: variantId,
    p_action: action,
    p_actor: user.id,
    p_subject: action === "reject" ? null : value("subject"),
    p_preheader: action === "reject" ? null : value("preheader"),
    p_body: action === "reject" ? null : value("body"),
    p_button_text: action === "reject" ? null : value("button_text"),
    p_footer: action === "reject" ? null : value("footer"),
    p_hypothesis: action === "reject" ? null : value("hypothesis"),
  });

  if (error) {
    redirect(labUrl("error", error.message));
  }

  const labels: Record<string, string> = {
    save: "Rascunho salvo. Nenhum teste foi iniciado.",
    approve: "Copy aprovada e teste 50/50 iniciado.",
    reject: "Rascunho rejeitado. Nenhum e-mail foi afetado.",
  };

  revalidatePath("/dashboard/laboratorio");
  redirect(labUrl("notice", labels[action]));
}

export async function saveLaboratoryAsset(formData: FormData) {
  await requireUser();
  const assetType = String(formData.get("asset_type") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();
  const sourceUrl = String(formData.get("source_url") || "").trim();

  if (!assetTypes.has(assetType)) {
    redirect(labUrl("error", "Tipo de material inválido."));
  }

  const { error } = await callRpc("copy_laboratory_save_asset", {
    p_asset_type: assetType,
    p_title: title,
    p_content: content,
    p_source_url: sourceUrl || null,
  });

  if (error) {
    redirect(labUrl("error", error.message));
  }

  revalidatePath("/dashboard/laboratorio");
  redirect(labUrl("notice", "Material salvo. O laboratório usará esta versão nas próximas análises."));
}
