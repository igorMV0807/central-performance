export function StatusBadge({ value }: { value?: string | null }) {
  const normalized = String(value || "—").toUpperCase();

  const classes =
    normalized === "APPROVED" || normalized === "COMPLETED" || normalized === "SENT"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : normalized === "ABANDONED" ||
          normalized === "WAITING_PAYMENT" ||
          normalized === "DELAYED"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : normalized === "CANCELED" ||
            normalized === "EXPIRED" ||
            normalized === "REFUND_REQUESTED" ||
            normalized === "REFUNDED" ||
            normalized === "CHARGEBACK" ||
            normalized === "FAILED" ||
            normalized === "ERROR"
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-slate-50 text-slate-600 ring-slate-200";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${classes}`}
    >
      {statusLabel(normalized)}
    </span>
  );
}

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "Aprovada",
  COMPLETED: "Concluída",
  SENT: "Enviado",
  ABANDONED: "Carrinho abandonado",
  WAITING_PAYMENT: "Aguardando pagamento",
  DELAYED: "Pagamento atrasado",
  CANCELED: "Compra cancelada",
  EXPIRED: "Pagamento expirado",
  REFUND_REQUESTED: "Reembolso solicitado",
  REFUNDED: "Reembolsada",
  CHARGEBACK: "Chargeback",
  CLAIMED: "Em processamento",
  SKIPPED: "Ignorado",
  FAILED: "Falhou",
  ERROR: "Erro",
  PENDING: "Pendente",
};

export function statusLabel(value?: string | null) {
  const normalized = String(value || "—").toUpperCase();
  return STATUS_LABELS[normalized] || normalized;
}
