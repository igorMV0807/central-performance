import Link from "next/link";
import type { Period } from "@/types/domain";

const options: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo" },
];

export function PeriodFilter({
  current,
  basePath,
  params = {},
}: {
  current: Period;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((option) => (
        <Link
          key={option.value}
          href={buildHref(basePath, params, "period", option.value)}
          className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
            current === option.value
              ? "bg-slate-950 text-white"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function buildHref(
  basePath: string,
  params: Record<string, string | undefined>,
  key: string,
  value: string
) {
  const query = new URLSearchParams();
  for (const [name, current] of Object.entries(params)) {
    if (current) query.set(name, current);
  }
  query.set(key, value);
  return `${basePath}?${query.toString()}`;
}
