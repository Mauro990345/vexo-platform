import { google } from "googleapis";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Integração com Google Calendar via OAuth oficial, por clínica.
// Nunca armazenamos senha — apenas access/refresh token, criptografados.

function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Credenciais OAuth do Google não configuradas.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildGoogleOAuthUrl(state: string): string {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // garante refresh_token mesmo em reconexões
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

export async function exchangeGoogleCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Google não retornou refresh_token. Revogue o acesso anterior e reconecte com prompt=consent."
    );
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    email: data.email ?? "",
  };
}

// Revoga o acesso OAuth ativo e remove a conexão local — usado tanto pra
// resetar contas de teste (Plano Piloto 21D) quanto pra quando a clínica
// desiste no meio do teste. Revogar do lado do Google é best-effort: se
// falhar (token já revogado, rede fora), ainda assim removemos localmente
// pra não deixar o card preso em "Conectado" sem o acesso real funcionar.
export async function disconnectGoogleCalendar(clinicId: string): Promise<void> {
  const account = await prisma.googleCalendarAccount.findUnique({ where: { clinicId } });
  if (!account) return;

  try {
    const client = oauthClient();
    await client.revokeToken(decryptToken(account.refreshTokenEnc));
  } catch (err) {
    console.error("[vexo] Falha ao revogar token do Google Calendar:", err);
  }

  await prisma.googleCalendarAccount.delete({ where: { clinicId } });
}

// Exportado pra src/lib/google-calendar-sync.ts reaproveitar o mesmo
// client autenticado (com renovação automática de access token) em vez de
// duplicar essa lógica.
export async function clientForClinic(clinicId: string) {
  const account = await prisma.googleCalendarAccount.findUnique({ where: { clinicId } });
  if (!account) throw new Error("Clínica sem Google Calendar conectado.");

  const client = oauthClient();
  client.setCredentials({
    access_token: decryptToken(account.accessTokenEnc),
    refresh_token: decryptToken(account.refreshTokenEnc),
    expiry_date: account.tokenExpiresAt?.getTime(),
  });

  client.on("tokens", async (tokens) => {
    // A lib renova automaticamente o access token quando expira; persistimos
    // o novo valor para reaproveitar em execuções futuras.
    if (tokens.access_token) {
      await prisma.googleCalendarAccount.update({
        where: { clinicId },
        data: {
          accessTokenEnc: encryptToken(tokens.access_token),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      });
    }
  });

  return { client, calendarId: account.calendarId };
}

export async function checkAvailability(
  clinicId: string,
  dateFrom: string,
  dateTo: string
): Promise<string[]> {
  const { client, calendarId } = await clientForClinic(clinicId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: dateFrom,
      timeMax: dateTo,
      items: [{ id: calendarId }],
    },
  });

  const busy = data.calendars?.[calendarId]?.busy ?? [];

  // Gera slots de 1h dentro da janela de trabalho (09h-18h) que não colidem
  // com os períodos ocupados. Janela de trabalho ajustável futuramente por clínica.
  const slots: string[] = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);

  for (
    let cursor = new Date(start);
    cursor < end;
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000)
  ) {
    const hour = cursor.getUTCHours();
    if (hour < 12 || hour > 21) continue; // aprox. 09h-18h America/Sao_Paulo (UTC-3)

    const slotEnd = new Date(cursor.getTime() + 60 * 60 * 1000);
    const overlaps = busy.some((b) => {
      if (!b.start || !b.end) return false;
      return cursor < new Date(b.end) && slotEnd > new Date(b.start);
    });
    if (!overlaps) slots.push(cursor.toISOString());
  }

  return slots.slice(0, 10);
}

export async function createCalendarEvent(
  clinicId: string,
  startTimeIso: string,
  summary: string
): Promise<string> {
  const { client, calendarId } = await clientForClinic(clinicId);
  const calendar = google.calendar({ version: "v3", auth: client });

  const start = new Date(startTimeIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  if (!data.id) throw new Error("Google Calendar não retornou ID do evento criado.");
  return data.id;
}
