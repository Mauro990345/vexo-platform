import { notFound } from "next/navigation";
import { Bot, Image as ImageIcon, Clock, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import {
  updateAiAgentSettings,
  updateAiAgentTiming,
  addResultPhoto,
  updateResultPhotoCaption,
  deleteResultPhoto,
} from "../../actions";
import { updateAiSettings, updateFollowUpWindow } from "@/app/crm/(global)/follow-up/actions";
import { PromptTextarea } from "@/components/PromptTextarea";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { Button } from "@/components/Button";
import { Tabs } from "@/components/Tabs";
import { AttendanceVideoSettings } from "@/components/AttendanceVideoSettings";

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

  const [clinic, followUpSettings, aiSettings, resultPhotos] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.id } }),
    prisma.followUpSettings.findUnique({ where: { id: "singleton" } }),
    prisma.aiSettings.findUnique({ where: { id: "singleton" } }),
    prisma.resultPhoto.findMany({ where: { clinicId: params.id }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!clinic) notFound();

  const adaptiveDelayEnabled = aiSettings?.adaptiveDelayEnabled ?? true;
  const windowDays = followUpSettings?.windowDays?.length ? followUpSettings.windowDays : [1, 2, 3, 4, 5];
  const windowStart = minutesToTime(followUpSettings?.windowStartMinute ?? 8 * 60);
  const windowEnd = minutesToTime(followUpSettings?.windowEndMinute ?? 18 * 60);

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-page-title tracking-tight">Agente de IA</h1>

      {/* Abas horizontais — mesmo padrão do topo do Follow-up (ver
          FollowUpView.tsx): clicar numa aba troca o conteúdo abaixo, sem
          empilhar nada. Substituiu o accordion vertical (CollapsibleSection,
          removido — ficou sem nenhum consumidor) depois de pedido explícito
          pra igualar ao padrão de abas já usado no Follow-up. */}
      <Tabs
        defaultTabId="prompt"
        tabs={[
          {
            id: "prompt",
            label: "Prompt de conversação da IA",
            icon: <Bot className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Define como a IA conversa com o lead desta clínica, além do vídeo e da frase de
                  confirmação de agendamento.
                </p>

                <form
                  action={updateAiAgentSettings.bind(null, clinic.id)}
                  className="mt-5 space-y-4 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
                >
                  <div>
                    <label className="mb-1 block text-sm font-semibold" htmlFor="aiSystemPrompt">
                      Prompt de conversação da IA
                    </label>
                    <PromptTextarea
                      id="aiSystemPrompt"
                      name="aiSystemPrompt"
                      defaultValue={clinic.aiSystemPrompt ?? ""}
                      placeholder="Cole aqui o prompt fornecido pelo Mauro para esta clínica..."
                    />
                  </div>

                  <div className="space-y-3 border-t border-vexo-border pt-3.5">
                    <h3 className="text-caption font-medium uppercase tracking-wide text-vexo-muted">
                      Configurações auxiliares
                    </h3>

                    <p className="text-caption text-vexo-muted">
                      Cada item abaixo tem sua própria caixinha "Enviar" — desmarcado, a sequência
                      pula pra o próximo item marcado, mantendo a mesma ordem (apresentação, vídeo,
                      cafezinho, final).
                    </p>

                    <AttendanceVideoSettings
                      currentVideoUrl={clinic.confirmationVideoUrl}
                      videoEnabledDefault={clinic.confirmationVideoEnabled}
                      introEnabledDefault={clinic.confirmationVideoCaptionEnabled}
                      introCaptionDefault={clinic.confirmationVideoCaption ?? ""}
                    />

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-xs text-vexo-muted" htmlFor="attendanceTipMessage">
                          Mensagem do "cafezinho"
                        </label>
                        <label className="flex shrink-0 items-center gap-1 text-card text-vexo-muted">
                          <input
                            type="checkbox"
                            name="attendanceTipEnabled"
                            defaultChecked={clinic.attendanceTipEnabled}
                            className="rounded border-vexo-border"
                          />
                          Enviar
                        </label>
                      </div>
                      <input
                        id="attendanceTipMessage"
                        name="attendanceTipMessage"
                        defaultValue={clinic.attendanceTipMessage ?? ""}
                        placeholder="Ex: Se puder, chegue uns 15 minutinhos antes, teremos um cafezinho te esperando."
                        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                      />
                      <p className="mt-1 text-caption text-vexo-muted">
                        Enviada 10 segundos depois do item anterior que de fato saiu, sem relação com
                        o vídeo — a IA não escreve mais esse texto sozinha. Vazio usa a frase padrão
                        acima.
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-xs text-vexo-muted" htmlFor="attendanceFinalMessage">
                          Mensagem final
                        </label>
                        <label className="flex shrink-0 items-center gap-1 text-card text-vexo-muted">
                          <input
                            type="checkbox"
                            name="attendanceFinalEnabled"
                            defaultChecked={clinic.attendanceFinalEnabled}
                            className="rounded border-vexo-border"
                          />
                          Enviar
                        </label>
                      </div>
                      <input
                        id="attendanceFinalMessage"
                        name="attendanceFinalMessage"
                        defaultValue={clinic.attendanceFinalMessage ?? ""}
                        placeholder='Ex: Perfeito, até {{dia}}.'
                        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                      />
                      <p className="mt-1 text-caption text-vexo-muted">
                        Enviada 10 segundos depois do item anterior que de fato saiu, encerrando a
                        sequência — sem relação com o vídeo. Marcada, a IA não escreve mais despedida
                        nenhuma quando o lead confirma presença, pra não duplicar esta mensagem. Use{" "}
                        <code>{"{{dia}}"}</code> onde quiser o dia calculado automaticamente ("amanhã", "hoje" ou
                        o dia da semana, ex. "sexta"). Vazio usa a frase padrão acima.
                      </p>
                    </div>
                  </div>

                  <Button type="submit" variant="primary">
                    Salvar configuração
                  </Button>
                </form>
              </section>
            ),
          },
          {
            id: "fotos",
            label: "Fotos de resultado",
            icon: <ImageIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Fotos por procedimento, marcadas por categoria/tag. A IA busca a foto da categoria
                  mais próxima do que o lead demonstrou interesse e anexa na resposta — no máximo 2
                  por conversa, nunca repetindo a mesma foto, e nunca na primeira mensagem de um lead
                  novo.
                </p>

                <div className="mt-5 space-y-2.5">
                  <form
                    action={addResultPhoto.bind(null, clinic.id)}
                    className="flex flex-wrap items-end gap-2.5 rounded-xl border border-dashed border-vexo-border p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs text-vexo-muted" htmlFor="category">
                        Categoria/procedimento
                      </label>
                      <input
                        id="category"
                        name="category"
                        required
                        placeholder="ex: botox, preenchimento labial, harmonização facial"
                        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-vexo-muted" htmlFor="photoFile">
                        Foto
                      </label>
                      <input
                        id="photoFile"
                        name="photoFile"
                        type="file"
                        accept="image/*"
                        required
                        className="block text-xs text-vexo-muted file:mr-2 file:rounded-lg file:border file:border-vexo-border file:bg-vexo-bg file:px-2.5 file:py-1.5 file:text-xs file:text-vexo-fg hover:file:border-vexo-accent"
                      />
                    </div>
                    <div className="min-w-0 flex-1 basis-full">
                      <label className="mb-1 block text-xs text-vexo-muted" htmlFor="caption">
                        Mensagem/legenda (opcional — a IA manda esse texto antes da foto)
                      </label>
                      <textarea
                        id="caption"
                        name="caption"
                        rows={2}
                        placeholder='ex: "Separei um resultado real de um procedimento parecido com o que você quer"'
                        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
                    >
                      Adicionar foto
                    </button>
                  </form>

                  {resultPhotos.length === 0 ? (
                    <p className="text-xs text-vexo-muted">Nenhuma foto cadastrada ainda.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {resultPhotos.map((photo) => (
                        <div key={photo.id} className="overflow-hidden rounded-xl border border-vexo-border bg-vexo-bg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.imageUrl} alt={photo.category} className="h-32 w-full object-cover" />
                          <div className="space-y-1.5 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate text-xs font-medium">{photo.category}</span>
                              <form action={deleteResultPhoto.bind(null, clinic.id, photo.id)}>
                                <ConfirmSubmitButton
                                  confirmMessage="Remover esta foto? Essa ação não pode ser desfeita."
                                  className="shrink-0 text-caption text-vexo-muted hover:text-vexo-error"
                                >
                                  Remover
                                </ConfirmSubmitButton>
                              </form>
                            </div>

                            <form
                              action={updateResultPhotoCaption.bind(null, clinic.id, photo.id)}
                              className="space-y-1"
                            >
                              <textarea
                                name="caption"
                                rows={2}
                                defaultValue={photo.caption ?? ""}
                                placeholder='Sem legenda — a IA manda só a foto. Ex: "Olha esse resultado real!"'
                                className="w-full rounded-lg border border-vexo-border bg-vexo-surface px-2 py-1 text-card outline-none focus:border-vexo-accent"
                              />
                              <div className="flex items-center justify-between gap-2">
                                {!photo.caption && (
                                  <span className="text-card text-vexo-warning">Sem legenda</span>
                                )}
                                <button
                                  type="submit"
                                  className="ml-auto rounded-md border border-vexo-border px-1.5 py-0.5 text-card text-vexo-muted hover:border-vexo-accent hover:text-vexo-accent"
                                >
                                  Salvar legenda
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ),
          },
          {
            id: "timing",
            label: "Timing de resposta da IA",
            icon: <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Controla quanto tempo a IA espera pra responder, com base em quanto tempo o lead
                  ficou em silêncio.
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-vexo-muted">
                  <li>
                    <span className="font-medium text-vexo-fg">Até 1 hora sem resposta:</span> 5-60
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

                <form
                  action={updateAiAgentTiming.bind(null, clinic.id)}
                  className="mt-5 flex flex-wrap items-end gap-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
                >
                  <div>
                    <label className="mb-1 block text-xs" htmlFor="firstBandDelaySeconds">
                      Delay "até 1 hora" (segundos, entre 5 e 60)
                    </label>
                    <input
                      id="firstBandDelaySeconds"
                      name="firstBandDelaySeconds"
                      type="number"
                      min={5}
                      max={60}
                      step={1}
                      required
                      defaultValue={clinic.firstBandDelaySeconds}
                      className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    />
                  </div>
                  <Button type="submit" variant="primary">
                    Salvar
                  </Button>
                </form>

                <form
                  action={updateAiSettings}
                  className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
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
                  <Button type="submit" variant="primary" className="shrink-0">
                    Salvar
                  </Button>
                </form>
              </section>
            ),
          },
          {
            id: "janela",
            label: "Janela de envio",
            icon: <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Mensagens de follow-up (vale pra todas as clínicas) só saem dentro desses dias e
                  horário; fora, esperam a próxima janela.
                </p>

                <form
                  action={updateFollowUpWindow}
                  className="mt-5 space-y-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
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
                    <Button type="submit" variant="primary">
                      Salvar janela
                    </Button>
                  </div>
                  <p className="text-card text-vexo-muted">Horário de Brasília.</p>
                </form>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
