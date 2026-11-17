import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getInstagramAccountProfilePicture } from "@/lib/instagram";

// Backfill/REFRESH periódico da foto de perfil da PRÓPRIA conta conectada
// (InstagramAccount.profilePictureUrl — círculo da clínica, ver
// ClinicAvatar.tsx) — MESMO padrão exato de refreshLeadProfilePictures
// (lead-profile-picture-backfill.ts): janela de tempo, não um booleano
// "tentado uma vez", porque a URL que a Graph API devolve é assinada/
// temporária.
export const CLINIC_PROFILE_PICTURE_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

const BATCH_SIZE = 20;

export async function refreshClinicProfilePictures(): Promise<{ updated: number; attempted: number }> {
  const cutoff = new Date(Date.now() - CLINIC_PROFILE_PICTURE_REFRESH_WINDOW_MS);

  const accounts = await prisma.instagramAccount.findMany({
    where: {
      OR: [{ profilePictureFetchedAt: null }, { profilePictureFetchedAt: { lt: cutoff } }],
      // Token já sabidamente vencido/inválido (ver needsReconnectAt,
      // markInstagramNeedsReconnectByIgUserId) nunca vai conseguir buscar
      // nada — só reconectar via OAuth resolve, e essa reconexão já grava
      // a foto na hora (ver callback/route.ts), sem precisar deste job.
      // Pular evita gastar uma chamada (e um retry) condenada a falhar a
      // cada ciclo até a clínica reconectar.
      needsReconnectAt: null,
    },
    select: { clinicId: true, accessTokenEnc: true },
    take: BATCH_SIZE,
    orderBy: [{ profilePictureFetchedAt: { sort: "asc", nulls: "first" } }],
  });

  let updated = 0;
  let attempted = 0;

  for (const account of accounts) {
    attempted++;
    try {
      const profilePictureUrl = await getInstagramAccountProfilePicture(decryptToken(account.accessTokenEnc));
      await prisma.instagramAccount.update({
        where: { clinicId: account.clinicId },
        data: { profilePictureUrl, profilePictureFetchedAt: new Date() },
      });
      if (profilePictureUrl) {
        updated++;
        console.log(`[vexo:clinic-profile-picture-backfill] clinicId=${account.clinicId} -> foto atualizada`);
      } else {
        console.log(`[vexo:clinic-profile-picture-backfill] clinicId=${account.clinicId} -> sem foto na resposta`);
      }
    } catch (err) {
      // NÃO marca profilePictureFetchedAt aqui — erro de rede/token pode
      // ser transitório, tenta de novo no próximo ciclo do worker (10min).
      console.error(`[vexo:clinic-profile-picture-backfill] Falha ao buscar foto de perfil da clinicId=${account.clinicId}:`, err);
    }
  }

  return { updated, attempted };
}
