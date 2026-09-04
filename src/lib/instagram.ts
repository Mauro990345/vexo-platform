import crypto from "crypto";
import { decryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Integração com Instagram Messaging via Graph API (Meta).
// Autenticação sempre por OAuth oficial — nunca senha. Ver /api/oauth/instagram/*.

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function sendInstagramMessage(params: {
  pageAccessTokenEnc: string;
  igUserId: string;
  recipientIgScopedId: string;
  text?: string;
  mediaUrl?: string;
}): Promise<{ messageId: string }> {
  const accessToken = decryptToken(params.pageAccessTokenEnc);

  const message = params.mediaUrl
    ? { attachment: { type: "video", payload: { url: params.mediaUrl, is_reusable: true } } }
    : { text: params.text ?? "" };

  const res = await fetch(`${GRAPH_BASE}/${params.igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: params.recipientIgScopedId },
      message,
      access_token: accessToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao enviar mensagem no Instagram (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { message_id: string };
  return { messageId: data.message_id };
}

// -----------------------------------------------------------------------
// OAuth (Login do Facebook para Empresas -> conta profissional do Instagram)
// -----------------------------------------------------------------------

export function buildInstagramOAuthUrl(state: string): string {
  const clientId = process.env.META_APP_ID;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("META_APP_ID / META_OAUTH_REDIRECT_URI não configurados.");
  }

  const scopes = [
    "instagram_basic",
    "instagram_manage_messages",
    "pages_show_list",
    "pages_manage_metadata",
    "business_management",
  ].join(",");

  const url = new URL(`https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeInstagramCode(code: string): Promise<{
  pageAccessToken: string;
  facebookPageId: string;
  igUserId: string;
  igUsername?: string;
}> {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Credenciais do app Meta não configuradas.");
  }

  // 1. Troca o code por um user access token de curta duração
  const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", clientId);
  tokenUrl.searchParams.set("client_secret", clientSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString());
  if (!tokenRes.ok) throw new Error(`Falha ao trocar code por token: ${await tokenRes.text()}`);
  const { access_token: userAccessToken } = (await tokenRes.json()) as { access_token: string };

  // 2. Long-lived user token
  const llUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  llUrl.searchParams.set("grant_type", "fb_exchange_token");
  llUrl.searchParams.set("client_id", clientId);
  llUrl.searchParams.set("client_secret", clientSecret);
  llUrl.searchParams.set("fb_exchange_token", userAccessToken);
  const llRes = await fetch(llUrl.toString());
  const { access_token: longLivedUserToken } = (await llRes.json()) as { access_token: string };

  // 3. Lista as páginas do usuário para achar a página vinculada ao Instagram profissional
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?access_token=${encodeURIComponent(longLivedUserToken)}`
  );
  const pagesData = (await pagesRes.json()) as {
    data: { id: string; access_token: string; name: string }[];
  };
  const page = pagesData.data[0];
  if (!page) throw new Error("Nenhuma Página do Facebook encontrada para esta conta.");

  // 4. Descobre a conta profissional do Instagram vinculada à página
  const igRes = await fetch(
    `${GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(
      page.access_token
    )}`
  );
  const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };
  if (!igData.instagram_business_account) {
    throw new Error(
      "A Página do Facebook não tem uma conta profissional do Instagram vinculada."
    );
  }

  const igUserId = igData.instagram_business_account.id;

  const igUsernameRes = await fetch(
    `${GRAPH_BASE}/${igUserId}?fields=username&access_token=${encodeURIComponent(page.access_token)}`
  );
  const igUsernameData = (await igUsernameRes.json()) as { username?: string };

  return {
    pageAccessToken: page.access_token,
    facebookPageId: page.id,
    igUserId,
    igUsername: igUsernameData.username,
  };
}

// Remove a conexão local — o token da Página não expira sozinho e a Graph
// API não tem um endpoint de revogação equivalente ao refreshToken do
// Google pra esse tipo de token, então "desconectar" aqui é parar o VEXO
// de usar/guardar o acesso; revogar de vez, se necessário, é feito pelo
// próprio Meta Business Suite do lado do cliente.
export async function disconnectInstagram(clinicId: string): Promise<void> {
  await prisma.instagramAccount.deleteMany({ where: { clinicId } });
}
