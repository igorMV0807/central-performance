"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [checking, setChecking] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setChecking(false);
      setValidLink(Boolean(data.session));
      if (!data.session) {
        setError("Este link é inválido ou expirou. Solicite um novo link na tela de login.");
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        setValidLink(true);
        setError("");
        setChecking(false);
      }
    });

    void checkSession();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("Não foi possível alterar a senha. Solicite um novo link e tente novamente.");
        return;
      }
      await supabase.auth.signOut();
      router.replace("/login?reset=success");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-700">LINK CONFIRMADO</p>
            <h1 className="text-2xl font-semibold">Crie sua nova senha</h1>
          </div>
        </div>

        {checking ? (
          <p className="text-sm text-slate-500">Validando o link de recuperação...</p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Nova senha</span>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (validLink) setError("");
                }}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Repita a nova senha</span>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                type="password"
                value={confirmation}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  if (validLink) setError("");
                }}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-700">{error}</p>}

            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-medium text-white transition hover:bg-slate-800 disabled:opacity-60" disabled={loading || !validLink}>
              {loading ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
