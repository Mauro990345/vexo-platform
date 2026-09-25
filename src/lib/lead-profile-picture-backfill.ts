import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getBusinessDiscoveryProfilePicture } from "@/lib/instagram";

// Backfill/REFRESH periódico da foto de perfil do Instagram
// (Lead.profilePictureUrl), via Business Discovery API — ver o comentário
// grande "Business Discovery" em instagram.ts pro porquê desse endpoint
// específico (única avenida que a Meta expõe pra esse dado; a Conversations
// API do Instagram Login, tentada antes, comprovadamente não expõe).
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
      clinic: {
        select: {
          instagramAccount: {
            select: { igUserId: true, businessDiscoveryAccessTokenEnc: true },
          },
        },
      },
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

    // Sem Business Discovery conectada nesta clínica (conexão OPCIONAL —
    // ver conexoes/page.tsx) — não tem token de Página pra chamar a API.
    // Marca fetchedAt=now mesmo assim (não fica pra sempre no lote): se a
    // clínica conectar depois, reentra na janela de refresh normalmente em
    // até 24h, sem precisar de tratamento especial.
    if (!igAccount?.businessDiscoveryAccessTokenEnc) {
      await prisma.lead.update({ where: { id: lead.id }, data: { profilePictureFetchedAt: new Date() } });
      skipped++;
      continue;
    }

    // Business Discovery busca por @ (username), não por igScopedId — sem
    // username ainda salvo (ver lead-username-backfill.ts, roda
    // separado), não tem o que buscar. NÃO marca fetchedAt aqui — de
    // propósito, pra tentar nesse MESMO lead de novo assim que o username
    // chegar, em vez de esperar até 24h por causa de uma ordem de
    // execução que nada tem a ver com foto.
    if (!lead.igUsername) {
      skipped++;
      continue;
    }

    attempted++;
    try {
      const { profilePictureUrl } = await getBusinessDiscoveryProfilePicture(
        decryptToken(igAccount.businessDiscoveryAccessTokenEnc),
        igAccount.igUserId,
        lead.igUsername
      );
      await prisma.lead.update({
        where: { id: lead.id },
        data: { profilePictureUrl: profilePictureUrl ?? null, profilePictureFetchedAt: new Date() },
      });
      if (profilePictureUrl) {
        updated++;
        console.log(`[vexo:profile-picture-backfill] lead=${lead.id} igUsername=${lead.igUsername} -> foto atualizada`);
      } else {
        console.log(`[vexo:profile-picture-backfill] lead=${lead.id} igUsername=${lead.igUsername} -> sem foto (provável conta pessoal, não Business/Creator)`);
      }
    } catch (err) {
      // NÃO marca profilePictureFetchedAt aqui — erro de rede/token pode
      // ser transitório, tenta de novo no próximo ciclo do worker (10min).
      // "Conta não é Business/Creator" NÃO cai aqui — getBusinessDiscoveryProfilePicture
      // trata isso como resultado normal (sem foto), não como exceção.
      console.error(`[vexo:profile-picture-backfill] Falha ao buscar foto de perfil do lead=${lead.id}:`, err);
    }
  }

  return { updated, attempted, skipped };
}
