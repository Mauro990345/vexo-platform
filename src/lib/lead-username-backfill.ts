import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getInstagramConversationParticipantUsername } from "@/lib/instagram";

// Backfill retroativo do @ do Instagram (Lead.igUsername) pra leads que já
// existiam ANTES de getInstagramConversationParticipantUsername existir
// (ver comentário grande em instagram.ts) — sem isso, um lead que não manda
// mensagem nova nunca passaria pelo lookup adicionado em
// handleInboundInstagramMessage (conversation-pipeline.ts), e ficaria sem
// @ pra sempre mesmo depois do deploy desta correção.
//
// Lote pequeno por ciclo (não um "roda tudo de uma vez") — respeita rate
// limit da Graph API e evita um pico de chamadas externas num boot/deploy
// com muitos leads represados; usernameLookupAttempted garante que cada
// lead só é tentado uma vez (sucesso, "sem username" ou erro definitivo —
// mesmo racional de nameLookupAttempted), então o backfill inteiro
// converge em poucos ciclos e depois vira, na prática, um no-op.
const BATCH_SIZE = 20;

export async function backfillLeadInstagramUsernames(): Promise<{ updated: number; attempted: number }> {
  const leads = await prisma.lead.findMany({
    where: { igUsername: null, usernameLookupAttempted: false },
    include: { clinic: { select: { instagramAccount: { select: { accessTokenEnc: true, igUserId: true } } } } },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  let attempted = 0;

  for (const lead of leads) {
    const igAccount = lead.clinic.instagramAccount;
    // Clínica sem Instagram conectado (ou desconectado desde a criação do
    // lead) — não tem token pra chamar a API. Marca como tentado mesmo
    // assim: sem isso, esse lead entraria no lote de TODO ciclo pra sempre,
    // sem nenhuma chance real de progresso (não é um erro transitório, é
    // ausência permanente de pré-requisito).
    if (!igAccount) {
      await prisma.lead.update({ where: { id: lead.id }, data: { usernameLookupAttempted: true } });
      continue;
    }

    attempted++;
    try {
      const { username } = await getInstagramConversationParticipantUsername(
        decryptToken(igAccount.accessTokenEnc),
        igAccount.igUserId,
        lead.igScopedId
      );
      if (username) {
        await prisma.lead.update({ where: { id: lead.id }, data: { igUsername: username, usernameLookupAttempted: true } });
        updated++;
        console.log(`[vexo:username-backfill] lead=${lead.id} igScopedId=${lead.igScopedId} -> @${username}`);
      } else {
        await prisma.lead.update({ where: { id: lead.id }, data: { usernameLookupAttempted: true } });
        console.log(`[vexo:username-backfill] lead=${lead.id} igScopedId=${lead.igScopedId} -> sem username na resposta`);
      }
    } catch (err) {
      // NÃO marca usernameLookupAttempted aqui — mesmo racional do lookup
      // em conversation-pipeline.ts: erro pode ser transitório, tenta de
      // novo no próximo ciclo do worker.
      console.error(`[vexo:username-backfill] Falha ao buscar username do lead=${lead.id}:`, err);
    }
  }

  return { updated, attempted };
}
