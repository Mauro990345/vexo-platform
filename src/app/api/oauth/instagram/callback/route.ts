import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { exchangeInstagramCode, subscribeInstagramWebhook, getSubscribedFields } from "@/lib/instagram";
import { verifyOAuthState } from "@/lib/oauth-state";
import { encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Meta pode voltar aqui com um erro em vez de "code" — ex: URI de
// redirecionamento não cadastrado no produto do app no App Dashboard (campo
// "URIs de redirecionamento OAuth válidos" — separado do "Domínios do app"
// genérico em Configurações > Básico; ver src/lib/instagram.ts pro produto
// exato usado aqui, Instagram API with Instagram Login), app em modo de
// desenvolvimento sem o usuário como tester, ou o próprio usuário
// cancelando a autorização. Nesses casos NUNCA vem "code", só
// error/error_code/error_message — sem esse tratamento, a ausência de
// "code" caía direto no branch de "parâmetros ausentes" e mostrava um texto
// cru pro usuário, sem explicação nenhuma do que aconteceu nem como voltar
// a tentar.
// Erros do Prisma (ex: PrismaClientValidationError) colocam a causa raiz
// real ("Invalid value for argument `x`. Expected Y, provided Z.") DEPOIS
// do dump formatado da query inteira — truncar só pelo início (como antes)
// cortava exatamente a parte útil da mensagem antes dela aparecer. Mantém
// um pedaço do começo (contexto de qual chamada falhou) e SEMPRE o final
// (onde a causa raiz normalmente está), em vez de só os primeiros N chars.
const MAX_DETAIL_LEN = 2000;
function truncateDetail(detail: string): string {
  if (detail.length <= MAX_DETAIL_LEN) return detail;
  const headLen = 300;
  const tailLen = MAX_DETAIL_LEN - headLen;
  return `${detail.slice(0, headLen)}\n…\n${detail.slice(-tailLen)}`;
}

function readMetaError(params: URLSearchParams): string | null {
  const message =
    params.get("error_message") ?? params.get("error_description") ?? params.get("error_reason");
  if (message) return message;
  const code = params.get("error_code");
  if (code) return `Erro ${code} retornado pelo Instagram.`;
  return params.get("error");
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const parsedState = state ? verifyOAuthState(state) : null;
  const appUrl = process.env.APP_URL ?? "";

  // Pra onde mandar o usuário quando algo dá errado — sempre pra uma tela
  // que já tem a ação de "tentar de novo" pronta (o botão "Conectar" da
  // Conexões, ou o link da página pública /conectar/[token]), nunca um
  // texto cru sem saída. Sem state válido não dá pra saber de qual clínica/
  // link veio, então cai pra Contas com o motivo no query string.
  function errorRedirect(reason: string): NextResponse {
    const encodedReason = encodeURIComponent(reason);
    if (parsedState?.connectToken) {
      return NextResponse.redirect(`${appUrl}/conectar/${parsedState.connectToken}?status=erro&reason=${encodedReason}`);
    }
    if (parsedState?.clinicId) {
      return NextResponse.redirect(
        `${appUrl}/crm/clinicas/${parsedState.clinicId}/conexoes?status=erro&channel=instagram&reason=${encodedReason}`
      );
    }
    return NextResponse.redirect(`${appUrl}/crm?oauthError=${encodedReason}`);
  }

  const metaError = readMetaError(req.nextUrl.searchParams);
  if (metaError) return errorRedirect(metaError);

  if (!code || !state) {
    return errorRedirect("Não recebemos os parâmetros esperados de volta do Instagram.");
  }
  if (!parsedState) {
    return errorRedirect("Sessão de conexão expirada ou inválida — gere um novo link e tente de novo.");
  }

  const { clinicId, connectToken } = parsedState;

  // O botão "Conectar" da Conexões (uso interno) NÃO chama esse endpoint
  // direto pra ele mesmo — pra Instagram e Google Calendar, esse botão é o
  // ConnectionLinkButton, que sempre gera um link público de auto-conexão
  // (connectToken) pra depois enviar pra secretária da clínica; mas na
  // prática o Mauro/equipe abre esse mesmo link na hora, na mesma aba/
  // sessão, só pra testar. Ou seja: connectToken presente no state NÃO
  // significa "veio da secretária" — as duas situações produzem exatamente
  // o mesmo state. O jeito confiável de diferenciar é olhar quem está
  // completando ESTE request agora: se o cookie de sessão do NextAuth (que
  // viaja normalmente num redirect top-level como esse, por ser
  // sameSite=lax) pertence a alguém da equipe interna, é o Mauro testando
  // o próprio link — não a secretária, que nunca teria essa sessão no
  // navegador dela.
  const session = await getServerSession(authOptions);
  const hasInternalSession = Boolean(session && isInternal(session.user.role));

  try {
    const result = await exchangeInstagramCode(code);

    // Se essa clínica já tinha uma conta com o ID confirmado por um
    // webhook real (webhookIdVerified — ver schema), NÃO sobrescreve esse
    // valor com o "id" que o OAuth devolveu: esse campo nunca bateu com o
    // que a Meta manda de verdade nos eventos de webhook pra começo de
    // conversa (ver AVISO IMPORTANTE em exchangeInstagramCode,
    // src/lib/instagram.ts) — sobrescrever aqui reverteria uma correção já
    // validada toda vez que a clínica reconectasse (ex: token expirado).
    // Conta nova (ou ainda não confirmada) grava o palpite do OAuth mesmo
    // assim, como ponto de partida — a auto-correção em
    // handleInboundInstagramMessage (conversation-pipeline.ts) resolve
    // sozinha assim que o primeiro evento de webhook real chegar.
    const existingAccount = await prisma.instagramAccount.findUnique({ where: { clinicId } });

    // facebookPageId não é preenchido de propósito — não existe mais
    // Página do Facebook nesse fluxo (Instagram API with Instagram Login),
    // e nada mais no app lê essa coluna (só era escrita aqui). Uma linha já
    // existente de antes da migração mantém o valor antigo, inerte.
    await prisma.instagramAccount.upsert({
      where: { clinicId },
      update: {
        ...(existingAccount?.webhookIdVerified
          ? {}
          : { igUserId: result.igUserId, webhookIdVerified: false }),
        igUsername: result.igUsername,
        accessTokenEnc: encryptToken(result.accessToken),
      },
      create: {
        clinicId,
        igUserId: result.igUserId,
        igUsername: result.igUsername,
        accessTokenEnc: encryptToken(result.accessToken),
        webhookIdVerified: false,
      },
    });

    // Sem essa chamada a conta salva acima nunca recebe webhook nenhum —
    // ver comentário em subscribeInstagramWebhook (src/lib/instagram.ts)
    // pra por que o toggle do App Dashboard sozinho não basta. Lançar daqui
    // pra dentro do catch abaixo é intencional: uma conexão que não recebe
    // mensagem nenhuma não é uma conexão que funcionou, mesmo com o token
    // salvo com sucesso — melhor falhar visivelmente aqui (com o detalhe
    // técnico já exposto pra sessão interna, ver hasInternalSession acima)
    // do que deixar a clínica "conectada" sem nunca saber que não vai
    // receber mensagem nenhuma.
    await subscribeInstagramWebhook(result.accessToken);

    // Auto-verificação (era o botão manual "Ver campos inscritos" +
    // julgamento próprio sobre clicar ou não em "Reativar webhook") — o
    // subscribe acima só confirma que a Meta ACEITOU o POST, não que
    // "messages" realmente entrou na lista de campos inscritos (já
    // aconteceu de um subscribe "bem-sucedido" não resultar em entrega
    // nenhuma). Uma tentativa extra antes de desistir; se mesmo assim não
    // pegar, falha visivelmente aqui em vez de deixar a clínica
    // "conectada" sem saber que não vai receber mensagem nenhuma — o
    // fallback manual ("Reativar webhook" em Conexões) continua existindo
    // pra quando a inscrição cair meses depois, não só na conexão inicial.
    let subscribedFields = await getSubscribedFields(result.accessToken).catch(() => [] as string[]);
    if (!subscribedFields.includes("messages")) {
      await subscribeInstagramWebhook(result.accessToken);
      subscribedFields = await getSubscribedFields(result.accessToken).catch(() => [] as string[]);
      if (!subscribedFields.includes("messages")) {
        throw new Error(
          `A Meta aceitou a inscrição no webhook, mas "messages" não aparece nos campos realmente inscritos ` +
            `(recebido: ${subscribedFields.join(", ") || "nenhum"}). Tente novamente em alguns minutos pelo ` +
            `botão "Reativar webhook" em Conexões.`
        );
      }
    }

    // Veio do link público de auto-conexão (não da tela admin) — invalida o
    // token (não reutilizável) e manda pra tela pública de sucesso em vez
    // da tela de Conexões do CRM.
    if (connectToken) {
      await prisma.connectionLink.updateMany({
        where: { token: connectToken, clinicId, channel: "instagram" },
        data: { usedAt: new Date() },
      });
      return NextResponse.redirect(`${appUrl}/conectar/${connectToken}/sucesso`);
    }

    return NextResponse.redirect(
      `${appUrl}/crm/clinicas/${clinicId}/conexoes?status=conectado&channel=instagram`
    );
  } catch (err) {
    console.error("[vexo] Falha no callback OAuth do Instagram:", err);

    // Detalhe técnico (resposta crua da API do Meta) só é exposto quando
    // QUEM está completando esse callback agora tem sessão interna válida
    // (Mauro/equipe testando, mesmo que tenha caído em /conectar/[token] —
    // ver comentário acima sobre por que connectToken sozinho não serve pra
    // essa distinção). Uma secretária de clínica de verdade, abrindo o link
    // no navegador dela sem estar logada no CRM, nunca tem essa sessão —
    // continua vendo só a mensagem genérica.
    if (hasInternalSession && parsedState?.clinicId) {
      const detail = err instanceof Error ? err.message : String(err);
      // Sem prefixo próprio aqui — conexoes/page.tsx já compõe "Não foi
      // possível conectar o Instagram: {reason}" sozinha.
      return errorRedirect(truncateDetail(detail));
    }
    return errorRedirect("Não foi possível concluir a conexão com o Instagram.");
  }
}
