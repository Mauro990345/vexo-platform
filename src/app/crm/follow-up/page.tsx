import { prisma } from "@/lib/prisma";
import type { FollowUpStep, FollowUpTrigger } from "@prisma/client";
import {
  addFollowUpStep,
  updateFollowUpStep,
  deleteFollowUpStep,
  moveFollowUpStep,
  updateFollowUpSettings,
} from "./actions";

export const dynamic = "force-dynamic";

function preview(text: string, max = 70): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function StepList({
  steps,
  trigger,
  firstStepLabel,
}: {
  steps: FollowUpStep[];
  trigger: FollowUpTrigger;
  firstStepLabel: string;
}) {
  return (
    <div className="space-y-4">
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
                    {i === 0 ? firstStepLabel : "Enviado quantos dias após o passo anterior"}
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

      <form action={addFollowUpStep.bind(null, trigger)} className="space-y-3 rounded-xl border border-dashed border-vexo-border p-4">
        <h3 className="text-sm font-medium text-vexo-muted">Adicionar passo {steps.length + 1}</h3>

        <div>
          <label className="mb-1.5 block text-sm text-vexo-muted">
            {steps.length === 0 ? firstStepLabel : "Enviado quantos dias após o passo anterior"}
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

export default async function FollowUpPage() {
  const [silenceSteps, noShowSteps, settings] = await Promise.all([
    prisma.followUpStep.findMany({ where: { trigger: "SILENCE" }, orderBy: { order: "asc" } }),
    prisma.followUpStep.findMany({ where: { trigger: "NO_SHOW" }, orderBy: { order: "asc" } }),
    prisma.followUpSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const silenceHours = settings?.silenceHours ?? 24;

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Follow-up</h1>
        <p className="mt-1 text-sm text-vexo-muted">
          Duas sequências independentes, cada uma com seus próprios passos. Vale pra todas as
          clínicas. Clique num passo pra editar.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-medium">Parou de responder</h2>
          <p className="mt-1 text-sm text-vexo-muted">
            Gatilho automático: se o lead não responder dentro do prazo abaixo, o sistema detecta
            sozinho pela última mensagem da conversa e dispara essa sequência — sem precisar de
            nenhuma ação manual. Só vale antes do agendamento acontecer; depois que o lead agenda,
            esse gatilho para de valer e quem cuida dele é a sequência de lembretes/não
            compareceu.
          </p>
        </div>

        <form
          action={updateFollowUpSettings}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-vexo-border bg-vexo-surface p-4"
        >
          <div>
            <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="silenceHours">
              Considerar que o lead parou de responder depois de
            </label>
            <div className="flex items-center gap-2">
              <input
                id="silenceHours"
                name="silenceHours"
                type="number"
                min={1}
                required
                defaultValue={silenceHours}
                className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
              <span className="text-sm text-vexo-muted">horas</span>
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg border border-vexo-border px-3 py-2 text-sm font-medium hover:border-vexo-accent"
          >
            Salvar prazo
          </button>
        </form>

        {silenceSteps.length === 0 && (
          <p className="rounded-lg border border-vexo-border bg-vexo-surface p-3 text-xs text-vexo-muted">
            Nenhum passo configurado ainda — enquanto isso, o sistema usa uma mensagem padrão
            única (imediata) pra não ficar mudo.
          </p>
        )}

        <StepList
          steps={silenceSteps}
          trigger="SILENCE"
          firstStepLabel="Enviado quantas horas/dias após o lead parar de responder"
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-medium">Não compareceu</h2>
          <p className="mt-1 text-sm text-vexo-muted">
            Gatilho manual: só quem está na clínica sabe se o paciente veio ou não, então essa
            sequência só é disparada pelo botão <strong>"Não compareceu"</strong> na tela do
            agendamento — nunca automaticamente. Não tem folga escondida: você marca quando puder,
            sem pressa.
          </p>
        </div>

        {noShowSteps.length === 0 && (
          <p className="rounded-lg border border-vexo-border bg-vexo-surface p-3 text-xs text-vexo-muted">
            Nenhum passo configurado ainda — enquanto isso, o sistema usa uma mensagem padrão
            única, enviada no dia seguinte à marcação.
          </p>
        )}

        <StepList
          steps={noShowSteps}
          trigger="NO_SHOW"
          firstStepLabel="Enviado quantos dias após marcar como não compareceu"
        />
      </section>
    </div>
  );
}
