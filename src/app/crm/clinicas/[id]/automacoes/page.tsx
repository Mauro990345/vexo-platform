import { notFound } from "next/navigation";
import { Settings, ClipboardList } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { Tabs } from "@/components/Tabs";
import { TemplateMessageField } from "@/components/TemplateMessageField";
import {
  updateClinicSettings,
  updateClinicReminders,
  updateClinicReactivationThresholds,
  updateClinicReactivationWhatsappMessages,
  updateClinicReactivationInstagramMessages,
  logApproach,
} from "../../actions";
import { DEFAULT_REACTIVATION_THRESHOLD_DAYS_LIST } from "@/lib/reactivation";
import { ReactivationThresholdsForm, ReactivationMessageBlockForm } from "@/components/ReactivationConfigForms";

const REMINDER_VARIABLES = [
  { token: "{{primeiro_nome}}", label: "+ Nome do lead" },
  { token: "{{data_horario}}", label: "+ Data e horário" },
];

// Mesma função de preview truncado usada pelos passos de Follow-up (ver
// FollowUpView.tsx) — duplicada aqui (não exportada lá) por ser trivial o
// bastante pra não justificar extrair um módulo compartilhado só por isso.
function reminderPreview(template: string | null | undefined): string {
  if (!template?.trim()) return "(texto padrão)";
  const oneLine = template.replace(/\s+/g, " ").trim();
  return oneLine.length > 50 ? `${oneLine.slice(0, 50)}…` : oneLine;
}

export const dynamic = "force-dynamic";

export default async function ClinicAutomationPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: { reminderConfig: true, reactivationConfig: true },
  });
  if (!clinic) notFound();

  const firstReminderHours = clinic.reminderConfig?.hoursBefore?.[0] ?? 24;
  const secondReminderHours = clinic.reminderConfig?.hoursBefore?.[1] ?? 3;

  const reactivationThresholdSet = new Set(
    clinic.reactivationConfig?.thresholdDaysList ?? DEFAULT_REACTIVATION_THRESHOLD_DAYS_LIST
  );
  const reactivationWhatsappMessages = [
    clinic.reactivationConfig?.message1,
    clinic.reactivationConfig?.message2,
    clinic.reactivationConfig?.message3,
    clinic.reactivationConfig?.message4,
    clinic.reactivationConfig?.message5,
  ];
  const reactivationInstagramMessages = [
    clinic.reactivationConfig?.instagramMessage1,
    clinic.reactivationConfig?.instagramMessage2,
    clinic.reactivationConfig?.instagramMessage3,
    clinic.reactivationConfig?.instagramMessage4,
    clinic.reactivationConfig?.instagramMessage5,
  ];
  const reactivationWhatsappSummary = `${reactivationWhatsappMessages.filter((m) => m?.trim()).length} de 5 preenchidas · ${reminderPreview(
    reactivationWhatsappMessages[0]
  )}`;
  const reactivationInstagramSummary = `${reactivationInstagramMessages.filter((m) => m?.trim()).length} de 5 preenchidas · ${reminderPreview(
    reactivationInstagramMessages[0]
  )}`;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-base font-semibold tracking-tight">Automações</h1>

      {/* Abas horizontais — mesmo padrão do topo do Follow-up (ver
          FollowUpView.tsx): clicar numa aba troca o conteúdo abaixo, sem
          empilhar nada. Substituiu o accordion vertical (CollapsibleSection,
          removido — ficou sem nenhum consumidor) depois de pedido explícito
          pra igualar ao padrão de abas já usado no Follow-up. */}
      <Tabs
        defaultTabId="configuracao"
        tabs={[
          {
            id: "configuracao",
            label: "Configuração",
            icon: <Settings className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Endereço, WhatsApp da clínica, lembretes de agendamento e status da clínica.
                </p>

                <form
                  action={updateClinicSettings.bind(null, clinic.id)}
                  className="mt-5 space-y-3 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
                >
                  <div>
                    <label className="mb-1 block text-xs" htmlFor="address">
                      Endereço da clínica
                    </label>
                    <input
                      id="address"
                      name="address"
                      defaultValue={clinic.address ?? ""}
                      placeholder="Rua, número, bairro, cidade"
                      className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    />
                    <p className="mt-1 text-caption text-vexo-muted">
                      Preenche automaticamente a localização do evento no Google Calendar quando um
                      agendamento é confirmado — não precisa digitar em dois lugares.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs" htmlFor="clientWhatsappNumber">
                      WhatsApp da clínica
                    </label>
                    <input
                      id="clientWhatsappNumber"
                      name="clientWhatsappNumber"
                      defaultValue={clinic.clientWhatsappNumber ?? ""}
                      placeholder="+55 11 99999-9999"
                      className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    />
                    <p className="mt-1 text-caption text-vexo-muted">
                      Usado para enviar a confirmação de agendamento ao lead e é o número do link
                      que o lead recebe quando pede para falar com a clínica. Inclua o código do
                      país (55 para o Brasil) e o DDD; espaços, parênteses, traços ou "+" não
                      atrapalham, são removidos automaticamente, mas os dígitos do 55+DDD precisam
                      estar lá.
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="active" defaultChecked={clinic.active} className="rounded border-vexo-border" />
                      Clínica ativa
                    </label>
                    <p className="mt-1 text-caption text-vexo-muted">
                      Mostra a clínica como ativa (bolinha verde) ou inativa (cinza) na lista de
                      Contas e no Painel.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
                  >
                    Salvar configuração
                  </button>
                </form>

                {/* Seção separada, com o próprio botão de salvar — igual ao
                    padrão de "Passo" do Follow-up (FollowUpView.tsx):
                    <details> com name compartilhado (só um aberto por vez),
                    linha recolhida mostra um resumo, clique abre pra editar.
                    Form PRÓPRIO (não o de cima) pra não reenviar/sobrescrever
                    endereço, WhatsApp e ativa/inativa só por mexer num
                    lembrete. */}
                <div className="mt-5">
                  <h2 className="text-xs font-semibold">Lembretes de agendamento</h2>
                  <p className="mt-1 text-caption text-vexo-muted">
                    Enviados automaticamente ao lead pelo Instagram (Direct), nas horas configuradas
                    antes do horário marcado — nunca por WhatsApp.
                  </p>

                  <form action={updateClinicReminders.bind(null, clinic.id)} className="mt-2 space-y-2">
                    <details name="automacoes-lembretes" className="group rounded-xl border border-vexo-border bg-vexo-surface">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="shrink-0 text-card text-vexo-muted">
                            1º lembrete · {firstReminderHours}h antes
                          </span>
                          <span className="truncate text-xs">
                            {reminderPreview(clinic.reminderConfig?.firstMessageTemplate)}
                          </span>
                        </div>
                        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
                      </summary>
                      <div className="space-y-2.5 border-t border-vexo-border px-3 pb-3 pt-2.5">
                        <div>
                          <label className="mb-1 block text-xs text-vexo-muted" htmlFor="firstReminderHours">
                            Horas antes
                          </label>
                          <input
                            id="firstReminderHours"
                            name="firstReminderHours"
                            type="number"
                            min={1}
                            required
                            defaultValue={firstReminderHours}
                            className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                          />
                        </div>
                        <TemplateMessageField
                          name="firstMessageTemplate"
                          label="Texto do lembrete"
                          required={false}
                          rows={3}
                          variables={REMINDER_VARIABLES}
                          defaultValue={clinic.reminderConfig?.firstMessageTemplate ?? ""}
                          placeholder={'Vazio usa o texto padrão: "Oi, {{primeiro_nome}}! Passando para lembrar que seu horário é amanhã (05/09), às 15h. Te esperamos! 💙"'}
                        />
                      </div>
                    </details>

                    <details name="automacoes-lembretes" className="group rounded-xl border border-vexo-border bg-vexo-surface">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="shrink-0 text-card text-vexo-muted">
                            2º lembrete · {secondReminderHours}h antes
                          </span>
                          <span className="truncate text-xs">
                            {reminderPreview(clinic.reminderConfig?.secondMessageTemplate)}
                          </span>
                        </div>
                        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
                      </summary>
                      <div className="space-y-2.5 border-t border-vexo-border px-3 pb-3 pt-2.5">
                        <div>
                          <label className="mb-1 block text-xs text-vexo-muted" htmlFor="secondReminderHours">
                            Horas antes
                          </label>
                          <input
                            id="secondReminderHours"
                            name="secondReminderHours"
                            type="number"
                            min={1}
                            required
                            defaultValue={secondReminderHours}
                            className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                          />
                        </div>
                        <TemplateMessageField
                          name="secondMessageTemplate"
                          label="Texto do lembrete"
                          required={false}
                          rows={3}
                          variables={REMINDER_VARIABLES}
                          defaultValue={clinic.reminderConfig?.secondMessageTemplate ?? ""}
                          placeholder={'Vazio usa o texto padrão: "Oi, {{primeiro_nome}}! Passando para lembrar que seu horário é hoje, às 15h. Te esperamos! 💙"'}
                        />
                      </div>
                    </details>

                    <button
                      type="submit"
                      className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
                    >
                      Salvar lembretes
                    </button>
                  </form>
                </div>

                {/* Faixa "Reativação" do Painel do cliente (ver
                    ClientPanelView.tsx/ReactivationRail.tsx) — interna, só
                    aparece aqui em Automações (nunca pro cliente nem no
                    Painel dele). TRÊS salvamentos INDEPENDENTES (pedido
                    explícito — era um form só, um botão gravava tudo):
                    períodos (ReactivationThresholdsForm) e cada bloco de
                    mensagens (ReactivationMessageBlockForm, um pro WhatsApp
                    e outro pro Instagram) têm a própria ação/botão/"Salvo
                    ✓", nunca um sobrescrevendo o outro. Componentes client
                    próprios (ReactivationConfigForms.tsx) só por causa
                    desse feedback — um <form action={fn}> puro não dá
                    gancho de "terminou com sucesso" pra mostrar o check. */}
                <div className="mt-5">
                  <h2 className="text-xs font-semibold">Reativação</h2>
                  <p className="mt-1 text-caption text-vexo-muted">
                    Cards de pacientes cujo agendamento da IA completou algum dos prazos
                    marcados sem um retorno — aparecem só no Painel do cliente, com uma
                    mensagem de acompanhamento sugerida pra enviar por WhatsApp ou Instagram
                    (ver canal de cada prazo abaixo; nada é enviado automaticamente). Sem
                    nenhum prazo marcado, a faixa fica desligada.
                  </p>

                  <div className="mt-2 space-y-2 rounded-xl border border-vexo-border bg-vexo-surface p-3">
                    <ReactivationThresholdsForm
                      action={updateClinicReactivationThresholds.bind(null, clinic.id)}
                      defaultSelected={reactivationThresholdSet}
                    />

                    <ReactivationMessageBlockForm
                      action={updateClinicReactivationWhatsappMessages.bind(null, clinic.id)}
                      title="Mensagens WhatsApp"
                      summary={reactivationWhatsappSummary}
                      fieldNamePrefix="message"
                      defaultValues={reactivationWhatsappMessages}
                    />

                    <ReactivationMessageBlockForm
                      action={updateClinicReactivationInstagramMessages.bind(null, clinic.id)}
                      title="Mensagens Instagram"
                      summary={reactivationInstagramSummary}
                      fieldNamePrefix="instagramMessage"
                      defaultValues={reactivationInstagramMessages}
                    />
                  </div>
                </div>
              </section>
            ),
          },
          {
            id: "abordagens",
            label: "Registrar abordagens de hoje",
            icon: <ClipboardList className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Registre manualmente quantas pessoas você abordou hoje, caso o sistema ainda não
                  capture isso automaticamente pelo Instagram.
                </p>

                <form
                  action={logApproach.bind(null, clinic.id)}
                  className="mt-5 flex flex-col gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
                >
                  <div>
                    <label className="mb-1 block text-xs text-vexo-muted" htmlFor="count">
                      Quantidade abordada hoje
                    </label>
                    <input
                      id="count"
                      name="count"
                      type="number"
                      min={1}
                      required
                      placeholder="ex: 25"
                      className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    />
                  </div>
                  <button className="self-start rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90">
                    Registrar
                  </button>
                </form>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
