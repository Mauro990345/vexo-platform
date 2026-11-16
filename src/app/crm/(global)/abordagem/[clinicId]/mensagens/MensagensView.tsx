"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { saveApproachMessagesAction, copyApproachMessagesFromAction } from "../../actions";

type Messages = { message1: string | null; message2: string | null; message3: string | null; message4: string | null; message5: string | null } | null;

export function MensagensView({
  clinicId,
  clinicName,
  messages,
  otherClinics,
}: {
  clinicId: string;
  clinicName: string;
  messages: Messages;
  otherClinics: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [copySource, setCopySource] = useState("");
  const [copyKey, setCopyKey] = useState(0); // força o form a reler os defaultValue após "Copiar"

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setSaved(false);
    startTransition(async () => {
      await saveApproachMessagesAction(clinicId, formData);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleCopy() {
    if (!copySource) return;
    startTransition(async () => {
      await copyApproachMessagesFromAction(clinicId, copySource);
      setCopyKey((k) => k + 1);
    });
  }

  return (
    <div className="mx-auto max-w-[520px] px-4 py-6 sm:px-0">
      <Link href="/crm/abordagem" className="text-caption text-vexo-muted hover:text-vexo-accent">
        ← Abordagem
      </Link>
      <h1 className="mt-1 text-base font-semibold tracking-tight text-vexo-fg">Mensagens · {clinicName}</h1>
      <p className="mt-1 text-xs text-vexo-muted">
        Até 5 mensagens — uma é sorteada a cada envio, sem repetir a mesma duas vezes seguidas. Use <code>{"{nome}"}</code>{" "}
        pra inserir o primeiro nome do lead.
      </p>

      {otherClinics.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={copySource}
            onChange={(e) => setCopySource(e.target.value)}
            className="min-w-0 flex-1 rounded-control border border-vexo-border bg-vexo-bg px-2 py-1.5 text-xs text-vexo-fg outline-none focus:border-vexo-accent"
          >
            <option value="">Copiar de outra clínica...</option>
            {otherClinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="ghost" size="sm" onClick={handleCopy} disabled={!copySource || isPending}>
            Copiar
          </Button>
        </div>
      )}

      <Card as="form" key={copyKey} onSubmit={handleSubmit} className="mt-3 space-y-3">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <div key={n}>
            <label className="mb-1 block text-caption text-vexo-muted" htmlFor={`message${n}`}>
              Mensagem {n} {n > 3 ? "(opcional)" : ""}
            </label>
            <textarea
              id={`message${n}`}
              name={`message${n}`}
              rows={2}
              defaultValue={(messages?.[`message${n}` as keyof NonNullable<Messages>] as string | null) ?? ""}
              placeholder="Oi {nome}! Vi seu perfil e queria te mostrar..."
              className="w-full resize-none rounded-control border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs text-vexo-fg outline-none focus:border-vexo-accent"
            />
          </div>
        ))}
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {saved ? "Salvo ✓" : "Salvar mensagens"}
        </Button>
      </Card>
    </div>
  );
}
