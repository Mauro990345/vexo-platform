import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transcribeAudioFromUrl } from "@/lib/speech-to-text";

function audioResponse(contentType?: string): Response {
  const bytes = new TextEncoder().encode("fake-audio-bytes");
  return new Response(bytes, { status: 200, headers: contentType ? { "content-type": contentType } : {} });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("transcribeAudioFromUrl", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("baixa o áudio, detecta o formato pelo Content-Type e devolve o texto transcrito", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(audioResponse("audio/aac"))
      .mockResolvedValueOnce(jsonResponse(200, { text: "Oi, queria saber sobre o procedimento." }));

    const text = await transcribeAudioFromUrl("https://scontent.cdninstagram.com/audio123.bin");

    expect(text).toBe("Oi, queria saber sobre o procedimento.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe("https://openrouter.ai/api/v1/audio/transcriptions");

    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.model).toBe("openai/whisper-1");
    expect(body.input_audio.format).toBe("aac");
    expect(body.language).toBe("pt");
    expect(typeof body.input_audio.data).toBe("string");
  });

  it("sem Content-Type reconhecido, usa a extensão da URL como fallback", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(audioResponse()).mockResolvedValueOnce(jsonResponse(200, { text: "ok" }));

    await transcribeAudioFromUrl("https://scontent.cdninstagram.com/nota-de-voz.ogg");

    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.input_audio.format).toBe("ogg");
  });

  it("sem Content-Type nem extensão reconhecida na URL, usa 'aac' como palpite final", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(audioResponse()).mockResolvedValueOnce(jsonResponse(200, { text: "ok" }));

    await transcribeAudioFromUrl("https://scontent.cdninstagram.com/algum-id-opaco");

    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.input_audio.format).toBe("aac");
  });

  it("tenta de novo num 429 da OpenRouter e devolve o resultado quando a 2ª tentativa (download + transcrição) funciona", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(audioResponse("audio/mp4"))
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limited" }))
      .mockResolvedValueOnce(audioResponse("audio/mp4"))
      .mockResolvedValueOnce(jsonResponse(200, { text: "ok na 2ª tentativa" }));

    const promise = transcribeAudioFromUrl("https://scontent.cdninstagram.com/audio456.bin");
    await vi.advanceTimersByTimeAsync(500);

    expect(await promise).toBe("ok na 2ª tentativa");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("erro permanente (401 chave inválida) falha na 1ª tentativa, sem retry", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(audioResponse("audio/aac")).mockResolvedValueOnce(jsonResponse(401, { error: "invalid api key" }));

    await expect(transcribeAudioFromUrl("https://scontent.cdninstagram.com/audio789.bin")).rejects.toThrow(
      "Falha ao transcrever áudio"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lança erro claro se OPENROUTER_API_KEY não estiver configurada", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(transcribeAudioFromUrl("https://scontent.cdninstagram.com/audio.bin")).rejects.toThrow(
      "OPENROUTER_API_KEY não configurada"
    );
  });
});
