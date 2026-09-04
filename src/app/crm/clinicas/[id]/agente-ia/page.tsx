import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { updateAiAgentSettings } from "../../actions";
import { updateAiSettings, updateFollowUpWindow } from "@/app/crm/(global)/follow-up/actions";

export const dynamic = "force-dynamic";

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

// "Delay adaptativo" e "Janela de envio" vieram da antiga aba
// "Configurações gerais" do Follow-up. Continuam sendo config global
// (AiSettings/FollowUpSettings não têm clinicId — vale pra todas as
// clínicas), só a TELA mudou de lugar pra ficar junto do resto do que
// configura o comportamento da IA.
export default async function ClinicAiAgentPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const [clinic, aiSettings, followUpSettings] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.id } }),
    prisma.aiSettings.findUnique({ where: { id: "singleton" } }),
    prisma.followUpSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!clinic) notFound();

  const adaptiveDelayEnabled = aiSettings?.adaptiveDelayEnabled ?? true;
  const windowDays = followUpSettings?.windowDays?.length ? followUpSettings.windowDays : [1, 2, 3, 4, 5];
  const windowStart = minutesToTime(followUpSettings?.windowStartMinute ?? 8 * 60);
  const windowEnd = minutesToTime(followUpSettings?.windowEndMinute ?? 18 * 60);

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-base font-semibold tracking-tight">Agente de IA</h1>

      <form
        action={updateAiAgentSettings.bind(null, clinic.id)}
        className="space-y-3 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
      >
        <h2 className="text-sm font-medium text-vexo-muted">Conversação</h2>

        <div>
          <label className="mb-1 block text-xs" htmlFor="aiSystemPrompt">
            Prompt de conversação da IA
          </label>
          <textarea
            id="aiSystemPrompt"
            name="aiSystemPrompt"
            rows={8}
            defaultValue={clinic.aiSystemPrompt ?? ""}
            placeholder="Cole aqui o prompt fornecido pelo Mauro para esta clínica..."
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 font-mono text-card outline-none focus:border-vexo-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs" htmlFor="welcomeVideoUrl">
            URL do vídeo de boas-vindas (primeiro atendimento)
          </label>
          <input
            id="welcomeVideoUrl"
            name="welcomeVideoUrl"
            defaultValue={clinic.welcomeVideoUrl ?? ""}
            placeholder="https://..."
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs" htmlFor="notifyWhatsappNumber">
            WhatsApp para alertas de escalonamento (Mauro/secretária)
          </label>
          <input
            id="notifyWhatsappNumber"
            name="notifyWhatsappNumber"
            defaultValue={clinic.notifyWhatsappNumber ?? ""}
            placeholder="+55 11 99999-9999"
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90"
        >
          Salvar configuração
        </button>
      </form>

      <section className="space-y-2.5">
        <div>
          <h2 className="text-sm font-semibold">Timing de resposta da IA</h2>
          <p className="mt-1 text-xs text-vexo-muted">
            Controla o delay de resposta da IA em todas as conversas (vale pra todas as clínicas)
            — desligue pra testar o sistema sem esperar.
          </p>
        </div>

        <form
          action={updateAiSettings}
          className="flex items-center justify-between gap-3 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
        >
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="adaptiveDelayEnabled"
              defaultChecked={adaptiveDelayEnabled}
              className="h-3.5 w-3.5 shrink-0 rounded border-vexo-border"
            />
            Delay adaptativo ativado
          </label>
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-vexo-accent px-2.5 py-1.5 text-card font-medium text-vexo-accent hover:bg-vexo-accent/10"
          >
            Salvar
          </button>
        </form>
      </section>

      <section className="space-y-2.5">
        <div>
          <h2 className="text-sm font-semibold">Janela de envio</h2>
          <p className="mt-1 text-xs text-vexo-muted">
            Mensagens de follow-up (vale pra todas as clínicas) só saem dentro desses dias e
            horário; fora, esperam a próxima janela.
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
              className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
            >
              Salvar janela
            </button>
          </div>
          <p className="text-card text-vexo-muted">Horário de Brasília.</p>
        </form>
      </section>
    </div>
  );
}
