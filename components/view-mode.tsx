import Link from "next/link";

export function ViewMode({
  current,
  basePath,
  params = {},
}: {
  current: "simple" | "advanced";
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {[
        { value: "simple", label: "Simples" },
        { value: "advanced", label: "Avançado" },
      ].map((option) => {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value) query.set(key, value);
        }
        if (option.value === "advanced") query.set("mode", "advanced");
        else query.delete("mode");
        return (
          <Link
            key={option.value}
            href={`${basePath}?${query.toString()}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              current === option.value
                ? "bg-slate-950 text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
