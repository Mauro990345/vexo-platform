import { prisma } from "@/lib/prisma";
import type { FollowUpStep, FollowUpTrigger } from "@prisma/client";
import {
  addFollowUpStep,
  updateFollowUpStep,
  deleteFollowUpStep,
  moveFollowUpStep,
  updateFollowUpSettings,
  updateFollowUpWindow,
} from "./actions";

function preview(text: string, max = 70): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const WEEKDAY_LABELS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

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
                <span className="shrink-0 rounded-full border border-vexo-border px-1.5 py-0.5 text-[11px] text-vexo-muted">
                  Passo {i + 1}
                </span>
                <span className="shrink-0 text-[11px] text-vexo-muted">
                  {i === 0 ? `dia ${step.offsetDays}` : `+${step.offsetDays}d`}
                </span>
                <span className="truncate text-xs">{preview(step.content)}</span>
                {step.attachmentUrl && (
                  <span className="shrink-0 text-[11px] text-vexo-muted" title="Tem anexo">
                    📎
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-vexo-muted transition group-open:rotate-180">▾</span>
            </summary>

            <div className="border-t border-vexo-border p-3.5">
              <div className="mb-2.5 flex items-center justify-end gap-1">
                <form action={moveFollowUpStep.bind(null, step.id, "up")}>
                  <button
                    disabled={i === 0}
                    className="rounded-md border border-vexo-border px-1.5 py-1 text-[11px] text-vexo-muted hover:border-vexo-accent hover:text-vexo-fg disabled:opacity-30"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveFollowUpStep.bind(null, step.id, "down")}>
                  <button
                    disabled={i === steps.length - 1}
                    className="rounded-md border border-vexo-border px-1.5 py-1 text-[11px] text-vexo-muted hover:border-vexo-accent hover:text-vexo-fg disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>
                <form action={deleteFollowUpStep.bind(null, step.id)}>
                  <button className="rounded-md border border-vexo-border px-1.5 py-1 text-[11px] text-red-400 hover:border-red-500/40">
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
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-vexo-muted">
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
                  <p className="mt-1 text-[11px] text-vexo-muted">
                    {step.attachmentUrl ? "Escolher um novo arquivo substitui o atual." : "JPG, PNG, WEBP, GIF, MP4, MOV ou WEBM — até 25MB."}
                  </p>
                </div>

                <button
                  type="submit"
                  className="rounded-lg border border-vexo-border px-2.5 py-1 text-[11px] font-medium hover:border-vexo-accent"
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
          <p className="mt-1 text-[11px] text-vexo-muted">JPG, PNG, WEBP, GIF, MP4, MOV ou WEBM — até 25MB.</p>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
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
  const windowDays = settings?.windowDays?.length ? settings.windowDays : [1, 2, 3, 4, 5];
  const windowStart = minutesToTime(settings?.windowStartMinute ?? 8 * 60);
  const windowEnd = minutesToTime(settings?.windowEndMinute ?? 18 * 60);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Follow-up</h1>
        <p className="mt-1 text-xs text-vexo-muted">
          Duas sequências independentes, cada uma com seus próprios passos. Vale pra todas as
          clínicas. Clique num passo pra editar.
        </p>
      </div>

      <section className="space-y-2.5">
        <div>
          <h2 className="text-sm font-semibold">Janela de envio</h2>
          <p className="mt-1 text-xs text-vexo-muted">
            Vale para as duas sequências abaixo. Mensagens de follow-up só saem dentro desses dias
            e horário — se o gatilho acontecer fora da janela, a mensagem espera até a próxima
            janela válida em vez de disparar na hora.
          </p>
        </div>

        <form
          action={updateFollowUpWindow}
          className="space-y-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
        >
          <div>
            <label className="mb-1 block text-xs text-vexo-muted">Dias da semana</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((day) => (
                <label
                  key={day.value}
                  className="flex items-center gap-1.5 rounded-lg border border-vexo-border bg-vexo-bg px-2 py-1 text-xs has-[:checked]:border-vexo-accent has-[:checked]:text-vexo-accent"
                >
                  <input
                    type="checkbox"
                    name="windowDays"
                    value={day.value}
                    defaultChecked={windowDays.includes(day.value)}
                    className="rounded border-vexo-border"
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label className="mb-1 block text-xs text-vexo-muted" htmlFor="windowStart">
                Das
              </label>
              <input
                id="windowStart"
                name="windowStart"
                type="time"
                required
                defaultValue={windowStart}
                className="rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-vexo-muted" htmlFor="windowEnd">
                às
              </label>
              <input
                id="windowEnd"
                name="windowEnd"
                type="time"
                required
                defaultValue={windowEnd}
                className="rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-vexo-border px-2.5 py-1.5 text-xs font-medium hover:border-vexo-accent"
            >
              Salvar janela
            </button>
          </div>
          <p className="text-[11px] text-vexo-muted">Horário de Brasília.</p>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Parou de responder</h2>
          <p className="mt-1 text-xs text-vexo-muted">
            Gatilho automático: se o lead não responder dentro do prazo abaixo, o sistema detecta
            sozinho pela última mensagem da conversa e dispara essa sequência — sem precisar de
            nenhuma ação manual. Só vale antes do agendamento acontecer; depois que o lead agenda,
            esse gatilho para de valer e quem cuida dele é a sequência de lembretes/não
            compareceu.
          </p>
        </div>

        <form
          action={updateFollowUpSettings}
          className="flex flex-wrap items-end gap-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
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
            className="rounded-lg border border-vexo-border px-2.5 py-1.5 text-xs font-medium hover:border-vexo-accent"
          >
            Salvar prazo
          </button>
        </form>

        {silenceSteps.length === 0 && (
          <p className="rounded-lg border border-vexo-border bg-vexo-surface p-2.5 text-[11px] text-vexo-muted">
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

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Não compareceu</h2>
          <p className="mt-1 text-xs text-vexo-muted">
            Gatilho manual: só quem está na clínica sabe se o paciente veio ou não, então essa
            sequência só é disparada pelo botão <strong>"Não compareceu"</strong> na tela do
            agendamento — nunca automaticamente. Não tem folga escondida: você marca quando puder,
            sem pressa.
          </p>
        </div>

        {noShowSteps.length === 0 && (
          <p className="rounded-lg border border-vexo-border bg-vexo-surface p-2.5 text-[11px] text-vexo-muted">
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
