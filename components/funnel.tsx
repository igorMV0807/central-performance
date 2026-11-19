import { ArrowRight } from "lucide-react";

export function Funnel({
  items,
}: {
  items: { label: string; value: number; helper?: string }[];
}) {
  const first = Math.max(items[0]?.value || 0, 1);

  return (
    <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-center">
      {items.map((item, index) => {
        const rate = index === 0 ? 100 : (item.value / first) * 100;
        const previous = items[index - 1]?.value || 0;
        const stepRate = previous > 0 ? (item.value / previous) * 100 : 0;
        return (
          <div key={item.label} className="contents">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {item.value.toLocaleString("pt-BR")}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${Math.max(0, Math.min(100, rate))}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {item.helper ||
                  (index === 0
                    ? "Início do funil"
                    : `${stepRate.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}% da etapa anterior`)}
              </p>
            </div>
            {index < items.length - 1 && (
              <ArrowRight
                size={18}
                className="mx-auto rotate-90 text-slate-300 lg:rotate-0"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
