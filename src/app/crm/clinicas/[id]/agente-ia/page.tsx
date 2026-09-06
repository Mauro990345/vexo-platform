import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { updateAiAgentSettings, updateAiAgentTiming } from "../../actions";
import { updateAiSettings, updateFollowUpWindow } from "@/app/crm/(global)/follow-up/actions";
import { PromptTextarea } from "@/components/PromptTextarea";

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

// "Janela de envio" veio da antiga aba "Configurações gerais" do
// Follow-up. Continua sendo config global (FollowUpSettings não tem
// clinicId — vale pra todas as clínicas), só a TELA mudou de lugar pra
// ficar junto do resto do que configura o comportamento da IA.
//
// "Timing de resposta da IA" mora só aqui agora (não em Configurações —
// tirado de lá pra não duplicar a mesma explicação em dois lugares). O
// toggle geral (adaptiveDelayEnabled) é global (AiSettings, sem
// clinicId), mas fica exposto aqui mesmo assim porque é o único lugar
// onde essa config aparece. Já o delay da faixa "até 1h"
// (Clinic.firstBandDelaySeconds) é POR CLÍNICA de verdade — cada clínica
// pode querer um tom de primeira resposta diferente.
export default async function ClinicAiAgentPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const [clinic, followUpSettings, aiSettings] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.id } }),
    prisma.followUpSettings.findUnique({ where: { id: "singleton" } }),
    prisma.aiSettings.findUnique({ where: { id: "singleton" } }),
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
        className="space-y-4 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
      >
        <div>
          <label className="mb-1 block text-sm font-semibold" htmlFor="aiSystemPrompt">
            Prompt de conversação da IA
          </label>
          <p className="mb-1.5 text-caption text-vexo-muted">
            O "cérebro" da IA — define como ela conversa com o lead nesta clínica.
          </p>
          <PromptTextarea
            id="aiSystemPrompt"
            name="aiSystemPrompt"
            defaultValue={clinic.aiSystemPrompt ?? ""}
            placeholder="Cole aqui o prompt fornecido pelo Mauro para esta clínica..."
          />
        </div>

        <div className="space-y-3 border-t border-vexo-border pt-3.5">
          <h2 className="text-caption font-medium uppercase tracking-wide text-vexo-muted">
            Configurações auxiliares
          </h2>

          <div>
            <label className="mb-1 block text-xs text-vexo-muted" htmlFor="confirmationVideoUrl">
              URL do vídeo de confirmação de agendamento (reforça comparecimento)
            </label>
            <input
              id="confirmationVideoUrl"
              name="confirmationVideoUrl"
              defaultValue={clinic.confirmationVideoUrl ?? ""}
              placeholder="https://..."
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
            />
            <p className="mt-1 text-caption text-vexo-muted">
              Enviado automaticamente pelo Instagram assim que um agendamento é confirmado na
              conversa — não é preciso disparar manualmente.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-vexo-muted" htmlFor="notifyWhatsappNumber">
              WhatsApp da secretária (avisa quando o lead pede atendimento humano)
            </label>
            <input
              id="notifyWhatsappNumber"
              name="notifyWhatsappNumber"
              defaultValue={clinic.notifyWhatsappNumber ?? ""}
              placeholder="+55 11 99999-9999"
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
            />
            <p className="mt-1 text-caption text-vexo-muted">
              Recebe um alerta por WhatsApp sempre que a IA identifica que o lead precisa falar com
              uma pessoa.
            </p>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
        >
          Salvar configuração
        </button>
      </form>

      <section className="space-y-2.5">
        <div>
          <h2 className="text-sm font-semibold">Timing de resposta da IA</h2>
          <p className="mt-1 text-xs text-vexo-muted">
            Controla quanto tempo a IA espera pra responder, com base em quanto tempo o lead ficou
            em silêncio.
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-vexo-muted">
            <li>
              <span className="font-medium text-vexo-fg">Até 1 hora sem resposta:</span> 30-60
              segundos (ajustável abaixo, só desta clínica)
            </li>
            <li>
              <span className="font-medium text-vexo-fg">De 1 a 6 horas:</span> 5-10 minutos
              (fixo, vale pra todas as clínicas)
            </li>
            <li>
              <span className="font-medium text-vexo-fg">Mais de 6 horas:</span> 2-5 minutos
              (fixo, vale pra todas as clínicas)
            </li>
          </ul>
        </div>

        <form
          action={updateAiAgentTiming.bind(null, clinic.id)}
          className="flex flex-wrap items-end gap-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
        >
          <div>
            <label className="mb-1 block text-xs" htmlFor="firstBandDelaySeconds">
              Delay "até 1 hora" (segundos, entre 30 e 60)
            </label>
            <input
              id="firstBandDelaySeconds"
              name="firstBandDelaySeconds"
              type="number"
              min={30}
              max={60}
              step={1}
              required
              defaultValue={clinic.firstBandDelaySeconds}
              className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
          >
            Salvar
          </button>
        </form>

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
            Delay adaptativo ativado (vale pra todas as clínicas)
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
