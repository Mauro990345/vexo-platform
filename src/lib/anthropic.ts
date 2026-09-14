import Anthropic from "@anthropic-ai/sdk";

// Dois modelos, dois papéis (ver especificação VEXO):
//  - Sonnet: conversa com o lead — naturalidade importa mais que custo.
//  - Haiku: tarefas de bastidor (classificação, resumo, gatilho de follow-up) — barato.
// Os IDs são configuráveis por env var para acompanhar novas versões sem redeploy de código.

export const CONVERSATION_MODEL = process.env.ANTHROPIC_CONVERSATION_MODEL ?? "claude-sonnet-5";
export const BACKSTAGE_MODEL = process.env.ANTHROPIC_BACKSTAGE_MODEL ?? "claude-haiku-4-5-20251001";

let _client: Anthropic | null = null;

export function anthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY não configurada.");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

// -----------------------------------------------------------------------
// Bastidor (Haiku) — classificação de estado da conversa
// -----------------------------------------------------------------------

export type ConversationSignal = {
  needsHuman: boolean;
  needsHumanReason?: string;
  summary: string;
  suggestedFollowUp: boolean;
};

const CLASSIFIER_SYSTEM_PROMPT = `Você analisa uma conversa de social selling (Instagram) entre um lead e uma
IA representando uma clínica de saúde estética/odontológica. Sua função é
puramente de bastidor: classificar o estado da conversa, nunca responder ao lead.

Responda SOMENTE com um JSON no formato:
{
  "needsHuman": boolean,       // true se houver insatisfação genuína (preço, atendimento, resultado do
                                 // procedimento etc.), pedido EXPLÍCITO de falar com humano/atendente, dúvida
                                 // médica sensível fora do escopo comercial, ou mensagem hostil/abusiva.
                                 // IMPORTANTE: o lead apontando um erro ou contradição PONTUAL da própria IA
                                 // nesta mesma conversa (ex: um horário que a IA disse estar livre e depois
                                 // corrigiu, uma informação que mudou) NÃO conta como motivo de escalonamento
                                 // sozinho — é um erro corrigível na hora, não uma reclamação sobre a clínica
                                 // ou insatisfação real. Só escalone por causa disso se o lead, além de apontar
                                 // o erro, também demonstrar insatisfação clara com o atendimento em si ou
                                 // pedir explicitamente um humano.
  "needsHumanReason": string,   // curto motivo, vazio se needsHuman=false
  "summary": string,            // resumo de 1-2 frases do estado atual da conversa
  "suggestedFollowUp": boolean  // true se o lead sumiu sem concluir agendamento/recusa explícita
}`;

export async function classifyConversation(history: ChatTurn[]): Promise<ConversationSignal> {
  const client = anthropicClient();

  const transcript = history
    .map((t) => `${t.role === "user" ? "LEAD" : "IA"}: ${t.content}`)
    .join("\n");

  const response = await client.messages.create({
    model: BACKSTAGE_MODEL,
    max_tokens: 400,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript || "(sem mensagens ainda)" }],
  });

  const text = response.content.find((b) => b.type === "text");
  const raw = text && "text" in text ? text.text : "{}";

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    return {
      needsHuman: Boolean(parsed.needsHuman),
      needsHumanReason: parsed.needsHumanReason || undefined,
      summary: parsed.summary ?? "",
      suggestedFollowUp: Boolean(parsed.suggestedFollowUp),
    };
  } catch {
    // Falha ao interpretar -> por segurança, não escalona automaticamente,
    // mas também não afirma nada sobre o estado.
    return { needsHuman: false, summary: "", suggestedFollowUp: false };
  }
}

// -----------------------------------------------------------------------
// Conversa com o lead (Sonnet) — com ferramentas de agenda
// -----------------------------------------------------------------------

export type AgentTools = {
  checkAvailability: (args: { dateFrom: string; dateTo: string }) => Promise<
    { slots: string[] } | { error: string }
  >;
  scheduleAppointment: (args: { startTime: string; leadName?: string; leadConfirmationQuote?: string }) => Promise<
    { confirmed: true; startTime: string } | { error: string }
  >;
  // Leitura pura, sem side effect — consulta o agendamento ativo do lead
  // NESTA conversa (o sistema já sabe quem está conversando, não precisa
  // perguntar). Usada tanto pra responder "esqueci meu horário"/"quando é
  // minha consulta" quanto como primeiro passo antes de uma remarcação
  // (ver schedule_appointment).
  checkCurrentAppointment: () => Promise<{ scheduledAt: string } | { none: true }>;
  // Chamada quando o lead informa o WhatsApp na conversa — normalmente logo
  // depois de confirmar o agendamento, se o prompt da clínica pedir esse
  // dado nesse momento (ver Clinic.aiSystemPrompt). Sem isso o número fica
  // só no texto da mensagem, sem ficar disponível pra secretária no CRM
  // nem pros lembretes automáticos por WhatsApp (que dependem de Lead.phone).
  saveLeadPhone: (args: { phone: string }) => Promise<{ saved: true } | { error: string }>;
  // Busca uma foto de resultado (antes/depois) cadastrada pra clínica na
  // categoria mais próxima do procedimento que o lead demonstrou interesse.
  // Trava em no máximo 1 envio por conversa — ver resultPhotoSentAt em
  // conversation-pipeline.ts.
  sendResultPhoto: (args: { category: string }) => Promise<{ sent: true } | { error: string }>;
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Consulta horários livres na agenda (Google Calendar) da clínica dentro de um intervalo de datas. Use " +
      "SEMPRE antes de oferecer ou confirmar qualquer horário ao lead — nunca ofereça um horário sem ter " +
      "chamado essa ferramenta antes, mesmo que pareça óbvio que vai estar livre.",
    input_schema: {
      type: "object",
      properties: {
        dateFrom: {
          type: "string",
          description: "Data/hora inicial em ISO 8601 UTC, com sufixo \"Z\" (ex.: \"2026-09-14T12:00:00Z\").",
        },
        dateTo: {
          type: "string",
          description: "Data/hora final em ISO 8601 UTC, com sufixo \"Z\" (ex.: \"2026-09-14T21:00:00Z\").",
        },
      },
      required: ["dateFrom", "dateTo"],
    },
  },
  {
    name: "schedule_appointment",
    description:
      "Confirma o agendamento em um horário específico — TAMBÉM é essa a ferramenta certa pra REMARCAR um " +
      "agendamento que o lead já tem (ex.: \"quero mudar meu horário\", \"posso remarcar?\"): chame do mesmo " +
      "jeito, com o horário NOVO — o sistema identifica sozinho que já existe um agendamento nesta conversa e " +
      "MOVE ele pro novo horário em vez de criar um segundo. Se não tiver certeza se o lead já tem um horário " +
      "marcado, chame check_current_appointment antes. Regras rígidas, nessa ordem, valem igual pra primeira " +
      "marcação e pra remarcação: (1) já ter chamado check_availability pra esse horário exato NESTA MESMA " +
      "conversa; (2) o lead ter confirmado explícita e claramente ESSE horário específico — não chame se a " +
      "conversa ficou ambígua ou contraditória sobre qual horário ficou combinado; (3) só então chamar esta " +
      "ferramenta. A ferramenta reverifica a disponibilidade de novo por conta própria e rejeita se não estiver " +
      "realmente livre. NUNCA diga ao lead que o horário está confirmado/reservado (ou remarcado) antes de " +
      "chamar esta ferramenta e ela retornar sucesso — se ela retornar erro, NÃO diga que está confirmado; " +
      "ofereça outro horário.",
    input_schema: {
      type: "object",
      properties: {
        startTime: {
          type: "string",
          description: "Data/hora de início em ISO 8601 UTC, com sufixo \"Z\" (ex.: \"2026-09-14T17:00:00Z\").",
        },
        leadName: { type: "string", description: "Nome do lead, se conhecido." },
        leadConfirmationQuote: {
          type: "string",
          description:
            "Cite a mensagem exata (ou trecho dela) em que o lead confirmou ESSE horário específico. Obrigatório " +
            "— se não houver uma confirmação clara e específica pra citar, não chame esta ferramenta ainda.",
        },
      },
      required: ["startTime", "leadConfirmationQuote"],
    },
  },
  {
    name: "save_lead_phone",
    description:
      "Salva o número de WhatsApp do lead assim que ele informar na conversa. Chame sempre que o lead enviar um número de telefone/WhatsApp, mesmo que fora do momento em que foi pedido.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Número de WhatsApp informado pelo lead, no formato que ele mandou." },
      },
      required: ["phone"],
    },
  },
  {
    name: "check_current_appointment",
    description:
      "Consulta se o lead já tem um agendamento ativo NESTA conversa, e qual o horário — leitura pura, sem " +
      "nenhum efeito colateral. Use antes de responder perguntas como \"esqueci meu horário\", \"quando é minha " +
      "consulta?\" ou \"posso remarcar?\", e também como primeiro passo antes de uma remarcação (ver " +
      "schedule_appointment) se não tiver certeza do horário atual.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "send_result_photo",
    description:
      "Envia uma foto de resultado (antes/depois) de um procedimento específico, quando o lead demonstrar interesse claro naquele procedimento durante a conversa. Use a categoria mais próxima do procedimento mencionado (ex: 'botox', 'preenchimento labial', 'harmonização facial'). No máximo uma vez por conversa — não chame de novo se já tiver enviado antes.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Categoria/procedimento mencionado pelo lead (ex: 'botox')." },
      },
      required: ["category"],
    },
  },
];

export async function generateLeadReply(params: {
  systemPrompt: string;
  history: ChatTurn[];
  tools: AgentTools;
}): Promise<{ text: string; scheduled?: { startTime: string } }> {
  const client = anthropicClient();
  const messages: Anthropic.MessageParam[] = params.history.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  let scheduled: { startTime: string } | undefined;

  // Loop agentic: o modelo pode encadear chamadas de ferramenta antes do
  // texto final de resposta ao lead.
  for (let iteration = 0; iteration < 4; iteration++) {
    const response = await client.messages.create({
      model: CONVERSATION_MODEL,
      max_tokens: 1024,
      system: params.systemPrompt,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock && "text" in textBlock ? textBlock.text : "";
      return { text, scheduled };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      let result: unknown;
      if (block.name === "check_availability") {
        result = await params.tools.checkAvailability(
          block.input as { dateFrom: string; dateTo: string }
        );
      } else if (block.name === "schedule_appointment") {
        const input = block.input as { startTime: string; leadName?: string; leadConfirmationQuote?: string };
        const outcome = await params.tools.scheduleAppointment(input);
        result = outcome;
        if ("confirmed" in outcome && outcome.confirmed) {
          scheduled = { startTime: outcome.startTime };
        }
      } else if (block.name === "check_current_appointment") {
        result = await params.tools.checkCurrentAppointment();
      } else if (block.name === "save_lead_phone") {
        result = await params.tools.saveLeadPhone(block.input as { phone: string });
      } else if (block.name === "send_result_photo") {
        result = await params.tools.sendResultPhoto(block.input as { category: string });
      } else {
        result = { error: `Ferramenta desconhecida: ${block.name}` };
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { text: "Só um momento, já te retorno com os detalhes.", scheduled };
}
