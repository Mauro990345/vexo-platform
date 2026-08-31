"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">VEXO</h1>
          <p className="mt-1 text-sm text-vexo-muted">M8 Growth</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-vexo-border bg-vexo-surface p-6 shadow-xl"
        >
          <div className="mb-4">
            <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
            />
          </div>

          <div className="mb-6">
            <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
            />
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-vexo-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
