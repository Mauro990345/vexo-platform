import { describe, it, expect, vi } from "vitest";
import type { CompleteRequest, ConverseRequest, LLMProvider } from "@/lib/llm/types";
import { classifyConversation, summarizeOlderTurns, generateLeadReply, type AgentTools } from "@/lib/anthropic";

// Testa a camada de NEGÓCIO (prompts, parsing, dispatch de ferramenta) com
// um LLMProvider falso injetado — sem tocar rede nem @anthropic-ai/sdk.
// Isso é o que garante que trocar de provedor (a implementação real, ver
// AnthropicProvider) nunca muda o comportamento que essas funções
// prometem aos seus call sites (conversation-pipeline.ts, follow-up.ts).

function fakeProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    complete: vi.fn(async (_request: CompleteRequest): Promise<{ text: string }> => ({ text: "" })),
    converse: vi.fn(async (_request: ConverseRequest): Promise<{ text: string }> => ({ text: "" })),
    modelForTier: vi.fn(() => "modelo-fake"),
    ...overrides,
  };
}

describe("classifyConversation", () => {
  it("manda o histórico formatado como transcript e usa o tier backstage", async () => {
    const complete = vi.fn(
      async (_request: CompleteRequest): Promise<{ text: string }> => ({
        text:
          '{"needsHuman": false, "summary": "lead perguntando preço", "suggestedFollowUp": true, ' +
          '"suggestedFollowUpReason": "perguntou preço e sumiu sem concluir"}',
      })
    );
    const provider = fakeProvider({ complete });

    const signal = await classifyConversation(
      [
        { role: "user", content: "Quanto custa?" },
        { role: "assistant", content: "Depende do procedimento." },
      ],
      provider
    );

    expect(signal).toEqual({
      needsHuman: false,
      needsHumanReason: undefined,
      summary: "lead perguntando preço",
      suggestedFollowUp: true,
      suggestedFollowUpReason: "perguntou preço e sumiu sem concluir",
    });

    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls.at(0)?.[0] as unknown as CompleteRequest;
    expect(request.tier).toBe("backstage");
    expect(request.userMessage).toBe("LEAD: Quanto custa?\nIA: Depende do procedimento.");
  });

  it("extrai o JSON mesmo com texto extra ao redor (o modelo às vezes não responde só o JSON)", async () => {
    const provider = fakeProvider({
      complete: vi.fn(async () => ({
        text: 'Aqui está: {"needsHuman": true, "needsHumanReason": "pediu humano", "summary": "x", "suggestedFollowUp": false} — fim.',
      })),
    });

    const signal = await classifyConversation([], provider);

    expect(signal.needsHuman).toBe(true);
    expect(signal.needsHumanReason).toBe("pediu humano");
  });

  it("expõe o motivo da recusa de follow-up (suggestedFollowUpReason) — bug real: suggestedFollowUp=false repetido em conversas triviais, sem nenhum log do PORQUÊ até esta correção", async () => {
    const provider = fakeProvider({
      complete: vi.fn(async () => ({
        text:
          '{"needsHuman": false, "summary": "troca de saudação, sem sinal comercial", "suggestedFollowUp": false, ' +
          '"suggestedFollowUpReason": "lead só cumprimentou, sem demonstrar interesse comercial nenhum ainda"}',
      })),
    });

    const signal = await classifyConversation([{ role: "user", content: "Oi, tudo bem?" }], provider);

    expect(signal.suggestedFollowUp).toBe(false);
    expect(signal.suggestedFollowUpReason).toBe(
      "lead só cumprimentou, sem demonstrar interesse comercial nenhum ainda"
    );
  });

  it("não escalona (needsHuman: false) se a resposta não for JSON válido", async () => {
    const provider = fakeProvider({ complete: vi.fn(async () => ({ text: "não sei o que responder aqui" })) });

    const signal = await classifyConversation([{ role: "user", content: "oi" }], provider);

    expect(signal).toEqual({
      needsHuman: false,
      summary: "",
      suggestedFollowUp: false,
      suggestedFollowUpReason: "",
    });
  });
});

describe("summarizeOlderTurns", () => {
  it("não chama o provider quando não há turnos (evita chamada de API desnecessária)", async () => {
    const complete = vi.fn(async () => ({ text: "não deveria ser chamado" }));
    const provider = fakeProvider({ complete });

    const summary = await summarizeOlderTurns([], provider);

    expect(summary).toBe("");
    expect(complete).not.toHaveBeenCalled();
  });

  it("usa o tier backstage e retorna o texto sem espaços nas pontas", async () => {
    const complete = vi.fn(async (_request: CompleteRequest) => ({ text: "  resumo do início da conversa  " }));
    const provider = fakeProvider({ complete });

    const summary = await summarizeOlderTurns([{ role: "user", content: "Quero botox" }], provider);

    expect(summary).toBe("resumo do início da conversa");
    const request = complete.mock.calls.at(0)?.[0] as unknown as CompleteRequest;
    expect(request.tier).toBe("backstage");
  });
});

describe("generateLeadReply", () => {
  function noopTools(overrides: Partial<AgentTools> = {}): AgentTools {
    return {
      checkAvailability: vi.fn(async () => ({ slots: [] })),
      scheduleAppointment: vi.fn(async () => ({ error: "não implementado no fake" })),
      confirmAttendance: vi.fn(async () => ({ confirmed: true as const })),
      checkCurrentAppointment: vi.fn(async () => ({ none: true as const })),
      saveLeadPhone: vi.fn(async () => ({ saved: true as const })),
      saveLeadName: vi.fn(async () => ({ saved: true as const })),
      sendResultPhoto: vi.fn(async () => ({ sent: true as const })),
      ...overrides,
    };
  }

  it("passa o system prompt cacheável e o contexto volátil separados, com tier conversation", async () => {
    const converse = vi.fn(async (_request: ConverseRequest) => ({ text: "Oi! Como posso ajudar?" }));
    const provider = fakeProvider({ converse });

    const reply = await generateLeadReply(
      {
        systemPrompt: "Você é a IA da Clínica X.",
        contextNote: "[Data/hora atual: 2026-09-17T12:00:00Z]",
        history: [{ role: "user", content: "Oi" }],
        tools: noopTools(),
      },
      provider
    );

    expect(reply.text).toBe("Oi! Como posso ajudar?");
    expect(reply.scheduled).toBeUndefined();

    const request = converse.mock.calls.at(0)?.[0] as unknown as ConverseRequest;
    expect(request.tier).toBe("conversation");
    expect(request.cacheableSystemPrompt).toBe("Você é a IA da Clínica X.");
    expect(request.volatileContext).toBe("[Data/hora atual: 2026-09-17T12:00:00Z]");
    // As 7 ferramentas de negócio do VEXO, sempre as mesmas — não muda por
    // conta de tools passado (que são as implementações, não a lista).
    expect(request.tools.map((t) => t.name)).toEqual([
      "check_availability",
      "schedule_appointment",
      "confirm_attendance",
      "save_lead_phone",
      "save_lead_name",
      "check_current_appointment",
      "send_result_photo",
    ]);
  });

  it("despacha check_availability pra AgentTools.checkAvailability via executeTool", async () => {
    const checkAvailability = vi.fn(async () => ({ slots: ["2026-09-18T09:00"] }));
    const provider = fakeProvider({
      converse: vi.fn(async (request: ConverseRequest) => {
        const result = await request.executeTool("check_availability", { dateFromLocal: "a", dateToLocal: "b" });
        expect(result).toEqual({ slots: ["2026-09-18T09:00"] });
        return { text: "ok" };
      }),
    });

    await generateLeadReply(
      {
        systemPrompt: "prompt",
        contextNote: "contexto",
        history: [],
        tools: noopTools({ checkAvailability }),
      },
      provider
    );

    expect(checkAvailability).toHaveBeenCalledWith({ dateFromLocal: "a", dateToLocal: "b" });
  });

  it("captura `scheduled` quando schedule_appointment confirma, via o mesmo executeTool", async () => {
    const scheduleAppointment = vi.fn(async () => ({ confirmed: true as const, startTimeLocal: "2026-09-18T09:00" }));
    const provider = fakeProvider({
      converse: vi.fn(async (request: ConverseRequest) => {
        await request.executeTool("schedule_appointment", {
          startTimeLocal: "2026-09-18T09:00",
          leadConfirmationQuote: "pode ser esse horário",
        });
        return { text: "Agendado!" };
      }),
    });

    const reply = await generateLeadReply(
      {
        systemPrompt: "prompt",
        contextNote: "contexto",
        history: [],
        tools: noopTools({ scheduleAppointment }),
      },
      provider
    );

    expect(reply.scheduled).toEqual({ startTimeLocal: "2026-09-18T09:00" });
  });

  it("não captura `scheduled` se schedule_appointment retornar erro", async () => {
    const scheduleAppointment = vi.fn(async () => ({ error: "horário não está mais livre" }));
    const provider = fakeProvider({
      converse: vi.fn(async (request: ConverseRequest) => {
        await request.executeTool("schedule_appointment", { startTimeLocal: "x", leadConfirmationQuote: "y" });
        return { text: "esse horário não está mais disponível" };
      }),
    });

    const reply = await generateLeadReply(
      {
        systemPrompt: "prompt",
        contextNote: "contexto",
        history: [],
        tools: noopTools({ scheduleAppointment }),
      },
      provider
    );

    expect(reply.scheduled).toBeUndefined();
  });

  it("retorna erro pro provider quando o nome da ferramenta é desconhecido", async () => {
    const provider = fakeProvider({
      converse: vi.fn(async (request: ConverseRequest) => {
        const result = await request.executeTool("ferramenta_que_nao_existe", {});
        expect(result).toEqual({ error: "Ferramenta desconhecida: ferramenta_que_nao_existe" });
        return { text: "ok" };
      }),
    });

    await generateLeadReply(
      { systemPrompt: "prompt", contextNote: "contexto", history: [], tools: noopTools() },
      provider
    );
  });

  it("passa um maxToolIterations generoso (não confia no default de cada provedor) — bug real: 4 iterações " +
    "não bastavam pra sequências com várias ferramentas no mesmo turno", async () => {
    const converse = vi.fn(async (_request: ConverseRequest) => ({ text: "ok" }));
    const provider = fakeProvider({ converse });

    await generateLeadReply(
      { systemPrompt: "prompt", contextNote: "contexto", history: [], tools: noopTools() },
      provider
    );

    const request = converse.mock.calls.at(0)?.[0] as unknown as ConverseRequest;
    expect(request.maxToolIterations).toBeGreaterThanOrEqual(8);
  });

  it("propaga `truncated: true` do provider — bug real: a mensagem de espera genérica saía pro lead " +
    "como se fosse a resposta final, travando a conversa até o lead mandar outra mensagem", async () => {
    const provider = fakeProvider({
      converse: vi.fn(async () => ({ text: "Só um momento, já te retorno com os detalhes.", truncated: true })),
    });

    const reply = await generateLeadReply(
      { systemPrompt: "prompt", contextNote: "contexto", history: [], tools: noopTools() },
      provider
    );

    expect(reply.truncated).toBe(true);
  });

  it("não marca `truncated` numa resposta normal (provider não devolve esse campo)", async () => {
    const provider = fakeProvider({
      converse: vi.fn(async () => ({ text: "Resposta normal" })),
    });

    const reply = await generateLeadReply(
      { systemPrompt: "prompt", contextNote: "contexto", history: [], tools: noopTools() },
      provider
    );

    expect(reply.truncated).toBeUndefined();
  });
});
