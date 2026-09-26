import { withRetry, RetryableError } from "@/lib/retry";

// Transcrição de mensagens de áudio do Instagram — via OpenRouter
// (POST /api/v1/audio/transcriptions), NÃO a API direta da OpenAI: mesma
// OPENROUTER_API_KEY já configurada pra chat/classificação (ver
// src/lib/llm/openrouter-provider.ts), sem precisar de conta/cartão novo
// — confirmado na doc oficial (openrouter.ai/blog/tutorials/
// transcription-on-openrouter/): "It takes the same Bearer key as Chat
// Completions." Modelo openai/whisper-1 por padrão (Whisper clássico da
// OpenAI, hospedado através da OpenRouter, cobrado por segundo de áudio,
// sem markup da OpenRouter em cima do preço do provedor).
//
// Esse endpoint NÃO aceita URL de áudio (só base64 JSON ou multipart) —
// por isso baixamos o arquivo da URL que a Meta manda no attachment antes
// de mandar pra transcrição. Nada é salvo em disco: baixa, transcreve,
// descarta — decisão explícita (ver conversa que motivou esta feature),
// evita o problema de storage persistente em containers efêmeros do
// Railway (mesmo problema já documentado em uploads.ts).
const OPENROUTER_TRANSCRIPTION_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
const TRANSCRIPTION_MODEL = process.env.OPENROUTER_TRANSCRIPTION_MODEL ?? "openai/whisper-1";

// Content-Type -> um dos formatos aceitos pelo campo input_audio.format
// (wav, mp3, flac, m4a, ogg, webm, aac) — obrigatório no request, mas a
// Meta não documenta de forma confiável qual Content-Type exato ela usa
// pra nota de voz do Instagram (produto ainda pouco documentado, mesmo
// padrão de incerteza já visto em outras partes desta integração — ver
// instagram.ts). "aac" como fallback final é o palpite mais forte (é o
// formato nativo de nota de voz do Messenger/Instagram) — a confirmar
// contra o primeiro Content-Type real capturado em produção.
const CONTENT_TYPE_TO_FORMAT: Record<string, string> = {
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};
const SUPPORTED_FORMATS = new Set(Object.values(CONTENT_TYPE_TO_FORMAT));
const FALLBACK_FORMAT = "aac";

// Diagnóstico rico do erro da OpenRouter — reduz a incerteza de "é saldo
// da OpenRouter ou é outra coisa (BYOK, formato de áudio, etc.)" sem
// precisar abrir o painel da OpenRouter manualmente. `error.metadata.
// limit_source` é o campo que a própria doc oficial da OpenRouter usa pra
// distinguir a causa de um 402 (ver
// openrouter.ai/docs/api_reference/limits, seção "Handling 402 errors"):
// "openrouter_credits"/"openrouter_key_limit"/"openrouter_in_flight_budget"
// = saldo/limite do LADO DA OPENROUTER; ausência desse campo (ou um
// provider_code presente) tende a indicar erro do LADO DO PROVEDOR (BYOK,
// formato rejeitado, etc.) — a distinção exata que motivou toda essa
// investigação de tier/saldo. Sempre inclui o corpo cru completo por
// último, pra nunca perder informação mesmo se a Meta/OpenRouter mudar o
// formato do erro sem avisar.
async function buildOpenRouterErrorDetail(res: Response): Promise<string> {
  const rawBody = await res.text();
  const parts = [`HTTP ${res.status}`];

  let parsed: { error?: { code?: number; message?: string; metadata?: Record<string, unknown> } } | undefined;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Corpo não é JSON — segue só com o texto cru no final.
  }

  if (parsed?.error) {
    if (parsed.error.message) parts.push(`message=${parsed.error.message}`);
    const metadata = parsed.error.metadata;
    if (metadata) {
      if (metadata.limit_source) parts.push(`limit_source=${metadata.limit_source}`);
      if (metadata.reason) parts.push(`reason=${metadata.reason}`);
      if (metadata.remedy_hint) parts.push(`remedy_hint=${metadata.remedy_hint}`);
      if (metadata.provider_code) parts.push(`provider_code=${metadata.provider_code}`);
      if (metadata.error_type) parts.push(`error_type=${metadata.error_type}`);
    }
  }

  // Só presentes em erro de rate limit (ver doc), mas custo zero incluir
  // quando existirem — sem eles, silenciosamente omitidos.
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) parts.push(`retry-after=${retryAfter}s`);
  const rateLimitRemaining = res.headers.get("x-ratelimit-remaining");
  if (rateLimitRemaining) parts.push(`x-ratelimit-remaining=${rateLimitRemaining}`);

  parts.push(`corpo_completo=${rawBody}`);
  return parts.join(" | ");
}

function guessAudioFormat(contentType: string | null, url: string): string {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized && CONTENT_TYPE_TO_FORMAT[normalized]) return CONTENT_TYPE_TO_FORMAT[normalized];

  const extension = new URL(url).pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension && SUPPORTED_FORMATS.has(extension)) return extension;

  return FALLBACK_FORMAT;
}

// Baixa o áudio da URL de attachment da Meta e transcreve via OpenRouter.
// Tudo dentro do MESMO withRetry (download + transcrição) — se o download
// falhar de forma transitória (429/5xx/rede), tenta o par inteiro de novo;
// reaproveitar só a transcrição sem reter os bytes baixados adicionaria
// complexidade sem ganho real (nota de voz é sempre pequena, poucos
// segundos a no máximo 1-2 minutos — rebaixar não é caro).
export async function transcribeAudioFromUrl(audioUrl: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não configurada — necessária pra transcrever áudio.");
  }

  return withRetry(
    async () => {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        const message = `Falha ao baixar o áudio da URL da Meta (HTTP ${audioRes.status}).`;
        // 404/403 aqui costuma ser URL de attachment expirada/inválida —
        // permanente, tentar de novo não resolve. 429/5xx é transitório.
        if (audioRes.status === 429 || audioRes.status >= 500) throw new RetryableError(message);
        throw new Error(message);
      }

      const format = guessAudioFormat(audioRes.headers.get("content-type"), audioUrl);
      const audioBase64 = Buffer.from(await audioRes.arrayBuffer()).toString("base64");

      const res = await fetch(OPENROUTER_TRANSCRIPTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        // language: "pt" — clínicas e leads são todos BR; um hint de
        // idioma reduz ambiguidade em áudios curtos/ruidosos (ver doc
        // oficial da OpenRouter), sem impedir o modelo de lidar com
        // algum trecho em outro idioma se acontecer.
        body: JSON.stringify({
          model: TRANSCRIPTION_MODEL,
          input_audio: { data: audioBase64, format },
          language: "pt",
        }),
      });

      if (!res.ok) {
        const detail = await buildOpenRouterErrorDetail(res);
        const message = `Falha ao transcrever áudio via OpenRouter: ${detail}`;
        if (res.status === 429 || res.status >= 500) throw new RetryableError(message);
        throw new Error(message);
      }

      const data = (await res.json()) as { text?: string };
      return data.text ?? "";
    },
    { label: "transcribeAudioFromUrl (OpenRouter audio/transcriptions)" }
  );
}
