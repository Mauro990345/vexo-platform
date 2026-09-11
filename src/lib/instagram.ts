import crypto from "crypto";
import { decryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Integração com Instagram Messaging via "Instagram API with Instagram
// Login" (produto do App configurado no Meta for Developers) — NÃO é o
// fluxo antigo de "Login do Facebook para Empresas". Isso importa de
// verdade pra todo esse arquivo: autorização acontece em instagram.com (não
// facebook.com), a troca de token acontece contra api.instagram.com /
// graph.instagram.com (não graph.facebook.com), e o token obtido representa
// diretamente a conta profissional do Instagram — não existe mais "Página
// do Facebook" no meio do caminho (o app não pede pages_show_list nem
// nenhum escopo de Facebook Login; ver buildInstagramOAuthUrl). Trocar só
// os nomes dos scopes sem mudar esses hosts não resolve — cada produto tem
// seu próprio namespace de scopes, e os scopes de Instagram Login
// (instagram_business_*) não são reconhecidos pelo dialog do Facebook.
//
// Autenticação sempre por OAuth oficial — nunca senha. Ver /api/oauth/instagram/*.
//
// client_id usa META_INSTAGRAM_APP_ID, NÃO META_APP_ID (esse aqui não é
// mais lido em lugar nenhum do código) — o produto "Instagram API with
// Instagram Login" tem um "Instagram app ID" PRÓPRIO, diferente do App ID
// geral mostrado na tela principal do app no Meta for Developers. Usar o
// App ID geral aqui dá erro "Invalid platform app" na tela de autorização
// do Instagram. client_secret continua sendo o App Secret geral
// (META_APP_SECRET) — só o ID tem essa duplicidade, não o secret.

const GRAPH_API_VERSION = "v21.0";
// Base pra chamadas autenticadas com o token de Instagram Login (envio de
// mensagem, leitura de perfil) — graph.instagram.com, não graph.facebook.com:
// um token obtido via Instagram Login não é aceito pelo host do Facebook.
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

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
  accessTokenEnc: string;
  igUserId: string;
  recipientIgScopedId: string;
  text?: string;
  mediaUrl?: string;
}): Promise<{ messageId: string }> {
  const accessToken = decryptToken(params.accessTokenEnc);

  const message = params.mediaUrl
    ? { attachment: { type: "video", payload: { url: params.mediaUrl, is_reusable: true } } }
    : { text: params.text ?? "" };

  const res = await fetch(`${IG_GRAPH_BASE}/${params.igUserId}/messages`, {
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
// OAuth (Instagram API with Instagram Login)
// -----------------------------------------------------------------------

export function buildInstagramOAuthUrl(state: string): string {
  const clientId = process.env.META_INSTAGRAM_APP_ID;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("META_INSTAGRAM_APP_ID / META_OAUTH_REDIRECT_URI não configurados.");
  }

  // Esses 3 são os únicos scopes do produto "Instagram API with Instagram
  // Login" habilitados no App — não confundir com os scopes de "Login do
  // Facebook para Empresas" (instagram_basic, pages_show_list,
  // pages_manage_metadata, business_management, instagram_manage_messages),
  // que pertencem a um produto diferente e não são aceitos aqui.
  const scopes = [
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
  ].join(",");

  // Autorização acontece em instagram.com, não facebook.com — ver
  // comentário no topo do arquivo.
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeInstagramCode(code: string): Promise<{
  accessToken: string;
  igUserId: string;
  igUsername?: string;
}> {
  const clientId = process.env.META_INSTAGRAM_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Credenciais do app Meta não configuradas.");
  }

  // 1. Troca o code por um token de curta duração — já vem com o
  // igUserId junto (a conta profissional do Instagram autenticada), sem
  // precisar passar por nenhuma Página do Facebook. Único endpoint OAuth
  // desse fluxo que é POST, não GET com querystring — e precisa ser
  // multipart/form-data (FormData), não application/x-www-form-urlencoded:
  // o exemplo oficial da Meta pra esse endpoint específico usa `curl -F`
  // (multipart), herdado da antiga Instagram Basic Display API que roda no
  // mesmo host (api.instagram.com). Urlencoded aqui é aceito silenciosamente
  // por alguns endpoints OAuth2 genéricos, mas não necessariamente por esse.
  const form = new FormData();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", redirectUri);
  form.set("code", code);

  const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: form,
  });
  const tokenBodyText = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(
      `Falha ao trocar code por token (HTTP ${tokenRes.status}): ${tokenBodyText}`
    );
  }
  // user_id vem como NÚMERO no JSON desse endpoint (não string, apesar do
  // nome sugerir um ID opaco) — confirmado batendo com o erro real do
  // Prisma em produção (upsert falhando ao gravar um Int num campo String).
  // Convertido pra string logo abaixo, no retorno, já que igUserId no banco
  // é String (é tratado como identificador opaco em todo o resto do app,
  // nunca usado em conta aritmética).
  const shortLived = JSON.parse(tokenBodyText) as { access_token: string; user_id: number };

  // 2. Long-lived token (60 dias) — grant_type diferente do Facebook
  // (ig_exchange_token, não fb_exchange_token), e host graph.instagram.com.
  const llUrl = new URL(`${IG_GRAPH_BASE}/access_token`);
  llUrl.searchParams.set("grant_type", "ig_exchange_token");
  llUrl.searchParams.set("client_secret", clientSecret);
  llUrl.searchParams.set("access_token", shortLived.access_token);
  const llRes = await fetch(llUrl.toString());
  if (!llRes.ok) {
    throw new Error(`Falha ao obter token de longa duração (HTTP ${llRes.status}): ${await llRes.text()}`);
  }
  const { access_token: longLivedToken } = (await llRes.json()) as { access_token: string };

  // 3. Username da própria conta — o igUserId já veio no passo 1, não
  // precisa descobrir Página nem conta vinculada.
  const meRes = await fetch(
    `${IG_GRAPH_BASE}/me?fields=username&access_token=${encodeURIComponent(longLivedToken)}`
  );
  const meData = (await meRes.json()) as { username?: string };

  return {
    accessToken: longLivedToken,
    igUserId: String(shortLived.user_id),
    igUsername: meData.username,
  };
}

// Ativar o toggle "Webhook Subscription" no App Dashboard (Produtos >
// Webhooks) só configura o app: URL de callback + quais campos ele PODE
// receber. Isso é global ao app, não à conta. A Meta só começa a mandar
// eventos de mensagem de uma conta profissional do Instagram específica
// depois de UMA CHAMADA EXTRA, por conta, inscrevendo aquele igUserId no
// app — exatamente como o antigo /{page-id}/subscribed_apps do fluxo de
// Facebook Login, só que aqui é no host graph.instagram.com e autenticado
// com o próprio token da conta (não um token de Página). Sem essa chamada,
// a conta conecta normalmente (OAuth completo, token salvo) mas nunca
// entrega webhook nenhum — sintoma idêntico ao relatado (nada chega no
// endpoint, apesar do toggle do app estar ativo).
export async function subscribeInstagramWebhook(igUserId: string, accessToken: string): Promise<void> {
  const url = new URL(`${IG_GRAPH_BASE}/${igUserId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "messages");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    throw new Error(`Falha ao inscrever a conta no webhook (HTTP ${res.status}): ${await res.text()}`);
  }
}

// Remove a conexão local — o token de Instagram Login não expira sozinho e
// a Graph API não tem um endpoint de revogação equivalente ao refreshToken
// do Google pra esse tipo de token, então "desconectar" aqui é parar o VEXO
// de usar/guardar o acesso; revogar de vez, se necessário, é feito pelo
// próprio Meta Business Suite do lado do cliente.
export async function disconnectInstagram(clinicId: string): Promise<void> {
  await prisma.instagramAccount.deleteMany({ where: { clinicId } });
}
