import type { LLMProvider, ToolDefinition } from "@/lib/llm/types";
import { getLLMProvider } from "@/lib/llm/provider";

// Camada de NEGÓCIO (prompts, parsing, dispatch de ferramenta) — não sabe
// nada sobre @anthropic-ai/sdk nem qualquer outro SDK de provedor. A
// mecânica de "como chamar um LLM de verdade" mora em src/lib/llm/ (ver
// LLMProvider, src/lib/llm/types.ts); este arquivo só usa a interface,
// resolvida por getLLMProvider() — trocar de provedor não muda nada aqui.
//
// `provider` é opcional em toda função exportada, com getLLMProvider()
// como default — mesmo padrão de dependency injection já usado em
// buildConversationContext (conversation-context.ts): deixa os testes
// injetarem um LLMProvider fake sem mock de módulo, sem mudar nenhum call
// site de produção (que nunca passa esse argumento).

// Re-exportado daqui (não movido pra cima) por compatibilidade — todo
// código que já importava ChatTurn de "@/lib/anthropic" (chat-history.ts,
// conversation-context.ts) continua funcionando sem mudar import nenhum;
// a definição em si mora em src/lib/llm/types.ts, junto do resto do
// contrato neutro de provedor.
export type { ChatTurn } from "@/lib/llm/types";
import type { ChatTurn } from "@/lib/llm/types";

// -----------------------------------------------------------------------
// Bastidor (tier "backstage" — Haiku por padrão, ou o que LLM_PROVIDER/
// OPENROUTER_BACKSTAGE_MODEL apontar; ver getLLMProvider, provider.ts) —
// classificação de estado da conversa
// -----------------------------------------------------------------------

export type ConversationSignal = {
  needsHuman: boolean;
  needsHumanReason?: string;
  summary: string;
  suggestedFollowUp: boolean;
  // Motivo curto da decisão de suggestedFollowUp (reengajar ou não) —
  // adicionado depois de um relato real: suggestedFollowUp=false
  // repetido em conversas de teste simples/neutras (ex: "Oi, tudo bem?"
  // sem mais contexto), logo após trocar o modelo do tier "backstage" pra
  // Luna via OpenRouter — sem esse campo, o log [vexo:followup]
  // (follow-up.ts) só registrava O FATO da recusa, nunca o PORQUÊ,
  // deixando impossível distinguir "o modelo está sendo excessivamente
  // conservador" de "o prompt já não pedia reengajamento pra esse tipo de
  // conversa mesmo antes da troca de modelo" — as duas hipóteses
  // colocadas nesta investigação.
  suggestedFollowUpReason: string;
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
  "suggestedFollowUp": boolean, // true se o lead demonstrou algum interesse comercial (perguntou preço,
                                 // procedimento, horário etc.) e sumiu sem concluir agendamento nem recusar
                                 // explicitamente — uma troca de saudação sem nenhum sinal de interesse real
                                 // (ex: só "Oi, tudo bem?" sem resposta do lead) não é uma venda esfriando,
                                 // então não é motivo de reengajamento por si só.
  "suggestedFollowUpReason": string // curto motivo da decisão de suggestedFollowUp acima (por que reengajar
                                 // faz ou não sentido) — SEMPRE preencha, mesmo quando suggestedFollowUp=false
}`;

export async function classifyConversation(
  history: ChatTurn[],
  provider: LLMProvider = getLLMProvider()
): Promise<ConversationSignal> {
  const transcript = history
    .map((t) => `${t.role === "user" ? "LEAD" : "IA"}: ${t.content}`)
    .join("\n");

  const response = await provider.complete({
    tier: "backstage",
    maxTokens: 400,
    systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
    userMessage: transcript || "(sem mensagens ainda)",
  });

  try {
    const match = response.text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : response.text);
    return {
      needsHuman: Boolean(parsed.needsHuman),
      needsHumanReason: parsed.needsHumanReason || undefined,
      summary: parsed.summary ?? "",
      suggestedFollowUp: Boolean(parsed.suggestedFollowUp),
      suggestedFollowUpReason: parsed.suggestedFollowUpReason || "",
    };
  } catch {
    // Falha ao interpretar -> por segurança, não escalona automaticamente,
    // mas também não afirma nada sobre o estado.
    return { needsHuman: false, summary: "", suggestedFollowUp: false, suggestedFollowUpReason: "" };
  }
}

// -----------------------------------------------------------------------
// Bastidor (Haiku) — resumo do início de conversas longas
// -----------------------------------------------------------------------

// Usado por buildConversationContext (conversation-context.ts) quando a
// conversa passa da janela de mensagens recentes mandada por inteiro pro
// modelo (ver HISTORY_WINDOW_SIZE) — sem isso, uma conversa longa manda o
// histórico inteiro desde o primeiro dia em toda mensagem nova, pra
// sempre, sem nenhum teto de custo. Só o que sai da janela vira resumo; as
// mensagens recentes continuam indo por inteiro.
const SUMMARY_SYSTEM_PROMPT = `Você resume o INÍCIO de uma conversa de social selling (Instagram) entre um
lead e a IA de uma clínica de saúde estética/odontológica — as mensagens
mais recentes dessa mesma conversa NÃO estão aqui, já vão em separado pra
quem for continuar o atendimento; resuma só o trecho que está fora dessa
janela.

Cubra especificamente, quando existir no trecho:
- Procedimento(s) que o lead demonstrou interesse ou que já ficou combinado.
- Datas, horários ou promessas específicas já feitas (por qualquer lado) —
  inclusive se depois mudaram de ideia.
- Objeções que o lead levantou e como foram resolvidas (ou não).

Curto e direto, só o que for relevante pra continuar a conversa sem
confusão — não é resumo literário, é contexto de trabalho. Responda
SOMENTE com o resumo corrido, sem introdução nem comentário sobre a
tarefa.`;

export async function summarizeOlderTurns(
  turns: ChatTurn[],
  provider: LLMProvider = getLLMProvider()
): Promise<string> {
  if (turns.length === 0) return "";

  const transcript = turns.map((t) => `${t.role === "user" ? "LEAD" : "IA"}: ${t.content}`).join("\n");

  const response = await provider.complete({
    tier: "backstage",
    maxTokens: 400,
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userMessage: transcript,
  });

  return response.text.trim();
}

// -----------------------------------------------------------------------
// Conversa com o lead (Sonnet) — com ferramentas de agenda
// -----------------------------------------------------------------------

export type AgentTools = {
  // dateFromLocal/dateToLocal e startTimeLocal, em todas as ferramentas de
  // agenda abaixo, são SEMPRE horário de Brasília, no formato
  // "AAAA-MM-DDTHH:mm" — NUNCA UTC, nunca com sufixo de fuso. De propósito:
  // ver src/lib/timezone.ts pro bug real que essa escolha resolve
  // (agendamentos genuinamente livres sendo rejeitados porque o modelo
  // precisava converter pra UTC de cabeça a cada turno, sem nenhum jeito
  // confiável de recuperar a conversão exata de um turno anterior). A
  // conversão pra UTC (exigida pela API do Google Calendar) acontece
  // inteiramente do lado do servidor, nunca no modelo.
  // ownAppointmentLocal vem preenchido quando o agendamento JÁ CONFIRMADO
  // desta própria conversa cai dentro da janela consultada — sinal
  // explícito de que, se esse horário não aparecer em `slots`, é porque
  // ele está "ocupado" pelo PRÓPRIO agendamento do lead, não por um
  // conflito de outra pessoa. Bug real em produção: o lead questionou um
  // horário já confirmado ("tem certeza que está ocupado?"), a IA rechamou
  // check_availability, viu o próprio horário como ocupado (correto — o
  // evento existe mesmo) e concluiu (errado) que havia um conflito real,
  // dizendo ao lead que o agendamento dele não era válido. Ver
  // buildAvailabilityCheck, conversation-pipeline.ts.
  checkAvailability: (args: { dateFromLocal: string; dateToLocal: string }) => Promise<
    { slots: string[]; ownAppointmentLocal?: string } | { error: string }
  >;
  scheduleAppointment: (args: { startTimeLocal: string; leadConfirmationQuote?: string }) => Promise<
    { confirmed: true; startTimeLocal: string } | { error: string }
  >;
  // Chamada só depois que a sequência INTEIRA de confirmação de presença
  // termina: o lead confirmou explicitamente que vai comparecer E você já
  // mandou a mensagem final com as instruções de chegada (ver descrição
  // completa em TOOL_DEFINITIONS). Bug real em produção: o vídeo
  // institucional saía logo depois de schedule_appointment confirmar o
  // horário — no meio da própria pergunta "posso contar com sua
  // presença?", antes do lead sequer responder. Nada no código sabia
  // identificar sozinho o fim dessa sequência (ela só existe como texto
  // livre gerado pela IA), então esta chamada é o sinal explícito que
  // faltava — ver Appointment.attendanceConfirmedAt e
  // maybeSendConfirmationVideo, conversation-pipeline.ts.
  confirmAttendance: () => Promise<{ confirmed: true } | { error: string }>;
  // Leitura pura, sem side effect — consulta o agendamento ativo do lead
  // NESTA conversa (o sistema já sabe quem está conversando, não precisa
  // perguntar). Usada tanto pra responder "esqueci meu horário"/"quando é
  // minha consulta" quanto como primeiro passo antes de uma remarcação
  // (ver schedule_appointment).
  checkCurrentAppointment: () => Promise<{ scheduledAtLocal: string } | { none: true }>;
  // Chamada quando o lead informa o WhatsApp na conversa — normalmente logo
  // depois de confirmar o agendamento, se o prompt da clínica pedir esse
  // dado nesse momento (ver Clinic.aiSystemPrompt). Sem isso o número fica
  // só no texto da mensagem, sem ficar disponível pra secretária no CRM
  // nem pros lembretes automáticos por WhatsApp (que dependem de Lead.phone).
  saveLeadPhone: (args: { phone: string }) => Promise<{ saved: true } | { error: string }>;
  // Chamada quando o lead informa (ou confirma) o próprio nome na conversa
  // — bug real em produção: não existia NENHUM jeito de persistir um nome
  // dito em conversa (só uma tentativa best-effort de ler o perfil público
  // do Instagram, que frequentemente não devolve nada — ver
  // nameLookupAttempted mais abaixo), então agendamentos confirmados sem o
  // lead ter se apresentado espontaneamente ficavam pra sempre com "lead"
  // genérico no evento do Google Calendar. schedule_appointment agora
  // recusa agendar sem um nome real salvo (ver o handler dela) — esta é a
  // única forma de satisfazer essa exigência a partir da conversa.
  saveLeadName: (args: { name: string }) => Promise<{ saved: true } | { error: string }>;
  // Busca uma foto de resultado (antes/depois) cadastrada pra clínica na
  // categoria mais próxima do procedimento que o lead demonstrou interesse.
  // Trava em no máximo 1 envio por conversa — ver resultPhotoSentAt em
  // conversation-pipeline.ts.
  sendResultPhoto: (args: { category: string }) => Promise<{ sent: true } | { error: string }>;
};

// Definições de ferramenta em JSON Schema puro (ToolDefinition, neutro de
// provedor — ver src/lib/llm/types.ts) — cada provedor traduz pro formato
// que sua própria API espera (ex: AnthropicProvider mapeia inputSchema ->
// input_schema). Isso é lógica de negócio do VEXO (nomes, descrições e
// parâmetros das ferramentas), por isso mora aqui, não em src/lib/llm/.
const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "check_availability",
    description:
      "Consulta horários livres na agenda (Google Calendar) da clínica dentro de um intervalo de datas. Use " +
      "SEMPRE antes de oferecer ou confirmar qualquer horário ao lead — nunca ofereça um horário sem ter " +
      "chamado essa ferramenta antes, mesmo que pareça óbvio que vai estar livre. Se a resposta incluir " +
      "ownAppointmentLocal, esse horário específico é o PRÓPRIO agendamento já confirmado desta conversa — é " +
      "por isso que ele não aparece em slots (a agenda genuinamente tem um evento lá, mas é a reserva do " +
      "lead, não um conflito de outra pessoa). NUNCA diga ao lead que esse horário está ocupado ou que o " +
      "agendamento dele não é válido só porque ele não apareceu em slots — confirme que é exatamente a " +
      "reserva dele. Só trate um horário fora de slots como indisponível de verdade quando ele NÃO bater com " +
      "ownAppointmentLocal.",
    inputSchema: {
      type: "object",
      properties: {
        dateFromLocal: {
          type: "string",
          description:
            "Data/hora inicial no horário de Brasília, SEM conversão pra UTC e SEM sufixo de fuso — formato " +
            "\"AAAA-MM-DDTHH:mm\" (ex.: \"2026-09-14T09:00\" pras 9h de Brasília). Nunca escreva \"Z\" nem faça " +
            "nenhuma conta de fuso horário — o sistema converte por conta própria.",
        },
        dateToLocal: {
          type: "string",
          description:
            "Data/hora final no horário de Brasília, mesmo formato de dateFromLocal (ex.: \"2026-09-14T18:00\").",
        },
      },
      required: ["dateFromLocal", "dateToLocal"],
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
      "ofereça outro horário. TAMBÉM exige um nome real do lead já salvo (ver save_lead_name) — se ainda não " +
      "souber o nome dele, pergunte antes de chamar esta ferramenta; ela rejeita com erro se nenhum nome foi " +
      "salvo ainda, mesmo com tudo mais certo. TAMBÉM exige o WhatsApp confirmado NESTA MESMA conversa (ver " +
      "save_lead_phone) — mesmo que o lead já tenha um número salvo de uma conversa anterior (mesma conta de " +
      "Instagram), ela rejeita com erro se save_lead_phone não foi chamado NESTA conversa, porque a pessoa do " +
      "outro lado pode ser diferente de quem informou o número antes.",
    inputSchema: {
      type: "object",
      properties: {
        startTimeLocal: {
          type: "string",
          description:
            "Data/hora de início no horário de Brasília, SEM conversão pra UTC e SEM sufixo de fuso — mesmo " +
            "formato de check_availability (\"AAAA-MM-DDTHH:mm\", ex.: \"2026-09-14T14:00\" pras 14h de " +
            "Brasília). Nunca escreva \"Z\" nem faça nenhuma conta de fuso horário.",
        },
        leadConfirmationQuote: {
          type: "string",
          description:
            "Cite a mensagem exata (ou trecho dela) em que o lead confirmou ESSE horário específico. Obrigatório " +
            "— se não houver uma confirmação clara e específica pra citar, não chame esta ferramenta ainda.",
        },
      },
      required: ["startTimeLocal", "leadConfirmationQuote"],
    },
  },
  {
    name: "confirm_attendance",
    description:
      "Chame esta ferramenta só depois de TER FEITO AS DUAS COISAS, NESSA ORDEM: (1) o lead confirmar " +
      "explicitamente que vai comparecer ao horário marcado (ex.: \"sim\", \"pode contar comigo\", \"vou " +
      "sim\") — uma resposta genérica tipo só \"ok\" ou \"👍\" a uma pergunta ANTERIOR não conta; (2) você já " +
      "ter enviado ao lead a mensagem final da sequência de agendamento, com as instruções de chegada (ex.: " +
      "\"chegue uns 15 minutinhos antes...\"). NUNCA chame antes das duas terem acontecido de verdade — em " +
      "especial, NUNCA chame só por schedule_appointment ter confirmado o horário, e NUNCA chame só por ter " +
      "PERGUNTADO \"posso contar com sua presença?\" — ela precisa da RESPOSTA do lead E da sua mensagem " +
      "final já enviada. Esta chamada é o que libera o envio do vídeo institucional de confirmação pro lead " +
      "— chamar cedo demais faz o vídeo interromper a conversa no meio da própria confirmação de presença.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "save_lead_phone",
    description:
      "Salva o número de WhatsApp do lead assim que ele informar na conversa. Chame sempre que o lead enviar um número de telefone/WhatsApp, mesmo que fora do momento em que foi pedido. Chame mesmo se já existir um número salvo de uma conversa anterior — schedule_appointment exige que o WhatsApp seja confirmado NESTA conversa, nunca reaproveita um número de outra.",
    inputSchema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Número de WhatsApp informado pelo lead, no formato que ele mandou." },
      },
      required: ["phone"],
    },
  },
  {
    name: "save_lead_name",
    description:
      "Salva o nome do lead assim que ele informar na conversa (espontaneamente ou em resposta a você " +
      "perguntar). Se ainda não souber o nome dele, pergunte em algum momento natural antes de agendar — " +
      "pode ser junto com o pedido do WhatsApp, ou um pouco antes. schedule_appointment exige um nome salvo " +
      "por esta ferramenta antes de confirmar qualquer horário.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome (ou nome e sobrenome) informado pelo lead." },
      },
      required: ["name"],
    },
  },
  {
    name: "check_current_appointment",
    description:
      "Consulta se o lead já tem um agendamento ativo NESTA conversa, e qual o horário — leitura pura, sem " +
      "nenhum efeito colateral. Use antes de responder perguntas como \"esqueci meu horário\", \"quando é minha " +
      "consulta?\" ou \"posso remarcar?\", e também como primeiro passo antes de uma remarcação (ver " +
      "schedule_appointment) se não tiver certeza do horário atual.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "send_result_photo",
    description:
      "Envia uma foto de resultado (antes/depois) de um procedimento específico, quando o lead demonstrar interesse claro naquele procedimento durante a conversa. Use a categoria mais próxima do procedimento mencionado (ex: 'botox', 'preenchimento labial', 'harmonização facial'). No máximo uma vez por conversa — não chame de novo se já tiver enviado antes.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Categoria/procedimento mencionado pelo lead (ex: 'botox')." },
      },
      required: ["category"],
    },
  },
];

export async function generateLeadReply(params: {
  // Prompt de conversação da clínica (Clinic.aiSystemPrompt, ou o padrão de
  // fallback) — ESTÁVEL entre mensagens da mesma clínica (só muda se
  // alguém editar em /crm/clinicas/[id]/agente-ia). Cacheado
  // (cacheableSystemPrompt no ConverseRequest), junto com as ferramentas
  // (idênticas pra toda clínica/conversa, nunca mudam) — a "última
  // posição" cacheável nesse conjunto.
  systemPrompt: string;
  // Bloco de contexto que muda em TODA mensagem (data/hora atual, minuto a
  // minuto — ver dateTimeContext em conversation-pipeline.ts). Vai como
  // volatileContext (fora do prefixo cacheado), de propósito: colar isso
  // dentro do mesmo texto que systemPrompt (como era antes do PR de
  // caching) invalidava o cache inteiro a cada chamada, já que qualquer
  // byte diferente no prefixo derruba tudo que vem depois — é exatamente
  // o anti-padrão "datetime.now() no system prompt" que a própria
  // documentação de prompt caching da Anthropic lista como o jeito mais
  // comum de quebrar cache sem perceber.
  contextNote: string;
  history: ChatTurn[];
  tools: AgentTools;
}, provider: LLMProvider = getLLMProvider()): Promise<{
  text: string;
  scheduled?: { startTimeLocal: string };
  truncated?: boolean;
}> {
  let scheduled: { startTimeLocal: string } | undefined;

  // Dispatch de ferramenta — lógica de negócio do VEXO (qual nome de
  // ferramenta chama qual função de params.tools), por isso fica aqui, não
  // dentro do provedor. O provedor só sabe executar isso como uma caixa
  // preta a cada tool_use que o modelo pedir (ver converse, LLMProvider).
  const executeTool = async (name: string, input: unknown): Promise<unknown> => {
    if (name === "check_availability") {
      return params.tools.checkAvailability(input as { dateFromLocal: string; dateToLocal: string });
    }
    if (name === "schedule_appointment") {
      const typedInput = input as { startTimeLocal: string; leadConfirmationQuote?: string };
      const outcome = await params.tools.scheduleAppointment(typedInput);
      if ("confirmed" in outcome && outcome.confirmed) {
        scheduled = { startTimeLocal: outcome.startTimeLocal };
      }
      return outcome;
    }
    if (name === "confirm_attendance") {
      return params.tools.confirmAttendance();
    }
    if (name === "check_current_appointment") {
      return params.tools.checkCurrentAppointment();
    }
    if (name === "save_lead_phone") {
      return params.tools.saveLeadPhone(input as { phone: string });
    }
    if (name === "save_lead_name") {
      return params.tools.saveLeadName(input as { name: string });
    }
    if (name === "send_result_photo") {
      return params.tools.sendResultPhoto(input as { category: string });
    }
    return { error: `Ferramenta desconhecida: ${name}` };
  };

  const result = await provider.converse({
    tier: "conversation",
    cacheableSystemPrompt: params.systemPrompt,
    volatileContext: params.contextNote,
    history: params.history,
    tools: TOOL_DEFINITIONS,
    executeTool,
    // Bug real em produção: com o default de 4 iterações de cada provedor
    // (ver AnthropicProvider/OpenRouterProvider), um turno que precisasse
    // de mais de 4 chamadas de ferramenta seguidas antes do texto final
    // (ex.: schedule_appointment + save_lead_phone + save_lead_name, e só
    // ENTÃO a resposta de verdade — hoje há 7 ferramentas de negócio, bem
    // mais que quando esse default de 4 foi escolhido) esgotava o loop
    // ANTES do modelo conseguir gerar a resposta real, devolvendo só o
    // fallbackText genérico abaixo — que ia pro lead como se fosse a
    // resposta final, deixando a conversa "travada" até o lead mandar
    // outra mensagem (nada tentava de novo sozinho). 12 dá folga
    // confortável pra sequências de várias ferramentas no mesmo turno,
    // continuando limitado (nunca vira um loop sem fim) — e generateLeadReply
    // agora trata truncated=true (ver ConverseResult) como uma falha real
    // (escalona pra revisão humana em conversation-pipeline.ts), não como
    // uma resposta válida, caso mesmo essa folga não seja suficiente algum dia.
    maxToolIterations: 12,
    fallbackText: "Só um momento, já te retorno com os detalhes.",
  });

  return { text: result.text, scheduled, truncated: result.truncated };
}
