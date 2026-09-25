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

// "Instagram API with Instagram Login" é produto recente da Meta — edges
// específicos dele (como /subscribed_apps num IG User, sem Página de
// Facebook no meio) podem não existir ainda em versões mais antigas da
// Graph API. O exemplo oficial da Meta pra POST .../subscribed_apps usa
// v24.0; v21.0 (usada aqui antes) retornava "Unsupported post request...
// does not exist" pra esse mesmo IG User ID, exatamente o tipo de erro
// que a Graph API dá quando a versão da API não reconhece aquele
// edge/objeto — não confundir com o objeto realmente não existir.
const GRAPH_API_VERSION = "v24.0";
// Base pra chamadas autenticadas com o token de Instagram Login (envio de
// mensagem, leitura de perfil) — graph.instagram.com, não graph.facebook.com:
// um token obtido via Instagram Login não é aceito pelo host do Facebook.
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

// Extrai um campo de ID (sequência de dígitos) direto do texto CRU de uma
// resposta JSON, sem nunca passar por JSON.parse()/res.json() pra esse
// campo específico — IDs do Instagram passam de Number.MAX_SAFE_INTEGER
// (17 dígitos vs. ~16 seguros), e um `res.json() as { id: string }` só
// engana o TypeScript: se a Meta manda esse campo como número (sem aspas)
// em vez de string, o parser de JSON do próprio JS já converte pra
// float64 na hora do parse, ANTES de qualquer cast — um "as string"
// depois disso não resgata dígito nenhum que já tenha sido arredondado.
// Aceita o valor com ou sem aspas no JSON (`"id":"123"` ou `"id":123`),
// já que não dá pra saber de antemão qual formato a Meta vai usar em cada
// endpoint (endpoints diferentes desse mesmo produto já se mostraram
// inconsistentes nisso).
function extractIdField(rawText: string, fieldName: string): string | null {
  const match = rawText.match(new RegExp(`"${fieldName}"\\s*:\\s*"?(\\d+)"?`));
  return match?.[1] ?? null;
}

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

  // "me", não params.igUserId, no path — ver comentário grande em
  // verifyInstagramTokenAndId/subscribeInstagramWebhook logo abaixo sobre
  // por que endereçar a própria conta pelo ID numérico não funciona nesse
  // produto. Ainda não tinha sido testado de verdade (nenhuma mensagem
  // chegou a esse ponto — o próprio subscribe do webhook nunca funcionou
  // até agora), mas é o mesmo padrão exato, corrigido preventivamente
  // pela mesma razão. params.igUserId continua sendo usado noutro lugar
  // (handleInboundInstagramMessage, pra achar a clínica dona do evento
  // recebido) — só parou de ser usado AQUI, no path da chamada de envio.
  const res = await fetch(`${IG_GRAPH_BASE}/me/messages`, {
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
    // Diagnóstico automático pro erro "The action is invalid since it's
    // not the thread owner" (IGApiException, subcode 2534037). Hipóteses
    // já descartadas em produção, uma a uma, com teste real: ID de
    // sender/recipient corrompido por perda de precisão; igUserId
    // desatualizado (namespace errado); token colado manualmente com
    // escopo insuficiente (falha idêntica com token 100% OAuth); modo
    // desenvolvimento/Tester (duas contas JÁ testers conversando entre si
    // falharam igual); thread pendente de aceitar (falhou até em
    // conversas já na caixa principal); Conversation Routing/Handover
    // Protocol desligado (configurado nas duas contas, sem efeito) — e
    // esse último, aliás, confirmado sem sentido aqui: me/thread_owner
    // (chamado por getThreadOwner, removido deste ponto) devolveu "Tried
    // accessing nonexisting field (thread_owner)", ou seja, esse edge do
    // Messenger Platform nem existe no produto "Instagram API with
    // Instagram Login" — Conversation Routing pode não se aplicar a
    // contas conectadas sem Página do Facebook.
    //
    // Hipótese atual: instagram_business_manage_messages aparece como
    // "Pronto para teste" na aba Permissions and Features do App
    // Dashboard, mas isso só confirma que o App PODE pedir esse escopo —
    // não confirma que ESTE token especificamente o recebeu de fato no
    // consentimento. debug_token é o endpoint universal da Graph API pra
    // inspecionar os escopos reais de um token (usado por qualquer
    // produto Meta, daí graph.facebook.com aqui e não graph.instagram.com
    // — diferente das chamadas operacionais deste arquivo, que precisam
    // do host específico do produto; esta é só leitura de metadado do
    // token). Não confirmado ainda se esse host aceita consultar um token
    // emitido via Instagram Login — se não aceitar, o corpo da resposta
    // abaixo já mostra isso.
    const appId = process.env.META_INSTAGRAM_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const scopeDiagnosis =
      appId && appSecret
        ? await fetch(
            `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
          )
            .then(async (diagRes) => `HTTP ${diagRes.status}: ${await diagRes.text()}`)
            .catch(
              (diagErr) => `falha ao consultar debug_token: ${diagErr instanceof Error ? diagErr.message : String(diagErr)}`
            )
        : "META_INSTAGRAM_APP_ID/META_APP_SECRET não configurados";
    throw new Error(
      `Falha ao enviar mensagem no Instagram (${res.status}) para recipient=${params.recipientIgScopedId} (conta remetente igUserId=${params.igUserId}): ${body}\nDiagnóstico debug_token: ${scopeDiagnosis}`
    );
  }

  const data = (await res.json()) as { message_id: string };
  return { messageId: data.message_id };
}

// User Profile API (instagram-platform/instagram-api-with-instagram-login,
// produto que o VEXO usa — não a família antiga do Messenger Platform):
// busca o nome de exibição de quem mandou mensagem, dado o IGSID
// (Lead.igScopedId), pra popular Lead.name e {{primeiro_nome}} funcionar
// de verdade em vez de ficar vazio. O payload do webhook (sender.id) NUNCA
// traz nome/username — só o ID opaco — então sem essa chamada extra
// Lead.name/igUsername ficam null pra sempre num lead novo, e a IA
// legitimamente não tem nome nenhum pra usar (não é bug de substituição:
// {{primeiro_nome}} substitui certinho por uma string vazia).
//
// Só pede "name", não "username": segundo relatos de outros
// desenvolvedores na comunidade da Meta, "username" nem existe como campo
// desse node (IGBusinessScopedID) — Meta restringe por privacidade o que
// uma conta comercial pode puxar sobre quem manda mensagem pra ela. Mesmo
// "name" não é garantido (depende das configurações de privacidade da
// pessoa) — nesse caso o fallback de perguntar o nome na conversa
// continua sendo o comportamento certo, não um bug.
//
// CONFIRMADO (teste único, rota de diagnóstico temporária removida depois
// de usar — ver histórico do PR): ESTE MESMO node aceita também o campo
// "profile_pic" (nome diferente de "profile_picture_url", o campo já
// testado e descartado na Conversations API — ver CONCLUSÃO em
// getInstagramConversationParticipantProfilePicture, mais abaixo). Chamada
// de teste — GET /{igScopedId}?fields=name,username,profile_pic — contra
// um IGSID real (lead com conversa de verdade) devolveu HTTP 200 com
// "profile_pic" preenchido, uma URL real da CDN do Instagram
// (scontent-*.cdninstagram.com). Achado o caminho oficial que faltava.
//
// PROPOSITALMENTE NÃO implementado ainda — decisão de adiar pra depois do
// App Review (não mexer em mais nada antes da submissão). Se/quando
// formalizar: o candidato natural é trocar getBusinessDiscoveryProfileUrl
// (produto Business Discovery, só funciona se o LEAD tiver conta
// Business/Creator — ver seção "Business Discovery" mais abaixo) por esse
// lookup direto (fields=name,username,profile_pic), que não tem essa
// restrição de tipo de conta do lead — mas isso ainda precisa ser
// confirmado contra um lead com conta PESSOAL (o teste único usou um lead
// já conhecido, sem checar o tipo de conta dele).
export async function getInstagramUserProfile(
  accessToken: string,
  igScopedId: string
): Promise<{ name?: string }> {
  const url = new URL(`${IG_GRAPH_BASE}/${igScopedId}`);
  url.searchParams.set("fields", "name");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Falha ao buscar perfil do lead (HTTP ${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { name?: string };
  return { name: data.name || undefined };
}

// Conversations API — endpoint DIFERENTE do lookup de perfil acima (mesmo
// produto "Instagram API with Instagram Login", outro edge:
// /{ig-user-id}/conversations, documentado em developers.facebook.com/docs/
// instagram-platform/instagram-api-with-instagram-login/conversations-api/).
// Único jeito encontrado de obter o @ real de um lead: o node de perfil por
// IGSID acima só expõe "name" (ver comentário lá — Meta não deixa puxar
// "username" desse jeito, por privacidade), mas o campo "participants" da
// API de conversas é documentado como retornando "username" junto do "id"
// de cada participante — é um edge desenhado pra gerenciar a caixa de
// entrada (onde saber quem é quem faz sentido pro negócio), diferente do
// lookup de perfil solto por ID (que é a superfície restrita).
//
// CONFIRMADO em produção — o @ aparece certinho nos cards do Painel depois
// do deploy desta função (bug report original: "o @ apareceu certinho").
// Fica só como referência a URL da doc oficial e o mecanismo de log
// ([vexo:username-lookup]/[vexo:username-backfill]), já que foi assim que
// deu pra confirmar sem acesso a developers.facebook.com nem token de
// produção neste ambiente de desenvolvimento.
//
// Filtra a conversa do lead específico via ?user_id= (documentado pra achar
// a conversa com uma pessoa específica, sem paginar client-side por todas
// as conversas da conta). Identifica o participante do LEAD comparando
// id !== igUserId (a própria conta da clínica) em vez de comparar contra o
// IGSID que já temos salvo — mais resiliente a qualquer diferença de
// formato entre o "id" retornado aqui e o leadIgScopedId.
//
// isRealIgScopedId (ver abaixo): IGSID de verdade é sempre uma string só de
// dígitos — bug real encontrado: prisma/seed-demo.ts cria 40 leads de
// demonstração pra clínica piloto com igScopedId tipo "demo-new-0",
// "demo-conversa-1" etc. (nunca tiveram conversa real no Instagram), e a
// Meta rejeita esse valor com "(#100) Param user_id must be a numeric
// string" — HTTP 400 — um erro CORRETO dessa vez (diferente do que a
// investigação anterior da sintaxe de expansão {} chegou a suspeitar, que
// era, esse sim, um erro enganoso). Sem essa checagem, uma chamada que
// sempre falha é tratada como erro transitório (a mesma lógica que faz
// sentido pra falha de rede genuína) e NUNCA marca a tentativa como
// definitiva — pulando essa checagem, cada lead de demo ocuparia pra
// sempre um lugar no lote do backfill (ver getInstagramConversationParticipantProfilePicture
// e lead-profile-picture-backfill.ts), bloqueando leads REAIS de sequer
// serem tentados. Aqui pro username isso hoje não trava nada na prática (o
// seed já vem com igUsername preenchido, e o backfill de username filtra
// justamente por igUsername nulo) — mas o guard é o mesmo pelos dois
// lookups, por consistência e resiliência a qualquer lead futuro sem
// igUsername pré-setado e com igScopedId inválido.
export function isRealIgScopedId(igScopedId: string): boolean {
  return /^\d+$/.test(igScopedId);
}

export async function getInstagramConversationParticipantUsername(
  accessToken: string,
  igUserId: string,
  leadIgScopedId: string
): Promise<{ username?: string }> {
  if (!isRealIgScopedId(leadIgScopedId)) {
    console.log(`[vexo:username-lookup] igScopedId=${leadIgScopedId} não é um IGSID numérico real (provável lead de seed/demo) — pulado, sem chamar a API.`);
    return { username: undefined };
  }

  const url = new URL(`${IG_GRAPH_BASE}/${igUserId}/conversations`);
  url.searchParams.set("platform", "instagram");
  url.searchParams.set("user_id", leadIgScopedId);
  url.searchParams.set("fields", "participants");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Falha ao buscar conversa do lead pra achar o username (HTTP ${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    data?: { participants?: { data?: { id: string; username?: string }[] } }[];
  };
  const participants = data.data?.[0]?.participants?.data ?? [];
  const leadParticipant = participants.find((p) => p.id !== igUserId);
  return { username: leadParticipant?.username || undefined };
}

// Mesmo endpoint/edge de getInstagramConversationParticipantUsername acima
// (Conversations API, /{ig-user-id}/conversations), CHAMADA SEPARADA — de
// propósito, não junto na mesma requisição (assim um problema aqui nunca
// arrisca quebrar o lookup de username, que já está confirmado funcionando
// em produção).
//
// Histórico da investigação de "(#100) Param user_id must be a numeric
// string" — 3 rodadas até chegar aqui:
//   1. PR #56: pedia "fields=participants{id,profile_picture_url}"
//      (sintaxe de expansão de subcampo) — todo lead testado dava esse
//      erro.
//   2. PR #57: troquei pra "fields=participants" simples (igual à chamada
//      de username), suspeitando que a sintaxe de expansão confundia o
//      parser da Graph API — o erro continuou IDÊNTICO.
//   3. PR #59: causa raiz real encontrada (ver isRealIgScopedId acima) — a
//      clínica piloto tem 40 leads de demonstração (prisma/seed-demo.ts)
//      com igScopedId tipo "demo-new-0", nunca um IGSID de verdade. A Meta
//      estava certa o tempo todo em rejeitar esse valor.
// Consequência importante, só percebida DEPOIS da correção #3: a sintaxe
// de expansão da rodada 1 NUNCA foi testada contra um IGSID real — toda
// vez que rodou, estava testando contra os leads de demo, então aquele
// erro nunca provou nada sobre a sintaxe em si. A troca pra "fields=
// participants" simples na rodada 2 foi um diagnóstico errado (baseado em
// comparação de URL, não em teste real) — e essa versão simples, agora sim
// testada de verdade contra 8 leads reais (deploy da correção #3, log
// [vexo:profile-picture-backfill]), respondeu HTTP 200 sem erro nenhum,
// mas SEM "profile_picture_url" no objeto padrão de participante — ao
// contrário de "username", que vem de graça.
//   4. Voltou pra "participants{id,profile_picture_url}" (esta função,
//      abaixo) — primeiro teste limpo dessa sintaxe, contra os mesmos 3
//      leads reais (reset manual de profilePictureFetchedAt pra forçar
//      reentrada no lote sem esperar a janela de 24h). Resultado: mesmo
//      "sem foto na resposta" da rodada 3, sem erro — a sintaxe de
//      expansão em si não muda nada.
//   5. Última avenida cogitada: o payload bruto do webhook (WebhookLog.
//      rawBody, já capturado pra TODA requisição desde uma correção
//      anterior) poderia trazer campos extras (nome, foto, seguidores) só
//      na primeira mensagem de uma conversa nova — um mecanismo diferente
//      da Conversations API, não uma variação de sintaxe. Inspecionado o
//      rawBody de uma mensagem de texto real de um lead genuinamente novo
//      (não um evento "read", que não tem esse conteúdo) — o payload
//      inteiro é só entry[].messaging[].{sender.id, recipient.id,
//      timestamp, message.{mid, text}}. Nenhum campo de perfil, nem
//      aninhado em lugar nenhum, nem na primeira mensagem.
//
// CONCLUSÃO (sobre ESTA função especificamente — não reabrir esta
// investigação exata sem uma mudança real do lado da Meta): as duas
// avenidas plausíveis dentro do Instagram Login — Conversations API sem
// expansão e com expansão de subcampo — e o payload bruto do webhook foram
// testadas de forma limpa (sem a contaminação dos leads de demo das
// rodadas 1-2) e nenhuma expõe foto de perfil pra este produto ("Instagram
// API with Instagram Login"). Diferente do username (que vem de graça na
// Conversations API simples), a foto de perfil não tem, via Instagram
// Login, nenhum caminho automático.
//
// ATUALIZAÇÃO: isso NÃO significa mais "sem caminho nenhum" — existe uma
// quarta avenida, de um produto DIFERENTE da Meta (Business Discovery API,
// via Login do Facebook para Empresas — ver a seção "Business Discovery"
// mais abaixo neste arquivo), que FUNCIONA pra esse propósito. O job
// periódico (refreshLeadProfilePictures) e o lookup por mensagem nova
// (conversation-pipeline.ts) estão ATIVOS de novo, mas chamando
// getBusinessDiscoveryProfilePicture, não mais esta função — esta aqui
// continua existindo, correta, só não é mais chamada por lugar nenhum
// (histórico da investigação, não dead code por engano).
//
// SEGUNDA ATUALIZAÇÃO: existe ainda uma QUINTA avenida, dentro do MESMO
// produto Instagram Login desta função (nenhum produto/OAuth novo) — ver
// o comentário CONFIRMADO em getInstagramUserProfile, logo acima. O campo
// certo pra foto neste node não é "profile_picture_url" (o nome tentado
// aqui, na Conversations API), é "profile_pic" — e ele vem preenchido no
// lookup direto por IGSID (GET /{igScopedId}?fields=...), fora da
// Conversations API. Achado por teste único, ainda não formalizado no
// pipeline automático (decisão adiada pra depois do App Review).
export async function getInstagramConversationParticipantProfilePicture(
  accessToken: string,
  igUserId: string,
  leadIgScopedId: string
): Promise<{ profilePictureUrl?: string }> {
  if (!isRealIgScopedId(leadIgScopedId)) {
    console.log(`[vexo:profile-picture-lookup] igScopedId=${leadIgScopedId} não é um IGSID numérico real (provável lead de seed/demo) — pulado, sem chamar a API.`);
    return { profilePictureUrl: undefined };
  }

  const url = new URL(`${IG_GRAPH_BASE}/${igUserId}/conversations`);
  url.searchParams.set("platform", "instagram");
  url.searchParams.set("user_id", leadIgScopedId);
  url.searchParams.set("fields", "participants{id,profile_picture_url}");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Falha ao buscar conversa do lead pra achar a foto de perfil (HTTP ${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    data?: { participants?: { data?: { id: string; profile_picture_url?: string }[] } }[];
  };
  const participants = data.data?.[0]?.participants?.data ?? [];
  const leadParticipant = participants.find((p) => p.id !== igUserId);
  return { profilePictureUrl: leadParticipant?.profile_picture_url || undefined };
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
  // O "user_id" desse endpoint NÃO é usado como igUserId (ver por quê no
  // comentário grande abaixo, no passo 3) — só o access_token de curta
  // duração importa daqui.
  const shortLived = JSON.parse(tokenBodyText) as { access_token: string };

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

  // 3. Username e "id" da própria conta segundo graph.instagram.com/me.
  //
  // AVISO IMPORTANTE (histórico do bug de descompasso de ID, atualizado):
  // por um tempo este comentário afirmava que o "id" de /me era o mesmo
  // namespace usado pelo webhook (entry.id/recipient.id) — ACHO QUE ISSO
  // ESTAVA ERRADO. Evidência: numa conta real em produção, o "id" de /me
  // veio bem próximo do "user_id" antigo de api.instagram.com (mesma
  // família de número, ~27874369612264796), enquanto o entry.id que o
  // webhook manda de verdade é COMPLETAMENTE diferente
  // (~17841429744434753, outra quantidade de dígitos no prefixo). Ou
  // seja: api.instagram.com/oauth/access_token (passo 1) e
  // graph.instagram.com/me (aqui) aparentam devolver a MESMA conta no
  // MESMO namespace — só que o webhook usa um terceiro namespace
  // diferente dos dois, que NENHUM endpoint acessível nesse produto
  // (Instagram API with Instagram Login, sem Página do Facebook no meio)
  // parece expor. Guardado aqui mesmo assim (ainda é um identificador
  // válido e estável da conta, só não serve pra casar webhook recebido
  // com conta salva) — a correção do ID usado pra essa finalidade agora é
  // manual, alimentada pelo que os webhooks reais mostram (ver
  // setInstagramWebhookIdAction em src/app/crm/clinicas/actions.ts e o
  // motivo de descarte visível em /crm/webhook-logs).
  const meRes = await fetch(
    `${IG_GRAPH_BASE}/me?fields=id,username&access_token=${encodeURIComponent(longLivedToken)}`
  );
  const meText = await meRes.text();
  const meId = extractIdField(meText, "id");
  if (!meId) {
    throw new Error(`Resposta de /me sem "id": ${meText}`);
  }
  const meUsername = (JSON.parse(meText) as { username?: string }).username;

  return {
    accessToken: longLivedToken,
    igUserId: meId,
    igUsername: meUsername,
  };
}

// Conversation Routing / Handover Protocol da Meta: configurar um "app
// padrão" na tela de roteamento do Meta Business Suite (o que já fizemos
// pras contas de teste) é só o PRÉ-REQUISITO — segundo a própria
// documentação da Meta, "The Take Thread Control API is blocked unless a
// default application is set. The Request Thread Control API is enabled
// for any application but must be invoked to gain control.". Ou seja,
// configurar o app padrão sozinho NÃO transfere o controle de threads que
// JÁ EXISTIAM antes disso — é preciso uma chamada de API ativa pedindo
// (ou tomando) o controle. Chamada automaticamente quando um evento chega
// em modo "standby" (ver api/webhooks/instagram/route.ts).
//
// Incerteza real, registrada aqui de propósito: toda a documentação da
// Meta sobre esse mecanismo (Handover Protocol / Conversation Routing)
// que foi possível localizar vive sob messenger-platform/instagram — a
// família do produto ANTIGO, com Página do Facebook — não sob
// instagram-platform/instagram-api-with-instagram-login (o produto que o
// VEXO usa). É o mesmo host (graph.instagram.com) e o mesmo padrão de
// endereçamento ("me", como em subscribeInstagramWebhook logo abaixo) já
// confirmados como corretos pra esse produto, mas não há confirmação
// oficial de que esse edge específico existe aqui — assim como
// me/thread_owner (removido de sendInstagramMessage por não existir
// nesse produto). Se não existir, a resposta de erro abaixo já mostra
// isso, exatamente como aconteceu com thread_owner.
export async function requestThreadControl(accessToken: string, recipientId: string): Promise<string> {
  const res = await fetch(`${IG_GRAPH_BASE}/me/request_thread_control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, access_token: accessToken }),
  });
  const bodyText = await res.text();
  return `HTTP ${res.status}: ${bodyText}`;
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
// Diagnóstico: lê o perfil da própria conta (GET simples, sem side effect
// nenhum) com o mesmo accessToken usado no subscribe logo abaixo. Isola se
// um "Object with ID ... does not exist" no subscribe é o token em si
// sendo inválido (essa leitura também falha, do mesmo jeito) ou é
// específico do endpoint /subscribed_apps.
//
// Endereça a própria conta como "me", não pelo igUserId numérico — um
// "Instagram User access token" desse produto (Instagram API with
// Instagram Login) só endereça a própria conta por esse atalho, igual
// todo exemplo oficial da Meta pra esse produto (mensagens, conversas
// etc). Não é só estilo: era exatamente o motivo do "Object with ID
// '...' does not exist" persistir mesmo depois de corrigir versão da API
// e formato do ID (v24.0 + extração sem perda de precisão) — o servidor
// da Meta não resolve o node pelo ID numérico pra esse tipo de token,
// mesmo sendo o ID correto. Evidência que já existia no próprio código
// antes dessa correção: exchangeInstagramCode (passo 3, leitura de
// username) sempre usou "me" e sempre funcionou; só as chamadas que
// usavam o ID numérico direto falhavam.
export async function verifyInstagramTokenAndId(
  accessToken: string
): Promise<{ id: string; username?: string }> {
  const url = new URL(`${IG_GRAPH_BASE}/me`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Falha ao verificar token (HTTP ${res.status}): ${bodyText}`);
  }
  // Extrai "id" do texto cru, nunca via res.json() — mesmo motivo do
  // meData.id em exchangeInstagramCode: esse campo já passou de
  // Number.MAX_SAFE_INTEGER numa conta real e um "as { id: string }" não
  // protege contra o parser de JSON arredondar o valor antes do cast.
  const id = extractIdField(bodyText, "id");
  if (!id) {
    throw new Error(`Resposta de /me sem "id": ${bodyText}`);
  }
  const username = (JSON.parse(bodyText) as { username?: string }).username;
  return { id, username };
}

export async function subscribeInstagramWebhook(accessToken: string): Promise<void> {
  const url = new URL(`${IG_GRAPH_BASE}/me/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "messages");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    throw new Error(`Falha ao inscrever a conta no webhook (HTTP ${res.status}): ${await res.text()}`);
  }
}

// Diagnóstico: o subscribe acima só confirma que a CHAMADA teve sucesso
// (a Meta aceitou o POST) — não confirma quais campos ficaram realmente
// inscritos pra essa conta. Essa leitura devolve a lista de verdade
// (ex: pode vir vazia, ou sem "messages", mesmo com o POST anterior tendo
// retornado 200).
export async function getSubscribedFields(accessToken: string): Promise<string[]> {
  const url = new URL(`${IG_GRAPH_BASE}/me/subscribed_apps`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Falha ao consultar inscrição do webhook (HTTP ${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: { subscribed_fields?: string[] }[] };
  return data.data?.[0]?.subscribed_fields ?? [];
}

// Fingerprint (não reversível pra exibição) de um token — comprimento e
// alguns caracteres do início/fim, o suficiente pra comparar visualmente
// contra outro log/print do "mesmo" token sem nunca expor o valor inteiro
// em texto (nem pra sessão interna). Só entra em uso se a chamada com
// "me" acima também falhar: nesse ponto o suspeito deixa de ser o
// endereçamento (ID vs. "me") e passa a ser o token em si — salvo
// truncado, salvo corrompido na criptografia/decriptação, ou nunca foi o
// token de longa duração pra começo de conversa.
export function tokenFingerprint(token: string): string {
  if (token.length <= 16) return `len=${token.length}`;
  return `len=${token.length}, começa "${token.slice(0, 8)}", termina "${token.slice(-8)}"`;
}

// Remove a conexão local — o token de Instagram Login não expira sozinho e
// a Graph API não tem um endpoint de revogação equivalente ao refreshToken
// do Google pra esse tipo de token, então "desconectar" aqui é parar o VEXO
// de usar/guardar o acesso; revogar de vez, se necessário, é feito pelo
// próprio Meta Business Suite do lado do cliente.
export async function disconnectInstagram(clinicId: string): Promise<void> {
  await prisma.instagramAccount.deleteMany({ where: { clinicId } });
}

// -----------------------------------------------------------------------
// Business Discovery (Login do Facebook para Empresas) — conexão SEGUNDA e
// OPCIONAL, só pra foto de perfil
// -----------------------------------------------------------------------

// Produto DIFERENTE de tudo mais neste arquivo — "Login do Facebook para
// Empresas" (Facebook Login), não "Instagram API with Instagram Login". A
// Business Discovery API (fields=business_discovery.username(...){...}) é
// EXCLUSIVA desse produto — não existe via Instagram Login. Confirmado
// isso depois de testar, de forma limpa contra leads reais, as duas únicas
// avenidas que o Instagram Login oferecia (Conversations API simples e com
// sintaxe de expansão de subcampo — ver o comentário "CONCLUSÃO
// DEFINITIVA" em getInstagramConversationParticipantProfilePicture mais
// acima) e o payload bruto do webhook — nenhuma expõe foto de perfil.
//
// Reintroduzir esse fluxo foi decisão deliberada, tomada em fase de teste
// (sem clínica real conectada ainda) — não é engano nem regressão da
// migração anterior pra Instagram Login (comentário no topo do arquivo):
// aquela migração continua sendo o fluxo PRINCIPAL, usado pra TUDO
// relacionado a mensagem (envio, recebimento, webhook). Esta é uma conexão
// SEPARADA e OPCIONAL, só pra esse bônus visual — uma clínica que nunca
// conectar isso continua funcionando normalmente, só sem foto nos cards
// (mesmo comportamento de antes desta seção existir).
//
// Autorização em facebook.com (não instagram.com); troca de token contra
// graph.facebook.com (não api.instagram.com/graph.instagram.com);
// client_id usa META_APP_ID (o App ID GERAL mostrado na tela principal do
// app — não META_INSTAGRAM_APP_ID, que é específico do outro produto,
// nem o mesmo client_id usado em buildInstagramOAuthUrl acima).
//
// IMPORTANTE sobre App Review: os scopes abaixo (instagram_basic,
// pages_show_list, business_management) são de Acesso Avançado — funcionam
// sem revisão da Meta só pra contas com algum papel no App (admin/
// desenvolvedor/testador no Meta for Developers), suficiente pra fase de
// teste com a clínica piloto. Conectar uma clínica real sem esse papel
// exigiria passar pelo App Review da Meta primeiro — não implementado
// aqui, fora de escopo enquanto o VEXO está só em teste.
const FB_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export function buildBusinessDiscoveryOAuthUrl(state: string): string {
  const clientId = process.env.META_APP_ID;
  const redirectUri = process.env.META_BUSINESS_DISCOVERY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("META_APP_ID / META_BUSINESS_DISCOVERY_REDIRECT_URI não configurados.");
  }

  const scopes = ["instagram_basic", "pages_show_list", "business_management"].join(",");

  const url = new URL(`https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

// Troca o code pelo token de PÁGINA (não de usuário, não de conta do
// Instagram) já vinculada à conta do Instagram desta clínica —
// expectedIgUserId é o id JÁ VERIFICADO contra webhook real (ver
// InstagramAccount.webhookIdVerified) da conexão principal, não um valor
// qualquer de /me: nunca salva um token que aponta pra Página errada só
// porque era a primeira da lista de quem administra várias.
export async function exchangeBusinessDiscoveryCode(
  code: string,
  expectedIgUserId: string
): Promise<{ pageAccessToken: string; pageId: string }> {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_BUSINESS_DISCOVERY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Credenciais do Facebook Login não configuradas.");
  }

  // 1. Code -> token de usuário de curta duração.
  const tokenUrl = new URL(`${FB_GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", clientId);
  tokenUrl.searchParams.set("client_secret", clientSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);
  const tokenRes = await fetch(tokenUrl.toString());
  const tokenBodyText = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`Falha ao trocar code por token do Facebook (HTTP ${tokenRes.status}): ${tokenBodyText}`);
  }
  const { access_token: shortLivedUserToken } = JSON.parse(tokenBodyText) as { access_token: string };

  // 2. Long-lived (grant_type diferente do Instagram Login —
  // fb_exchange_token, não ig_exchange_token).
  const llUrl = new URL(`${FB_GRAPH_BASE}/oauth/access_token`);
  llUrl.searchParams.set("grant_type", "fb_exchange_token");
  llUrl.searchParams.set("client_id", clientId);
  llUrl.searchParams.set("client_secret", clientSecret);
  llUrl.searchParams.set("fb_exchange_token", shortLivedUserToken);
  const llRes = await fetch(llUrl.toString());
  if (!llRes.ok) {
    throw new Error(`Falha ao obter token de longa duração do Facebook (HTTP ${llRes.status}): ${await llRes.text()}`);
  }
  const { access_token: longLivedUserToken } = (await llRes.json()) as { access_token: string };

  // 3. Páginas que essa pessoa administra, com o token de PÁGINA de cada
  // uma já embutido na resposta — é esse token (não o de usuário) que a
  // Business Discovery API espera.
  const pagesUrl = new URL(`${FB_GRAPH_BASE}/me/accounts`);
  pagesUrl.searchParams.set("access_token", longLivedUserToken);
  const pagesRes = await fetch(pagesUrl.toString());
  if (!pagesRes.ok) {
    throw new Error(`Falha ao listar Páginas do Facebook (HTTP ${pagesRes.status}): ${await pagesRes.text()}`);
  }
  const pagesData = (await pagesRes.json()) as { data?: { id: string; access_token: string; name?: string }[] };
  const pages = pagesData.data ?? [];
  if (pages.length === 0) {
    throw new Error(
      "Nenhuma Página do Facebook encontrada pra essa conta — a Business Discovery precisa de uma Página vinculada à conta do Instagram desta clínica."
    );
  }

  // 4. Acha a Página vinculada ao MESMO IG Business Account já verificado
  // pela conexão principal (Instagram Login).
  for (const page of pages) {
    const pageDetailUrl = new URL(`${FB_GRAPH_BASE}/${page.id}`);
    pageDetailUrl.searchParams.set("fields", "instagram_business_account");
    pageDetailUrl.searchParams.set("access_token", page.access_token);
    const pageDetailRes = await fetch(pageDetailUrl.toString());
    if (!pageDetailRes.ok) continue; // Página sem esse campo acessível — tenta a próxima.
    const pageDetail = (await pageDetailRes.json()) as { instagram_business_account?: { id: string } };
    if (pageDetail.instagram_business_account?.id === expectedIgUserId) {
      return { pageAccessToken: page.access_token, pageId: page.id };
    }
  }

  throw new Error(
    `Nenhuma das ${pages.length} Página(s) do Facebook encontrada(s) está vinculada à conta do Instagram já conectada desta clínica (id=${expectedIgUserId}). Confirme que a Página certa foi selecionada na tela de permissões do Facebook, e que ela está mesmo vinculada a essa conta do Instagram (Meta Business Suite > Configurações > Contas vinculadas).`
  );
}

// Business Discovery — busca dados públicos de OUTRA conta (o lead) a
// partir do @ dela, autenticado com o token de PÁGINA salvo acima (não o
// token de Instagram Login da conexão principal). ownIgUserId aqui é a
// conta DESTA clínica (quem está "descobrindo"), não o lead.
//
// IMPORTANTE: não confirmado ainda contra uma chamada real (mesma
// limitação de sempre — sem token de produção neste ambiente de
// desenvolvimento). Diferente das investigações anteriores, porém, esta
// não é mais uma dúvida sobre SE o dado existe (a documentação da Meta é
// clara: Business Discovery é feito exatamente pra isso, e
// "profile_picture_url" é um dos campos documentados) — o que resta
// validar é só a integração de ponta a ponta (OAuth, token de Página,
// formato exato da resposta) contra uma conta real.
export async function getBusinessDiscoveryProfilePicture(
  pageAccessToken: string,
  ownIgUserId: string,
  targetUsername: string
): Promise<{ profilePictureUrl?: string }> {
  const url = new URL(`${FB_GRAPH_BASE}/${ownIgUserId}`);
  url.searchParams.set("fields", `business_discovery.username(${targetUsername}){profile_picture_url}`);
  url.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    // NÃO lança — ao contrário da maioria das outras funções deste
    // arquivo. Aqui, um erro da Meta na esmagadora maioria dos casos reais
    // significa "essa conta-alvo não é Business/Creator" (o caso comum:
    // consumidor final com conta pessoal comum) — restrição documentada e
    // PERMANENTE pra essa conta específica, não transitória. Tratar como
    // exceção faria o caller retentar pra sempre algo que nunca vai
    // funcionar — mesma classe de bug já corrigida pros leads de seed/demo
    // (ver isRealIgScopedId). O texto cru fica só no log, pra eventualmente
    // distinguir isso de um problema real de token/permissão se os logs
    // mostrarem um padrão suspeito (ex: TODO lead falhando, não só os com
    // conta pessoal).
    console.log(
      `[vexo:business-discovery] username=${targetUsername} -> sem foto (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`
    );
    return { profilePictureUrl: undefined };
  }

  const data = (await res.json()) as { business_discovery?: { profile_picture_url?: string } };
  return { profilePictureUrl: data.business_discovery?.profile_picture_url };
}

// Remove só a conexão OPCIONAL de Business Discovery — a conexão
// principal do Instagram (mensagens) continua intacta.
export async function disconnectBusinessDiscovery(clinicId: string): Promise<void> {
  await prisma.instagramAccount.update({
    where: { clinicId },
    data: {
      businessDiscoveryAccessTokenEnc: null,
      businessDiscoveryPageId: null,
      businessDiscoveryConnectedAt: null,
    },
  });
}
