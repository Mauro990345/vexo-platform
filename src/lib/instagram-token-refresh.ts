import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/crypto";
import {
  refreshInstagramLongLivedToken,
  debugInstagramToken,
  markInstagramNeedsReconnectByIgUserId,
} from "@/lib/instagram";

// Renovação diária do token de longa duração do Instagram — problema real
// em produção (Clínica Demo, 11/11/2026): o token venceu sozinho (nenhum
// refresh_access_token era chamado em lugar nenhum do código) e a IA parou
// de conseguir responder, sem nenhum aviso visível além de uma falha
// escondida em "Falharam ao enviar". Token de longa duração deste produto
// dura 60 dias e PODE ser renovado indefinidamente via ig_refresh_token,
// desde que ainda esteja válido — se vencer de verdade, só reconectar via
// OAuth resolve (ver markInstagramNeedsReconnectByIgUserId, instagram.ts).
//
// Renova dentro desta janela antes do vencimento — folga generosa (15 dias
// de 60) pra sobreviver a um dia de ciclo falho (worker fora do ar, rede)
// sem chegar a vencer de verdade.
export const INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS = 15;

export type InstagramTokenRefreshAction = "refresh" | "already_expired" | "backfill_expiry" | "skip";

// Peça pura da decisão — qual ação tomar pra uma conta, dado o que já se
// sabe sobre o vencimento do token dela. Nunca chama rede nem banco, só
// compara datas — testável isoladamente.
//
//   null (nunca gravado — toda conta de Instagram antes desta correção)
//     -> "backfill_expiry": não dá pra saber se está perto de vencer sem
//        descobrir o vencimento real primeiro (debug_token, leitura sem
//        side effect — ver debugInstagramToken, instagram.ts). Depois de
//        descoberto uma vez, as próximas rodadas já caem num dos outros 3
//        casos normalmente.
//   já vencido (tokenExpiresAt no passado)
//     -> "already_expired": ig_refresh_token não recupera um token morto
//        (regra documentada da Meta) — tentar chamar a API seria uma
//        chamada fadada a falhar à toa; marca precisa-reconectar direto.
//   dentro da janela de troca (<= INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS,
//   mas ainda válido)
//     -> "refresh": tenta renovar de verdade.
//   fora da janela (mais de 15 dias pra vencer)
//     -> "skip": nada a fazer ainda, não gasta chamada à Meta à toa.
export function decideInstagramTokenRefreshAction(tokenExpiresAt: Date | null, now: Date): InstagramTokenRefreshAction {
  if (!tokenExpiresAt) return "backfill_expiry";
  if (tokenExpiresAt.getTime() <= now.getTime()) return "already_expired";
  const msRemaining = tokenExpiresAt.getTime() - now.getTime();
  if (msRemaining <= INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000) return "refresh";
  return "skip";
}

export async function refreshAllInstagramTokens(): Promise<{
  refreshed: number;
  markedNeedsReconnect: number;
  backfilled: number;
  skipped: number;
}> {
  const now = new Date();
  const accounts = await prisma.instagramAccount.findMany({
    select: { id: true, clinicId: true, igUserId: true, accessTokenEnc: true, tokenExpiresAt: true },
  });

  let refreshed = 0;
  let markedNeedsReconnect = 0;
  let backfilled = 0;
  let skipped = 0;

  for (const account of accounts) {
    const action = decideInstagramTokenRefreshAction(account.tokenExpiresAt, now);

    try {
      if (action === "skip") {
        skipped++;
        continue;
      }

      if (action === "already_expired") {
        await markInstagramNeedsReconnectByIgUserId(
          account.igUserId,
          `Token já vencido em ${account.tokenExpiresAt?.toISOString()} — ig_refresh_token não recupera um token vencido, só reconectar de novo.`
        );
        markedNeedsReconnect++;
        console.warn(`[vexo:instagram-token-refresh] clinicId=${account.clinicId} — token já vencido, marcado precisa-reconectar.`);
        continue;
      }

      if (action === "backfill_expiry") {
        const accessToken = decryptToken(account.accessTokenEnc);
        const debugResult = await debugInstagramToken(accessToken);
        if (!debugResult) {
          // Falha não-fatal (env vars ausentes, rede, resposta inesperada
          // — ver debugInstagramToken) — tenta de novo no próximo ciclo
          // diário, sem marcar nada.
          skipped++;
          console.warn(`[vexo:instagram-token-refresh] clinicId=${account.clinicId} — não deu pra descobrir o vencimento do token agora (tenta de novo no próximo ciclo).`);
          continue;
        }
        if (!debugResult.isValid) {
          await markInstagramNeedsReconnectByIgUserId(
            account.igUserId,
            "debug_token confirmou que o token não é mais válido (is_valid=false) — token sem tokenExpiresAt salvo, provavelmente de antes desta correção."
          );
          markedNeedsReconnect++;
          console.warn(`[vexo:instagram-token-refresh] clinicId=${account.clinicId} — debug_token confirmou token inválido, marcado precisa-reconectar.`);
          continue;
        }
        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: { tokenExpiresAt: debugResult.expiresAt },
        });
        backfilled++;
        console.log(
          `[vexo:instagram-token-refresh] clinicId=${account.clinicId} — tokenExpiresAt preenchido pela primeira vez via debug_token: ${debugResult.expiresAt?.toISOString() ?? "null (token sem expiração segundo a Meta)"}.`
        );
        continue;
      }

      // action === "refresh"
      const accessToken = decryptToken(account.accessTokenEnc);
      const result = await refreshInstagramLongLivedToken(accessToken);
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEnc: encryptToken(result.accessToken),
          tokenExpiresAt: result.tokenExpiresAt,
          // Uma renovação que funciona de verdade É prova de que a conexão
          // está saudável — diferente do Google Calendar (onde só reconectar
          // via OAuth limpa needsReconnectAt, porque lá um refresh nunca
          // recupera um refresh token revogado). Aqui, limpa sozinho.
          needsReconnectAt: null,
          needsReconnectReason: null,
        },
      });
      refreshed++;
      console.log(`[vexo:instagram-token-refresh] clinicId=${account.clinicId} — token renovado, novo vencimento: ${result.tokenExpiresAt.toISOString()}.`);
    } catch (err) {
      // SE A RENOVAÇÃO FALHAR (pedido explícito) — marca precisa-reconectar,
      // mas nunca deixa uma conta travar o ciclo das outras.
      const reason = err instanceof Error ? err.message : String(err);
      await markInstagramNeedsReconnectByIgUserId(account.igUserId, `Falha ao renovar token: ${reason}`);
      markedNeedsReconnect++;
      console.error(`[vexo:instagram-token-refresh] clinicId=${account.clinicId} — falha ao renovar token, marcado precisa-reconectar:`, err);
    }
  }

  return { refreshed, markedNeedsReconnect, backfilled, skipped };
}
