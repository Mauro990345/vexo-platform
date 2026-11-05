import { prisma } from "@/lib/prisma";
import type { FollowUpStep, FollowUpTrigger } from "@prisma/client";
import { Clock, CalendarX, LayoutPanelTop } from "lucide-react";
import { Tabs } from "@/components/Tabs";
import { TemplateMessageField } from "@/components/TemplateMessageField";
import { AttachmentField } from "@/components/AttachmentField";
import {
  addFollowUpStep,
  updateFollowUpStep,
  deleteFollowUpStep,
  moveFollowUpStep,
  updateFollowUpSettings,
  updateNoShowFirstStepDelay,
  updatePanelCardSettings,
} from "./actions";
import { noShowGroupHelp, neverScheduledGroupHelp, hotLeadGroupHelp, REACTIVATION_GROUP_HELP } from "@/lib/panel-card-group-help";

function preview(text: string, max = 70): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function StepList({
  steps,
  trigger,
  firstStepLabel,
  allowAddStep = true,
}: {
  steps: FollowUpStep[];
  trigger: FollowUpTrigger;
  firstStepLabel: string;
  // Item 7 (rodada atual) — "Não compareceu" perde o bloco "Adicionar
  // passo" por completo (fica só com os 2 passos já existentes, editáveis
  // normalmente); "Parou de responder" continua podendo adicionar passos,
  // sem nenhuma mudança.
  allowAddStep?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {steps.map((step, i) => (
          <details
            key={step.id}
            name={`followup-steps-${trigger}`}
            className="group rounded-xl border border-vexo-border bg-vexo-surface"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0 rounded-full border border-vexo-border px-1.5 py-0.5 text-card text-vexo-muted">
                  Passo {i + 1}
                </span>
                {step.channel === "WHATSAPP" && (
                  <span className="shrink-0 rounded-full border border-vexo-success/40 bg-vexo-success/10 px-1.5 py-0.5 text-card text-vexo-success">
                    WhatsApp
                  </span>
                )}
                <span className="shrink-0 text-card text-vexo-muted">
                  {i === 0 ? `${step.offsetHours}h` : `+${step.offsetHours}h`}
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

            <div className="border-t border-vexo-border px-3.5 pb-3.5 pt-1.5">
              <div className="mb-1 flex items-center justify-end gap-1">
                <form action={moveFollowUpStep.bind(null, step.id, "up")}>
                  <button
                    disabled={i === 0}
                    className="rounded-md border border-vexo-accent px-1.5 py-0.5 text-card text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-30"
                  >
                    ↑
                  </button>
                </form>
                <form action={moveFollowUpStep.bind(null, step.id, "down")}>
                  <button
                    disabled={i === steps.length - 1}
                    className="rounded-md border border-vexo-accent px-1.5 py-0.5 text-card text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </form>
                <form action={deleteFollowUpStep.bind(null, step.id)}>
                  <button className="rounded-md border border-vexo-border px-1.5 py-0.5 text-card text-vexo-error hover:border-vexo-error/40">
                    Remover
                  </button>
                </form>
              </div>

              <form action={updateFollowUpStep.bind(null, step.id)} className="space-y-2.5">
                {i === 0 && trigger === "NO_SHOW" ? (
                  <div>
                    <input type="hidden" name="offsetHours" value={step.offsetHours} />
                    <p className="text-xs text-vexo-muted">
                      Prazo da primeira mensagem configurado acima, na caixinha "Enviar a primeira
                      mensagem depois de".
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs text-vexo-muted">
                      {i === 0 ? firstStepLabel : "Enviado quantas horas após o passo anterior"}
                    </label>
                    <input
                      name="offsetHours"
                      type="number"
                      min={0}
                      required
                      defaultValue={step.offsetHours}
                      className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    />
                  </div>
                )}

                <TemplateMessageField defaultValue={step.content} />

                {trigger === "NO_SHOW" && (
                  <div>
                    <label className="mb-1 block text-xs text-vexo-muted">Canal</label>
                    <select
                      name="channel"
                      defaultValue={step.channel}
                      className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    >
                      <option value="INSTAGRAM">Instagram (Direct)</option>
                      <option value="WHATSAPP">WhatsApp — reengajamento extra, só se o lead tiver telefone</option>
                    </select>
                  </div>
                )}

                {step.channel === "WHATSAPP" ? (
                  <p className="text-card text-vexo-muted">
                    Passo por WhatsApp: sem anexo (só texto) e sem a janela de 24h do Instagram — pode
                    ficar mais espaçado no tempo. Enviado só se o lead tiver telefone cadastrado.
                  </p>
                ) : (
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
                    <AttachmentField
                      key={step.attachmentUrl ?? "none"}
                      helpText={
                        step.attachmentUrl ? "Escolher um novo arquivo substitui o atual." : "JPG, PNG, WEBP, GIF, MP4, MOV ou WEBM — até 25MB."
                      }
                    />
                  </div>
                )}

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

      {allowAddStep && (
        <form action={addFollowUpStep.bind(null, trigger)} className="space-y-2.5 rounded-xl border border-dashed border-vexo-border p-3.5">
          <h3 className="text-xs font-medium text-vexo-muted">Adicionar passo {steps.length + 1}</h3>

          <div>
            <label className="mb-1 block text-xs text-vexo-muted">
              {steps.length === 0 ? firstStepLabel : "Enviado quantas horas após o passo anterior"}
            </label>
            <input
              name="offsetHours"
              type="number"
              min={trigger === "NO_SHOW" && steps.length === 0 ? 1 : 0}
              required
              defaultValue={trigger === "NO_SHOW" && steps.length === 0 ? 1 : 0}
              className="w-24 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
            />
          </div>

          <TemplateMessageField placeholder="Ex: Oi! Ainda tem interesse em agendar sua avaliação?" />

          {trigger === "NO_SHOW" && (
            <div>
              <label className="mb-1 block text-xs text-vexo-muted">Canal</label>
              <select
                name="channel"
                defaultValue="INSTAGRAM"
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
              >
                <option value="INSTAGRAM">Instagram (Direct)</option>
                <option value="WHATSAPP">WhatsApp — reengajamento extra, só se o lead tiver telefone</option>
              </select>
              <p className="mt-1 text-card text-vexo-muted">
                WhatsApp é complementar às mensagens do Instagram (não substitui), sem anexo e sem a
                janela de 24h — o anexo abaixo é ignorado se escolher esse canal.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-vexo-muted">Anexo (opcional — imagem ou vídeo)</label>
            <AttachmentField key={steps.length} helpText="JPG, PNG, WEBP, GIF, MP4, MOV ou WEBM — até 25MB." />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90"
          >
            Adicionar passo
          </button>
        </form>
      )}
    </div>
  );
}

// Renderiza a config de follow-up em si — reaproveitado tanto pela rota
// global (/crm/follow-up) quanto pela rota dentro do contexto de uma
// clínica (/crm/clinicas/[id]/follow-up), já que é a mesma configuração
// (FollowUpStep/FollowUpSettings não têm clinicId, é compartilhada por
// todas as clínicas) — só muda a sidebar em volta, não o conteúdo.
export async function FollowUpView() {
  const [silenceSteps, noShowSteps, settings, noShowCardSettings, neverScheduledCardSettings, reactivationMessagesConfig, hotLeadMessagesConfig] =
    await Promise.all([
      prisma.followUpStep.findMany({ where: { trigger: "SILENCE" }, orderBy: { order: "asc" } }),
      prisma.followUpStep.findMany({ where: { trigger: "NO_SHOW" }, orderBy: { order: "asc" } }),
      prisma.followUpSettings.findUnique({ where: { id: "singleton" } }),
      prisma.noShowCardSettings.findUnique({ where: { id: "singleton" } }),
      prisma.neverScheduledCardSettings.findUnique({ where: { id: "singleton" } }),
      // Reativação/Quente (pedido explícito — "unificar os textos... numa
      // única tela GLOBAL"): antes eram configurados por clínica em
      // Automações, agora globais aqui, mesmo singleton das duas linhas
      // acima.
      prisma.reactivationMessagesConfig.findUnique({ where: { id: "singleton" } }),
      prisma.hotLeadMessagesConfig.findUnique({ where: { id: "singleton" } }),
    ]);
  const silenceHours = settings?.silenceHours ?? 24;

  const reactivationMessages = [
    reactivationMessagesConfig?.message1,
    reactivationMessagesConfig?.message2,
    reactivationMessagesConfig?.message3,
    reactivationMessagesConfig?.message4,
    reactivationMessagesConfig?.message5,
  ];
  const reactivationFilledCount = reactivationMessages.filter((m) => m?.trim()).length;

  const hotLeadStepMessages = [
    [hotLeadMessagesConfig?.step1Message1, hotLeadMessagesConfig?.step1Message2, hotLeadMessagesConfig?.step1Message3],
    [hotLeadMessagesConfig?.step2Message1, hotLeadMessagesConfig?.step2Message2, hotLeadMessagesConfig?.step2Message3],
    [hotLeadMessagesConfig?.step3Message1, hotLeadMessagesConfig?.step3Message2, hotLeadMessagesConfig?.step3Message3],
  ];
  const hotLeadFilledCount = hotLeadStepMessages.flat().filter((m) => m?.trim()).length;
  const HOT_LEAD_STEP_LABELS = ["Passo 1 · 2 dias", "Passo 2 · 4 dias", "Passo 3 · 15 dias"];

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Follow-up</h1>
        <p className="mt-1 text-xs text-vexo-muted">
          Duas sequências automáticas independentes, cada uma com seus próprios passos, e os
          textos dos cards manuais do Painel. Vale pra todas as clínicas. Clique num passo pra
          editar.
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
                    firstStepLabel="Enviado quantas horas após o lead parar de responder"
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
                  Dispara só quando a secretária clica em <strong>"Não compareceu"</strong> no
                  Painel — nunca automaticamente.
                </p>

                {noShowSteps.length > 0 && (
                  <form
                    action={updateNoShowFirstStepDelay}
                    className="mt-5 flex flex-wrap items-end gap-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
                  >
                    <div>
                      <label className="mb-1 block text-xs text-vexo-muted" htmlFor="noShowFirstDelay">
                        Enviar a primeira mensagem depois de
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="noShowFirstDelay"
                          name="offsetHours"
                          type="number"
                          min={1}
                          required
                          defaultValue={noShowSteps[0]!.offsetHours}
                          className="w-20 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                        />
                        <span className="text-xs text-vexo-muted">
                          horas após o clique em "Não compareceu"
                        </span>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
                    >
                      Salvar prazo
                    </button>
                  </form>
                )}

                <div className="mt-5">
                  <StepList
                    steps={noShowSteps}
                    trigger="NO_SHOW"
                    firstStepLabel="Enviado quantas horas após marcar como não compareceu"
                    allowAddStep={false}
                  />
                </div>
              </section>
            ),
          },
          {
            id: "panel-cards",
            label: "Cards do Painel",
            icon: <LayoutPanelTop className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Cards manuais do Painel (copiar + abrir o Instagram, ou WhatsApp direto no
                  "Faltou") — sem envio automático. Vale pra todas as clínicas.
                </p>

                {/* 4 grupos recolhíveis (pedido explícito) — details com o
                    mesmo `name` (só um aberto por vez, mesmo padrão de
                    StepList acima/ReactivationConfigForms.tsx), mas UM SÓ
                    <form> por fora envolvendo os 4, com UM botão "Salvar
                    textos" no final (pedido explícito: "um único botão") —
                    diferente do accordion de Automações (cada bloco tinha
                    seu próprio form/botão), aqui a submissão é uma coisa
                    só. updatePanelCardSettings (actions.ts) grava as
                    QUATRO tabelas de configuração numa transação.

                    Faltou/Não agendou: ver comentário de antes desta
                    rodada (D3/D10/D30/D60 fixos, não configuráveis, só o
                    texto). Reativação (5 textos em rodízio) e Quente (9
                    textos, 3 por passo) ERAM por clínica em Automações —
                    pedido explícito desta rodada: "unificar os textos...
                    numa única tela GLOBAL" — saíram de lá, entraram aqui,
                    mesmo texto/rodízio pra todas as clínicas agora. */}
                <form action={updatePanelCardSettings} className="mt-3 space-y-2">
                  <details name="panel-card-groups" className="group rounded-xl border border-vexo-border bg-vexo-surface">
                    {/* Texto de apoio sempre visível (pedido explícito —
                        "logo abaixo do título... também com o grupo
                        fechado") tem que ficar DENTRO de <summary>: é a
                        única parte de um <details> que nunca colapsa.
                        Dias vêm de NO_SHOW_CARD_STEPS (panel-card-group-help.ts),
                        acompanham a constante sozinhos se a cadência mudar. */}
                    <summary className="flex cursor-pointer list-none flex-col gap-1 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="shrink-0 text-card text-vexo-muted">Faltou</span>
                          <span className="truncate text-xs">{preview(noShowCardSettings?.day3Content ?? "(texto padrão)")}</span>
                        </div>
                        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
                      </div>
                      <p className="text-card text-vexo-muted">{noShowGroupHelp()}</p>
                    </summary>
                    <div className="space-y-2.5 border-t border-vexo-border px-3 pb-3 pt-2.5">
                      <TemplateMessageField
                        name="day3Content"
                        label="3º dia (D3)"
                        required={false}
                        rows={2}
                        variables={[
                          { token: "{{primeiro_nome}}", label: "+ Nome do lead" },
                          { token: "{{data_horario}}", label: "+ Data e horário perdidos" },
                        ]}
                        defaultValue={noShowCardSettings?.day3Content ?? ""}
                        placeholder="Vazio usa o texto padrão."
                      />
                      <TemplateMessageField
                        name="day10Content"
                        label="10º dia (D10)"
                        required={false}
                        rows={2}
                        variables={[
                          { token: "{{primeiro_nome}}", label: "+ Nome do lead" },
                          { token: "{{data_horario}}", label: "+ Data e horário perdidos" },
                        ]}
                        defaultValue={noShowCardSettings?.day10Content ?? ""}
                        placeholder="Vazio usa o texto padrão."
                      />
                      {/* 3º passo do Faltou (D30) — mesmo canal dos
                          outros dois (WhatsApp se o lead tiver telefone,
                          Instagram como fallback — ver no-show-cards.ts).
                          Chegou a ser forçado só-Instagram numa rodada
                          anterior; revertido a pedido explícito. */}
                      {/* Nome do campo prefixado ("noShowDay30Content",
                          não "day30Content") pra não colidir com o campo
                          de mesmo nome "day30Content" do grupo "Não
                          agendou" abaixo — os dois ficam no MESMO <form>
                          (pedido explícito, "um único botão"). */}
                      <TemplateMessageField
                        name="noShowDay30Content"
                        label="30º dia (D30)"
                        required={false}
                        rows={2}
                        variables={[
                          { token: "{{primeiro_nome}}", label: "+ Nome do lead" },
                          { token: "{{data_horario}}", label: "+ Data e horário perdidos" },
                        ]}
                        defaultValue={noShowCardSettings?.day30Content ?? ""}
                        placeholder="Vazio usa o texto padrão."
                      />
                    </div>
                  </details>

                  <details name="panel-card-groups" className="group rounded-xl border border-vexo-border bg-vexo-surface">
                    <summary className="flex cursor-pointer list-none flex-col gap-1 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="shrink-0 text-card text-vexo-muted">Não agendou</span>
                          <span className="truncate text-xs">{preview(neverScheduledCardSettings?.day2Content ?? "(texto padrão)")}</span>
                        </div>
                        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
                      </div>
                      <p className="text-card text-vexo-muted">{neverScheduledGroupHelp()}</p>
                    </summary>
                    <div className="space-y-2.5 border-t border-vexo-border px-3 pb-3 pt-2.5">
                      {/* D2/D4 (rodada atual), antes dos D10/D30/D60 já
                          existentes (ordem cronológica na tela;
                          internamente são step=4/5, ver
                          never-scheduled-cards.ts) — sem colisão de nome
                          de campo com o grupo "Faltou" (que não tem
                          day2Content/day4Content). */}
                      <TemplateMessageField
                        name="day2Content"
                        label="2º dia (D2)"
                        required={false}
                        rows={2}
                        variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
                        defaultValue={neverScheduledCardSettings?.day2Content ?? ""}
                        placeholder="Vazio usa o texto padrão."
                      />
                      <TemplateMessageField
                        name="day4Content"
                        label="4º dia (D4)"
                        required={false}
                        rows={2}
                        variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
                        defaultValue={neverScheduledCardSettings?.day4Content ?? ""}
                        placeholder="Vazio usa o texto padrão."
                      />
                      {/* D10 (rodada anterior), internamente step=3 —
                          "neverScheduledDay10Content" pra não colidir com
                          "day10Content" do grupo "Faltou" (mesmo <form>). */}
                      <TemplateMessageField
                        name="neverScheduledDay10Content"
                        label="10º dia (D10)"
                        required={false}
                        rows={2}
                        variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
                        defaultValue={neverScheduledCardSettings?.day10Content ?? ""}
                        placeholder="Vazio usa o texto padrão."
                      />
                      <TemplateMessageField
                        name="day30Content"
                        label="30º dia (D30)"
                        required={false}
                        rows={2}
                        variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
                        defaultValue={neverScheduledCardSettings?.day30Content ?? ""}
                        placeholder="Vazio usa o texto padrão."
                      />
                      <TemplateMessageField
                        name="day60Content"
                        label="60º dia (D60)"
                        required={false}
                        rows={2}
                        variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
                        defaultValue={neverScheduledCardSettings?.day60Content ?? ""}
                        placeholder="Vazio usa o texto padrão."
                      />
                    </div>
                  </details>

                  <details name="panel-card-groups" className="group rounded-xl border border-vexo-border bg-vexo-surface">
                    {/* Texto de apoio estático, sem dias (pedido
                        explícito desta rodada: "não colocar nenhuma
                        informação sobre a janela de ±3 dias da
                        Reativação" — o prazo é por agendamento, não um
                        dia fixo). */}
                    <summary className="flex cursor-pointer list-none flex-col gap-1 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="shrink-0 text-card text-vexo-muted">Reativação</span>
                          <span className="truncate text-xs">{reactivationFilledCount} de 5 preenchidas</span>
                        </div>
                        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
                      </div>
                      <p className="text-card text-vexo-muted">{REACTIVATION_GROUP_HELP}</p>
                    </summary>
                    <div className="space-y-2.5 border-t border-vexo-border px-3 pb-3 pt-2.5">
                      {/* Item 6 (rodada atual) — Reativação não tem dia
                          fixo por texto (a secretária escolhe o prazo por
                          agendamento, ver ReturnPeriodChipsForm em
                          automacoes/page.tsx), então não mostra "Dº dia"
                          como Faltou/Não agendou acima — só esta linha
                          curta explicando o rodízio. */}
                      <p className="text-card text-vexo-muted">
                        Sem dia fixo — o prazo é escolhido pela secretária por agendamento, e os 5
                        textos abaixo giram em rodízio entre os leads.
                      </p>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <TemplateMessageField
                          key={n}
                          name={`message${n}`}
                          label={`Mensagem ${n}`}
                          required={false}
                          rows={2}
                          variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
                          defaultValue={reactivationMessages[n - 1] ?? ""}
                          placeholder="Vazio usa um texto padrão de acompanhamento, sem citar serviço/procedimento."
                        />
                      ))}
                    </div>
                  </details>

                  <details name="panel-card-groups" className="group rounded-xl border border-vexo-border bg-vexo-surface">
                    <summary className="flex cursor-pointer list-none flex-col gap-1 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="shrink-0 text-card text-vexo-muted">Quente</span>
                          <span className="truncate text-xs">{hotLeadFilledCount} de 9 preenchidas</span>
                        </div>
                        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
                      </div>
                      <p className="text-card text-vexo-muted">{hotLeadGroupHelp()}</p>
                    </summary>
                    <div className="space-y-3 border-t border-vexo-border px-3 pb-3 pt-2.5">
                      {[1, 2, 3].map((step) => (
                        <div key={step} className={step > 1 ? "space-y-2 border-t border-vexo-border pt-2.5" : "space-y-2"}>
                          <p className="text-xs font-medium text-vexo-fg">{HOT_LEAD_STEP_LABELS[step - 1]}</p>
                          {[1, 2, 3].map((n) => (
                            <TemplateMessageField
                              key={n}
                              name={`step${step}Message${n}`}
                              label={`Mensagem ${n}`}
                              required={false}
                              rows={2}
                              variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
                              defaultValue={hotLeadStepMessages[step - 1]?.[n - 1] ?? ""}
                              placeholder="Vazio usa um texto padrão de acompanhamento."
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>

                  <button
                    type="submit"
                    className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
                  >
                    Salvar textos
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
