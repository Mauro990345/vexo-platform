import { prisma } from "@/lib/prisma";
import {
  addFollowUpStep,
  updateFollowUpStep,
  deleteFollowUpStep,
  moveFollowUpStep,
} from "./actions";

export const dynamic = "force-dynamic";

function preview(text: string, max = 70): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

export default async function FollowUpPage() {
  const steps = await prisma.followUpStep.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sequência de follow-up</h1>
        <p className="mt-1 text-sm text-vexo-muted">
          Essa sequência é única e vale pra todas as clínicas. Ela alimenta o job de follow-up
          que já roda automaticamente: quando um lead some no meio da conversa ou não comparece a
          um agendamento, o passo 1 é enviado depois do número de dias configurado abaixo; os
          passos seguintes são enviados respeitando o espaçamento desde o passo anterior. A
          sequência para assim que o lead responder. Clique num passo pra editar.
        </p>
        {steps.length === 0 && (
          <p className="mt-3 rounded-lg border border-vexo-border bg-vexo-surface p-3 text-xs text-vexo-muted">
            Nenhum passo configurado ainda — enquanto isso, o sistema usa uma mensagem padrão
            única (imediata) pra não ficar mudo. Assim que você adicionar passos aqui, eles
            substituem esse padrão.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <details key={step.id} className="group rounded-xl border border-vexo-border bg-vexo-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 rounded-full border border-vexo-border px-2 py-0.5 text-xs text-vexo-muted">
                  Passo {i + 1}
                </span>
                <span className="shrink-0 text-xs text-vexo-muted">
                  {i === 0 ? `dia ${step.offsetDays}` : `+${step.offsetDays}d`}
                </span>
                <span className="truncate text-sm">{preview(step.content)}</span>
                {step.attachmentUrl && (
                  <span className="shrink-0 text-xs text-vexo-muted" title="Tem anexo">
                    📎
                  </span>
                )}
              </div>
              <span className="shrink-0 text-xs text-vexo-muted transition group-open:rotate-180">▾</span>
            </summary>

            <div className="border-t border-vexo-border p-4">
              <div className="mb-3 flex items-center justify-end gap-1">
                <form action={moveFollowUpStep.bind(null, step.id, "up")}>
                  <button
                    disabled={i === 0}
                    className="rounded-md border border-vexo-border px-2 py-1 text-xs text-vexo-muted hover:border-vexo-accent hover:text-vexo-fg disabled:opacity-30"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveFollowUpStep.bind(null, step.id, "down")}>
                  <button
                    disabled={i === steps.length - 1}
                    className="rounded-md border border-vexo-border px-2 py-1 text-xs text-vexo-muted hover:border-vexo-accent hover:text-vexo-fg disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>
                <form action={deleteFollowUpStep.bind(null, step.id)}>
                  <button className="rounded-md border border-vexo-border px-2 py-1 text-xs text-red-400 hover:border-red-500/40">
                    Remover
                  </button>
                </form>
              </div>

              <form action={updateFollowUpStep.bind(null, step.id)} className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm text-vexo-muted">
                    {i === 0 ? "Enviado quantos dias após o lead sumir ou faltar" : "Enviado quantos dias após o passo anterior"}
                  </label>
                  <input
                    name="offsetDays"
                    type="number"
                    min={0}
                    required
                    defaultValue={step.offsetDays}
                    className="w-28 rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm text-vexo-muted">Texto da mensagem</label>
                  <textarea
                    name="content"
                    rows={3}
                    required
                    defaultValue={step.content}
                    className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm text-vexo-muted">
                    Anexo (opcional — URL de imagem ou vídeo)
                  </label>
                  <input
                    name="attachmentUrl"
                    defaultValue={step.attachmentUrl ?? ""}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
                  />
                </div>

                <button
                  type="submit"
                  className="rounded-lg border border-vexo-border px-3 py-1.5 text-xs font-medium hover:border-vexo-accent"
                >
                  Salvar passo {i + 1}
                </button>
              </form>
            </div>
          </details>
        ))}
      </div>

      <form
        action={addFollowUpStep}
        className="space-y-3 rounded-xl border border-dashed border-vexo-border p-4"
      >
        <h2 className="text-sm font-medium text-vexo-muted">
          Adicionar passo {steps.length + 1}
        </h2>

        <div>
          <label className="mb-1.5 block text-sm text-vexo-muted">
            {steps.length === 0 ? "Enviado quantos dias após o lead sumir ou faltar" : "Enviado quantos dias após o passo anterior"}
          </label>
          <input
            name="offsetDays"
            type="number"
            min={0}
            required
            defaultValue={0}
            className="w-28 rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-vexo-muted">Texto da mensagem</label>
          <textarea
            name="content"
            rows={3}
            required
            placeholder="Ex: Oi! Ainda tem interesse em agendar sua avaliação?"
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-vexo-muted">
            Anexo (opcional — URL de imagem ou vídeo)
          </label>
          <input
            name="attachmentUrl"
            placeholder="https://..."
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-vexo-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Adicionar passo
        </button>
      </form>
    </div>
  );
}
