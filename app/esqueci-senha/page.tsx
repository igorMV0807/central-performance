"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/redefinir-senha` }
      );

      if (resetError) {
        setError("Não foi possível enviar o link agora. Tente novamente.");
        return;
      }

      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white">
            <KeyRound size={22} />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-700">ACESSO AO PAINEL</p>
            <h1 className="text-2xl font-semibold">Redefinir senha</h1>
          </div>
        </div>

        {sent ? (
          <div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
              Se esse e-mail estiver cadastrado, você receberá um link para criar uma nova senha. O link expira por segurança.
            </div>
            <Link className="mt-5 block text-center text-sm font-semibold text-blue-700" href="/login">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">E-mail da conta</span>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-medium text-white transition hover:bg-slate-800 disabled:opacity-60" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </button>
            <Link className="block text-center text-sm font-semibold text-blue-700" href="/login">
              Voltar para o login
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}
