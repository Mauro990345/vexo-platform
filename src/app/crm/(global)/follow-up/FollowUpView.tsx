import { prisma } from "@/lib/prisma";
import type { FollowUpStep, FollowUpTrigger } from "@prisma/client";
import { Clock, CalendarX } from "lucide-react";
import { Tabs } from "@/components/Tabs";
import {
  addFollowUpStep,
  updateFollowUpStep,
  deleteFollowUpStep,
  moveFollowUpStep,
  updateFollowUpSettings,
} from "./actions";

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
    <div className="space-y-3">
      <div className="space-y-2">
        {steps.map((step, i) => (
          <details key={step.id} className="group rounded-xl border border-vexo-border bg-vexo-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0 rounded-full border border-vexo-border px-1.5 py-0.5 text-card text-vexo-muted">
                  Passo {i + 1}
                </span>
                <span className="shrink-0 text-card text-vexo-muted">
                  {i === 0 ? `dia ${step.offsetDays}` : `+${step.offsetDays}d`}
                </span>
                <span className="truncate text-xs">{preview(step.content)}</span>
                {step.attachmentUrl && (
                  <span className="shrink-0 text-card text-vexo-muted" title="Tem anexo">
                    📎
                  </span>
                )}
              </div>
              <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
            </summary>

            <div className="border-t border-vexo-border p-3.5">
              <div className="mb-2.5 flex items-center justify-end gap-1">
                <form action={moveFollowUpStep.bind(null, step.id, "up")}>
                  <button
                    disabled={i === 0}
                    className="rounded-md border border-vexo-accent px-1.5 py-1 text-card text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-30"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveFollowUpStep.bind(null, step.id, "down")}>
                  <button
                    disabled={i === steps.length - 1}
                    className="rounded-md border border-vexo-accent px-1.5 py-1 text-card text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>
                <form action={deleteFollowUpStep.bind(null, step.id)}>
                  <button className="rounded-md border border-vexo-border px-1.5 py-1 text-card text-vexo-error hover:border-vexo-error/40">
                    Remover
                  </button>
                </form>
              </div>

              <form action={updateFollowUpStep.bind(null, step.id)} className="space-y-2.5">
                <div>
                  <label className="mb-1 block text-xs text-vexo-muted">
                    {i === 0 ? firstStepLabel : "Enviado quantos dias após o passo anterior"}
                  </label>
                  <input
                    name="offsetDays"
                    type="number"
                    min={0}
                    required
                    defaultValue={step.offsetDays}
                    className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-vexo-muted">Texto da mensagem</label>
                  <textarea
                    name="content"
                    rows={3}
                    required
                    defaultValue={step.content}
                    className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-vexo-muted">Anexo (opcional — imagem ou vídeo)</label>
                  {step.attachmentUrl && (
                    <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5">
                      <a
                        href={step.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 truncate text-xs text-vexo-accent hover:underline"
                      >
                        Ver anexo atual
                      </a>
                      <label className="flex shrink-0 items-center gap-1 text-card text-vexo-muted">
                        <input type="checkbox" name="removeAttachment" className="rounded border-vexo-border" />
                        Remover
                      </label>
                    </div>
                  )}
                  <input type="hidden" name="currentAttachmentUrl" value={step.attachmentUrl ?? ""} />
                  <input
                    name="attachmentFile"
                    type="file"
                    accept="image/*,video/*"
                    className="block w-full text-xs text-vexo-muted file:mr-2 file:rounded-lg file:border file:border-vexo-border file:bg-vexo-bg file:px-2.5 file:py-1.5 file:text-xs file:text-vexo-fg hover:file:border-vexo-accent"
                  />
                  <p className="mt-1 text-card text-vexo-muted">
                    {step.attachmentUrl ? "Escolher um novo arquivo substitui o atual." : "JPG, PNG, WEBP, GIF, MP4, MOV ou WEBM — até 25MB."}
                  </p>
                </div>

                <button
                  type="submit"
                  className="rounded-lg border border-vexo-accent px-2.5 py-1 text-card font-medium text-vexo-accent hover:bg-vexo-accent/10"
                >
                  Salvar passo {i + 1}
                </button>
              </form>
            </div>
          </details>
        ))}
      </div>

      <form action={addFollowUpStep.bind(null, trigger)} className="space-y-2.5 rounded-xl border border-dashed border-vexo-border p-3.5">
        <h3 className="text-xs font-medium text-vexo-muted">Adicionar passo {steps.length + 1}</h3>

        <div>
          <label className="mb-1 block text-xs text-vexo-muted">
            {steps.length === 0 ? firstStepLabel : "Enviado quantos dias após o passo anterior"}
          </label>
          <input
            name="offsetDays"
            type="number"
            min={0}
            required
            defaultValue={0}
            className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-vexo-muted">Texto da mensagem</label>
          <textarea
            name="content"
            rows={3}
            required
            placeholder="Ex: Oi! Ainda tem interesse em agendar sua avaliação?"
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-vexo-muted">Anexo (opcional — imagem ou vídeo)</label>
          <input
            name="attachmentFile"
            type="file"
            accept="image/*,video/*"
            className="block w-full text-xs text-vexo-muted file:mr-2 file:rounded-lg file:border file:border-vexo-border file:bg-vexo-bg file:px-2.5 file:py-1.5 file:text-xs file:text-vexo-fg hover:file:border-vexo-accent"
          />
          <p className="mt-1 text-card text-vexo-muted">JPG, PNG, WEBP, GIF, MP4, MOV ou WEBM — até 25MB.</p>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90"
        >
          Adicionar passo
        </button>
      </form>
    </div>
  );
}

// Renderiza a config de follow-up em si — reaproveitado tanto pela rota
// global (/crm/follow-up) quanto pela rota dentro do contexto de uma
// clínica (/crm/clinicas/[id]/follow-up), já que é a mesma configuração
// (FollowUpStep/FollowUpSettings não têm clinicId, é compartilhada por
// todas as clínicas) — só muda a sidebar em volta, não o conteúdo.
export async function FollowUpView() {
  const [silenceSteps, noShowSteps, settings] = await Promise.all([
    prisma.followUpStep.findMany({ where: { trigger: "SILENCE" }, orderBy: { order: "asc" } }),
    prisma.followUpStep.findMany({ where: { trigger: "NO_SHOW" }, orderBy: { order: "asc" } }),
    prisma.followUpSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const silenceHours = settings?.silenceHours ?? 24;

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Follow-up</h1>
        <p className="mt-1 text-xs text-vexo-muted">
          Duas sequências independentes, cada uma com seus próprios passos. Vale pra todas as
          clínicas. Clique num passo pra editar.
        </p>
      </div>

      <Tabs
        defaultTabId="silence"
        tabs={[
          {
            id: "silence",
            label: "Parou de responder",
            icon: <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Dispara automaticamente se o lead sumir antes de agendar — depois do
                  agendamento, quem assume é a sequência de não-compareceu.
                </p>

                <form
                  action={updateFollowUpSettings}
                  className="mt-5 flex flex-wrap items-end gap-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
                >
                  <div>
                    <label className="mb-1 block text-xs text-vexo-muted" htmlFor="silenceHours">
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
                        className="w-20 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                      />
                      <span className="text-xs text-vexo-muted">horas</span>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
                  >
                    Salvar prazo
                  </button>
                </form>

                <div className="mt-5">
                  <StepList
                    steps={silenceSteps}
                    trigger="SILENCE"
                    firstStepLabel="Enviado quantas horas/dias após o lead parar de responder"
                  />
                </div>
              </section>
            ),
          },
          {
            id: "no-show",
            label: "Não compareceu",
            icon: <CalendarX className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Dispara só quando você clica em <strong>"Não compareceu"</strong> na Agenda —
                  nunca automaticamente.
                </p>

                <div className="mt-2">
                  <StepList
                    steps={noShowSteps}
                    trigger="NO_SHOW"
                    firstStepLabel="Enviado quantos dias após marcar como não compareceu"
                  />
                </div>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
