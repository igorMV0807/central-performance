"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remaining !== 0) return;

    router.refresh();
    setRemaining(seconds);
  }, [remaining, router, seconds]);

  return (
    <button
      type="button"
      onClick={() => {
        router.refresh();
        setRemaining(seconds);
      }}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
      title="Atualizar os dados agora"
    >
      <RefreshCw size={14} />
      Atualiza em {remaining}s
    </button>
  );
}
