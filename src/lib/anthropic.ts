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
  "needsHuman": boolean,       // true se houver reclamação, insatisfação, pedido explícito de humano,
                                 // dúvida médica sensível fora do escopo comercial, ou mensagem hostil/abusiva
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

export type CalendarTool = {
  checkAvailability: (args: { dateFrom: string; dateTo: string }) => Promise<
    { slots: string[] } | { error: string }
  >;
  scheduleAppointment: (args: { startTime: string; leadName?: string }) => Promise<
    { confirmed: true; startTime: string } | { error: string }
  >;
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Consulta horários livres na agenda (Google Calendar) da clínica dentro de um intervalo de datas. Use antes de oferecer qualquer horário ao lead.",
    input_schema: {
      type: "object",
      properties: {
        dateFrom: { type: "string", description: "Data/hora inicial em ISO 8601." },
        dateTo: { type: "string", description: "Data/hora final em ISO 8601." },
      },
      required: ["dateFrom", "dateTo"],
    },
  },
  {
    name: "schedule_appointment",
    description:
      "Confirma o agendamento em um horário específico, já validado como disponível via check_availability. Só chame depois que o lead confirmar explicitamente o horário.",
    input_schema: {
      type: "object",
      properties: {
        startTime: { type: "string", description: "Data/hora de início em ISO 8601." },
        leadName: { type: "string", description: "Nome do lead, se conhecido." },
      },
      required: ["startTime"],
    },
  },
];

export async function generateLeadReply(params: {
  systemPrompt: string;
  history: ChatTurn[];
  calendar: CalendarTool;
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
        result = await params.calendar.checkAvailability(
          block.input as { dateFrom: string; dateTo: string }
        );
      } else if (block.name === "schedule_appointment") {
        const input = block.input as { startTime: string; leadName?: string };
        const outcome = await params.calendar.scheduleAppointment(input);
        result = outcome;
        if ("confirmed" in outcome && outcome.confirmed) {
          scheduled = { startTime: outcome.startTime };
        }
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
