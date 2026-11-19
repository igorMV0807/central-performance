import Link from "next/link";

export const recoveryFlowOptions = [
  { value: "", label: "Todos" },
  { value: "ABANDONED", label: "Carrinho abandonado" },
  { value: "WAITING_PAYMENT", label: "Aguardando pagamento" },
  { value: "CANCELED", label: "Compra cancelada" },
  { value: "DELAYED", label: "Pagamento atrasado" },
  { value: "EXPIRED", label: "Pagamento expirado" },
];

export function FlowFilter({
  current,
  basePath,
  params = {},
}: {
  current?: string;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por jornada">
      {recoveryFlowOptions.map((option) => {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value) query.set(key, value);
        }
        if (option.value) query.set("flow", option.value);
        else query.delete("flow");
        const suffix = query.toString();

        return (
          <Link
            key={option.value || "all"}
            href={`${basePath}${suffix ? `?${suffix}` : ""}`}
            className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition ${
              String(current || "") === option.value
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

export function flowLabel(value?: string | null) {
  const normalized = String(value || "").toUpperCase();
  return (
    recoveryFlowOptions.find((option) => option.value === normalized)?.label ||
    value ||
    "Não identificado"
  );
}
