// Retry com backoff exponencial pra chamadas externas (Meta Graph API,
// OpenRouter) — ver diagnóstico de capacidade (avaliação de escala pra
// 100 clínicas): zero tratamento de erro transitório era o risco #1 de
// PERDA de mensagem real (não só atraso). Sem isso, um 429/5xx passageiro
// da Meta ou da OpenRouter falha na hora, e quem chama (ex: dispatch.ts)
// trata isso como definitivo — uma mensagem marcada FAILED por um erro
// que teria passado numa segunda tentativa 500ms depois nunca é
// reenviada automaticamente.
//
// Quem decide se um erro é "retryable" é SEMPRE o chamador (lançando
// RetryableError) — withRetry em si não sabe interpretar o formato de
// erro de cada API (a Graph API costuma sinalizar rate limit com HTTP 400
// + um código específico no corpo, não HTTP 429; a OpenRouter segue o
// padrão REST comum de 429). Falha de REDE (fetch() lançando TypeError —
// timeout de conexão, DNS, ECONNRESET etc., nunca uma resposta HTTP
// não-2xx) é tratada como retryable automaticamente, sem o chamador
// precisar fazer nada — é sempre transitória por natureza, não depende de
// interpretar nenhum corpo de resposta.
export class RetryableError extends Error {}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// fetch() do Node (undici) lança TypeError em falha de rede/timeout de
// conexão — nunca em resposta HTTP não-2xx (checar res.ok é
// responsabilidade de quem chama, não deste helper).
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { label: string; maxAttempts?: number; baseDelayMs?: number }
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof RetryableError || isNetworkError(err);
      const message = err instanceof Error ? err.message : String(err);

      if (!retryable) {
        throw err;
      }
      if (attempt === maxAttempts) {
        console.error(`[vexo:retry] ${options.label} falhou definitivamente após ${attempt} tentativa(s): ${message}`);
        throw err;
      }

      // Backoff exponencial: 500ms, 1000ms, 2000ms... (baseDelayMs * 2^(attempt-1)).
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[vexo:retry] ${options.label} falhou (tentativa ${attempt}/${maxAttempts}, erro transitório) — nova tentativa em ${delayMs}ms: ${message}`
      );
      await sleep(delayMs);
    }
  }

  // Inalcançável em condições normais (o loop acima sempre retorna ou lança
  // antes de chegar aqui) — só existe pra satisfazer o TypeScript, que não
  // sabe inferir isso de um `for` sem retorno explícito no fim.
  throw new Error(`${options.label}: withRetry terminou sem sucesso nem exceção.`);
}
