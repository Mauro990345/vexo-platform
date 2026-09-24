import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getInstagramConversationParticipantProfilePicture } from "@/lib/instagram";

// Backfill/REFRESH periódico da foto de perfil do Instagram
// (Lead.profilePictureUrl) — cobre dois casos: leads que já existiam antes
// de getInstagramConversationParticipantProfilePicture existir (mesmo
// motivo de lead-username-backfill.ts), E leads cuja URL salva pode ter
// expirado (ver comentário grande em Lead.profilePictureFetchedAt,
// schema.prisma — URLs de foto de perfil de APIs da Meta costumam ser
// assinadas/temporárias, ao contrário do @, que é estável).
//
// Por isso este job NÃO usa um booleano "tentado uma vez" como
// lead-username-backfill.ts — usa uma JANELA de tempo: qualquer lead cuja
// última busca (ou nunca buscou) passou de PROFILE_PICTURE_REFRESH_WINDOW_MS
// entra no próximo lote, mesmo que já tenha uma URL salva. Isso faz o job
// nunca "terminar" de verdade (ao contrário do backfill de username, que
// converge e vira no-op) — é intencional, é o mecanismo de autocura contra
// URL expirada, não um bug de terminação.
export const PROFILE_PICTURE_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

const BATCH_SIZE = 20;

export async function refreshLeadProfilePictures(): Promise<{ updated: number; attempted: number }> {
  const cutoff = new Date(Date.now() - PROFILE_PICTURE_REFRESH_WINDOW_MS);

  const leads = await prisma.lead.findMany({
    where: { OR: [{ profilePictureFetchedAt: null }, { profilePictureFetchedAt: { lt: cutoff } }] },
    include: { clinic: { select: { instagramAccount: { select: { accessTokenEnc: true, igUserId: true } } } } },
    take: BATCH_SIZE,
    // Nunca buscado primeiro (null primeiro) — prioriza leads sem NENHUMA
    // foto ainda sobre um simples refresh de quem já tem uma válida.
    orderBy: [{ profilePictureFetchedAt: { sort: "asc", nulls: "first" } }],
  });

  let updated = 0;
  let attempted = 0;

  for (const lead of leads) {
    const igAccount = lead.clinic.instagramAccount;
    // Sem Instagram conectado — sem token pra chamar a API. Marca
    // fetchedAt=now mesmo assim (não como null pra sempre): reentra na
    // janela de refresh normalmente depois de 24h, em vez de virar um
    // caso especial "nunca tentado" que este código já não distingue de
    // "tentado e falhou por falta de conexão".
    if (!igAccount) {
      await prisma.lead.update({ where: { id: lead.id }, data: { profilePictureFetchedAt: new Date() } });
      continue;
    }

    attempted++;
    try {
      const { profilePictureUrl } = await getInstagramConversationParticipantProfilePicture(
        decryptToken(igAccount.accessTokenEnc),
        igAccount.igUserId,
        lead.igScopedId
      );
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
      // NÃO marca profilePictureFetchedAt aqui — erro pode ser transitório,
      // tenta de novo no próximo ciclo do worker (10min), não só daqui a
      // 24h.
      console.error(`[vexo:profile-picture-backfill] Falha ao buscar foto de perfil do lead=${lead.id}:`, err);
    }
  }

  return { updated, attempted };
}
