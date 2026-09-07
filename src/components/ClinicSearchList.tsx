"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteClinic } from "@/app/crm/clinicas/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

type ClinicRow = { id: string; name: string; active: boolean };

// Busca client-side simples (sem round-trip) — a lista de clínicas já
// costuma ser pequena o bastante pra filtrar direto no navegador.
export function ClinicSearchList({ clinics }: { clinics: ClinicRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter((c) => c.name.toLowerCase().includes(q));
  }, [clinics, query]);

  return (
    <div className="max-w-md space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar clínica..."
        className="w-full rounded-lg border border-vexo-border bg-vexo-surface px-3 py-2 text-sm outline-none focus:border-vexo-accent"
      />

      <ul className="divide-y divide-vexo-border overflow-hidden rounded-xl border border-vexo-border">
        {filtered.map((clinic) => (
          <li key={clinic.id} className="flex items-center">
            <Link
              href={`/crm/clinicas/${clinic.id}`}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-sm transition hover:bg-vexo-surface2"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${clinic.active ? "bg-vexo-success" : "bg-vexo-muted"}`}
                title={clinic.active ? "Ativa" : "Inativa"}
              />
              <span className="truncate">{clinic.name}</span>
            </Link>
            <form action={deleteClinic.bind(null, clinic.id)} className="shrink-0 pr-3">
              <ConfirmSubmitButton
                confirmMessage={`Excluir a clínica "${clinic.name}" permanentemente? Isso apaga todos os dados dela (leads, conversas, agendamentos, histórico) e não pode ser desfeito.`}
                className="rounded-md border border-vexo-border px-2 py-1 text-card text-vexo-muted hover:border-vexo-error hover:text-vexo-error"
              >
                Excluir
              </ConfirmSubmitButton>
            </form>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-vexo-muted">Nenhuma clínica encontrada.</li>
        )}
      </ul>
    </div>
  );
}
