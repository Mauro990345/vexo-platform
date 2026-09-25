import { NextRequest, NextResponse } from "next/server";
import { exchangeBusinessDiscoveryCode } from "@/lib/instagram";
import { verifyOAuthState } from "@/lib/oauth-state";
import { encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Mesmo padrão de tratamento de erro do callback do Instagram principal
// (ver /api/oauth/instagram/callback/route.ts) — sem o conceito de
// connectToken aqui (essa conexão não tem versão pública), então sempre
// volta pra tela de Conexões do CRM.
function readMetaError(params: URLSearchParams): string | null {
  const message =
    params.get("error_message") ?? params.get("error_description") ?? params.get("error_reason");
  if (message) return message;
  const code = params.get("error_code");
  if (code) return `Erro ${code} retornado pelo Facebook.`;
  return params.get("error");
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const parsedState = state ? verifyOAuthState(state) : null;
  const appUrl = process.env.APP_URL ?? "";

  function errorRedirect(reason: string): NextResponse {
    const encodedReason = encodeURIComponent(reason);
    const clinicId = parsedState?.clinicId;
    if (clinicId) {
      return NextResponse.redirect(
        `${appUrl}/crm/clinicas/${clinicId}/conexoes?status=erro&channel=business-discovery&reason=${encodedReason}`
      );
    }
    return NextResponse.redirect(`${appUrl}/crm?oauthError=${encodedReason}`);
  }

  const metaError = readMetaError(req.nextUrl.searchParams);
  if (metaError) return errorRedirect(metaError);

  if (!code || !state) {
    return errorRedirect("Não recebemos os parâmetros esperados de volta do Facebook.");
  }
  if (!parsedState) {
    return errorRedirect("Sessão de conexão expirada ou inválida — gere um novo link e tente de novo.");
  }

  const { clinicId } = parsedState;

  try {
    const account = await prisma.instagramAccount.findUnique({ where: { clinicId } });
    if (!account) {
      throw new Error("Conexão principal do Instagram desta clínica não encontrada — reconecte o Instagram primeiro.");
    }

    const { pageAccessToken, pageId } = await exchangeBusinessDiscoveryCode(code, account.igUserId);

    await prisma.instagramAccount.update({
      where: { clinicId },
      data: {
        businessDiscoveryAccessTokenEnc: encryptToken(pageAccessToken),
        businessDiscoveryPageId: pageId,
        businessDiscoveryConnectedAt: new Date(),
      },
    });

    return NextResponse.redirect(
      `${appUrl}/crm/clinicas/${clinicId}/conexoes?status=conectado&channel=business-discovery`
    );
  } catch (err) {
    console.error("[vexo] Falha no callback OAuth do Business Discovery:", err);
    const detail = err instanceof Error ? err.message : String(err);
    // Sempre exposto (não só pra sessão interna) — ao contrário do
    // callback do Instagram principal, este fluxo só é iniciado por quem
    // já está logado no CRM (não existe link público equivalente pra uma
    // secretária de clínica completar sozinha), então não tem o mesmo
    // risco de vazar detalhe técnico pra fora da equipe.
    return errorRedirect(detail.slice(0, 2000));
  }
}
