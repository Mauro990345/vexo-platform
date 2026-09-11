import { NextRequest, NextResponse } from "next/server";
import { exchangeInstagramCode } from "@/lib/instagram";
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

  try {
    const result = await exchangeInstagramCode(code);

    // facebookPageId não é preenchido de propósito — não existe mais
    // Página do Facebook nesse fluxo (Instagram API with Instagram Login),
    // e nada mais no app lê essa coluna (só era escrita aqui). Uma linha já
    // existente de antes da migração mantém o valor antigo, inerte.
    await prisma.instagramAccount.upsert({
      where: { clinicId },
      update: {
        igUserId: result.igUserId,
        igUsername: result.igUsername,
        accessTokenEnc: encryptToken(result.accessToken),
      },
      create: {
        clinicId,
        igUserId: result.igUserId,
        igUsername: result.igUsername,
        accessTokenEnc: encryptToken(result.accessToken),
      },
    });

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

    // Detalhe técnico (resposta crua da API do Meta) só é exposto quando o
    // destino é a tela interna de Conexões (uso do Mauro/equipe, pra
    // depurar sem precisar dos logs do Railway) — nunca no link público de
    // auto-conexão (/conectar/[token], usado pela secretária da clínica,
    // ver errorRedirect acima) nem no fallback sem state (Contas): expor a
    // resposta crua da API do Meta pra alguém não-técnico fora da equipe
    // não ajuda em nada e vaza detalhe técnico desnecessário. Truncado pra
    // não estourar o card com uma resposta HTML/JSON gigante.
    if (!parsedState?.connectToken && parsedState?.clinicId) {
      const detail = err instanceof Error ? err.message : String(err);
      // Sem prefixo próprio aqui — conexoes/page.tsx já compõe "Não foi
      // possível conectar o Instagram: {reason}" sozinha.
      return errorRedirect(detail.length > 500 ? `${detail.slice(0, 500)}…` : detail);
    }
    return errorRedirect("Não foi possível concluir a conexão com o Instagram.");
  }
}
