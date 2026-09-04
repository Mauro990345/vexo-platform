import cron from "node-cron";
import { dispatchDueMessages } from "@/lib/dispatch";
import { processReminders } from "@/lib/reminders";
import { processFollowUps } from "@/lib/follow-up";
import { sendWeeklySummaries } from "@/lib/weekly-summary";
import { syncAllGoogleCalendars } from "@/lib/google-calendar-sync";

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

console.log("[vexo:worker] iniciado.");

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

// Roda uma primeira vez imediatamente ao subir, para não esperar o primeiro tick.
runSafely("dispatchDueMessages", dispatchDueMessages);
