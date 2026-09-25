import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getInstagramProfilePicture } from "@/lib/instagram";

// Backfill/REFRESH periódico da foto de perfil do Instagram
// (Lead.profilePictureUrl), via getInstagramProfilePicture — lookup direto
// por IGSID, no MESMO produto/token já conectado (Instagram Login), campo
// "profile_pic" (ver comentário grande em instagram.ts, CONFIRMADO por
// teste real). Substituiu o Business Discovery API (produto separado, só
// funcionava se o lead tivesse conta Business/Creator E já tivesse @
// descoberto) — este aqui não tem nenhum dos dois pré-requisitos, só
// precisa de um igScopedId real (isRealIgScopedId, checado dentro de
// getInstagramProfilePicture).
//
// Diferente de lead-username-backfill.ts (que converge e vira no-op), este
// job NÃO usa um booleano "tentado uma vez" — usa uma JANELA de tempo: URL
// de foto de perfil de APIs da Meta costuma ser assinada/temporária (ver
// Lead.profilePictureFetchedAt, schema.prisma), então precisa poder ser
// buscada de novo, não só na primeira vez.
export const PROFILE_PICTURE_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

const BATCH_SIZE = 20;

export async function refreshLeadProfilePictures(): Promise<{ updated: number; attempted: number; skipped: number }> {
  const cutoff = new Date(Date.now() - PROFILE_PICTURE_REFRESH_WINDOW_MS);

  const leads = await prisma.lead.findMany({
    where: { OR: [{ profilePictureFetchedAt: null }, { profilePictureFetchedAt: { lt: cutoff } }] },
    include: {
      clinic: { select: { instagramAccount: { select: { accessTokenEnc: true } } } },
    },
    take: BATCH_SIZE,
    // Nunca buscado primeiro (null primeiro) — prioriza leads sem NENHUMA
    // foto ainda sobre um simples refresh de quem já tem uma válida.
    orderBy: [{ profilePictureFetchedAt: { sort: "asc", nulls: "first" } }],
  });

  let updated = 0;
  let attempted = 0;
  let skipped = 0;

  for (const lead of leads) {
    const igAccount = lead.clinic.instagramAccount;

    // Clínica sem Instagram conectado (ou desconectado desde a criação do
    // lead) — não tem token pra chamar a API. Marca fetchedAt=now mesmo
    // assim (não fica pra sempre no lote): se a clínica conectar depois,
    // reentra na janela de refresh normalmente em até 24h.
    if (!igAccount) {
      await prisma.lead.update({ where: { id: lead.id }, data: { profilePictureFetchedAt: new Date() } });
      skipped++;
      continue;
    }

    attempted++;
    try {
      const { profilePictureUrl } = await getInstagramProfilePicture(decryptToken(igAccount.accessTokenEnc), lead.igScopedId);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { profilePictureUrl: profilePictureUrl ?? null, profilePictureFetchedAt: new Date() },
      });
      if (profilePictureUrl) {
        updated++;
        console.log(`[vexo:profile-picture-backfill] lead=${lead.id} igScopedId=${lead.igScopedId} -> foto atualizada`);
      } else {
        console.log(`[vexo:profile-picture-backfill] lead=${lead.id} igScopedId=${lead.igScopedId} -> sem foto na resposta`);
      }
    } catch (err) {
      // NÃO marca profilePictureFetchedAt aqui — erro de rede/token pode
      // ser transitório, tenta de novo no próximo ciclo do worker (10min).
      console.error(`[vexo:profile-picture-backfill] Falha ao buscar foto de perfil do lead=${lead.id}:`, err);
    }
  }

  return { updated, attempted, skipped };
}
