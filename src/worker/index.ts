import cron from "node-cron";
import { dispatchDueMessages } from "@/lib/dispatch";
import { processReminders } from "@/lib/reminders";
import { processFollowUps } from "@/lib/follow-up";
import { sendWeeklySummaries } from "@/lib/weekly-summary";
import { syncAllGoogleCalendars } from "@/lib/google-calendar-sync";
import { backfillLeadInstagramUsernames } from "@/lib/lead-username-backfill";
import { refreshLeadProfilePictures } from "@/lib/lead-profile-picture-backfill";

// Worker de background do VEXO — processo separado (serviço próprio no
// Railway) que compartilha o mesmo banco Postgres da aplicação web.
// Responsável por: despachar mensagens agendadas (timing adaptativo),
// lembretes de agendamento, detecção de follow-up, resumo semanal e
// sincronização de leitura do Google Calendar.

const TIMEZONE = "America/Sao_Paulo";

function runSafely(name: string, fn: () => Promise<unknown>) {
  fn()
    .then((result) => {
      if (result && typeof result === "object") {
        console.log(`[vexo:worker] ${name} ->`, JSON.stringify(result));
      }
    })
    .catch((err) => {
      console.error(`[vexo:worker] Erro em ${name}:`, err);
    });
}

// Fingerprint de deploy no boot — mesmos campos do diagnóstico já usado em
// /crm/dispatch-status (RAILWAY_GIT_COMMIT_SHA etc.), mas aqui pro serviço
// WORKER especificamente. Faltava: depois de duas correções seguidas
// (PR #56, #57) pro lookup de foto de perfil continuarem dando o MESMO
// erro, com o código das duas chamadas (username, que funciona, e foto de
// perfil, que falha) comprovadamente idêntico byte a byte na URL montada —
// a hipótese mais forte que sobra é o worker ainda estar rodando um
// container com um deploy anterior a essas correções (web e worker são
// serviços SEPARADOS no Railway, cada um com seu próprio ciclo de deploy;
// já vimos esse exato tipo de confusão antes, ver histórico do próprio
// /crm/dispatch-status). Sem esse log, não tinha como confirmar isso a
// partir daqui — só "reiniciado às X" no dashboard, sem dizer QUAL commit.
console.log(
  `[vexo:worker] iniciado — commit=${process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "?"} ` +
    `service=${process.env.RAILWAY_SERVICE_NAME ?? "?"} ` +
    `environment=${process.env.RAILWAY_ENVIRONMENT_NAME ?? "?"} ` +
    `deploymentId=${process.env.RAILWAY_DEPLOYMENT_ID ?? "?"}`
);

// Despacho de mensagens pendentes — a cada 15s, é o que dá a sensação de
// "timing adaptativo" real (delay curto para a primeira resposta, depois
// espelhando o tempo do lead).
cron.schedule("*/15 * * * * *", () => runSafely("dispatchDueMessages", dispatchDueMessages));

// Lembretes de agendamento — checagem a cada 10 minutos é suficiente dado
// que os gatilhos são em horas (24h/3h por padrão).
cron.schedule("*/10 * * * *", () => runSafely("processReminders", processReminders));

// Follow-up (conversa silenciosa / não comparecimento) — a cada 30 minutos.
cron.schedule("*/30 * * * *", () => runSafely("processFollowUps", processFollowUps));

// Resumo semanal — toda sexta-feira às 09h (horário da clínica).
cron.schedule("0 9 * * 5", () => runSafely("sendWeeklySummaries", sendWeeklySummaries), {
  timezone: TIMEZONE,
});

// Sincronização de leitura do Google Calendar (eventos criados/editados/
// cancelados direto no calendário da clínica, fora do VEXO) — polling com
// syncToken incremental a cada 5 minutos, suficiente pro caso de uso (não
// é tempo real crítico) e bem mais simples que webhook (ver
// src/lib/google-calendar-sync.ts).
cron.schedule("*/5 * * * *", () => runSafely("syncGoogleCalendars", syncAllGoogleCalendars));

// Backfill do @ do Instagram (Lead.igUsername) pra leads que já existiam
// antes desse lookup existir (ver comentário grande em
// lead-username-backfill.ts) — a cada 10 minutos, lote pequeno por ciclo,
// converge sozinho depois de alguns ciclos e vira no-op.
cron.schedule("*/10 * * * *", () => runSafely("backfillLeadInstagramUsernames", backfillLeadInstagramUsernames));

// Foto de perfil do Instagram — REATIVADA, agora via Business Discovery
// (conexão SEPARADA e OPCIONAL, ver comentário grande em instagram.ts e
// em conexoes/page.tsx) em vez da Conversations API do Instagram Login,
// que uma investigação exaustiva anterior confirmou não expor esse dado
// (ver "CONCLUSÃO DEFINITIVA" em
// getInstagramConversationParticipantProfilePicture, instagram.ts — ainda
// lá só de referência histórica, essa função não é mais chamada). Mesma
// cadência de sempre, refresh contínuo por janela de tempo (não converge —
// ver comentário grande em lead-profile-picture-backfill.ts). Clínica que
// não conectar a Business Discovery simplesmente não gera custo nenhum
// (skip rápido, ver refreshLeadProfilePictures).
cron.schedule("*/10 * * * *", () => runSafely("refreshLeadProfilePictures", refreshLeadProfilePictures));

// Roda uma primeira vez imediatamente ao subir, para não esperar o primeiro tick.
runSafely("dispatchDueMessages", dispatchDueMessages);
