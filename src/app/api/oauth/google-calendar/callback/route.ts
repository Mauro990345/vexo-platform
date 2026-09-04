import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google-calendar";
import { verifyOAuthState } from "@/lib/oauth-state";
import { encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return new NextResponse("Parâmetros ausentes.", { status: 400 });

  const parsedState = verifyOAuthState(state);
  if (!parsedState) return new NextResponse("State inválido ou expirado.", { status: 400 });

  const { clinicId, connectToken } = parsedState;

  try {
    const result = await exchangeGoogleCode(code);

    await prisma.googleCalendarAccount.upsert({
      where: { clinicId },
      update: {
        googleAccountEmail: result.email,
        accessTokenEnc: encryptToken(result.accessToken),
        refreshTokenEnc: encryptToken(result.refreshToken),
        tokenExpiresAt: result.expiryDate,
      },
      create: {
        clinicId,
        googleAccountEmail: result.email,
        accessTokenEnc: encryptToken(result.accessToken),
        refreshTokenEnc: encryptToken(result.refreshToken),
        tokenExpiresAt: result.expiryDate,
      },
    });

    // Veio do link público de auto-conexão (não da tela admin) — invalida o
    // token (não reutilizável) e manda pra tela pública de sucesso em vez
    // da tela de Conexões do CRM.
    if (connectToken) {
      await prisma.connectionLink.updateMany({
        where: { token: connectToken, clinicId },
        data: { usedAt: new Date() },
      });
      return NextResponse.redirect(`${process.env.APP_URL ?? ""}/conectar/${connectToken}/sucesso`);
    }

    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/crm/clinicas/${clinicId}/conexoes?status=conectado&channel=google-calendar`
    );
  } catch (err) {
    console.error("[vexo] Falha no callback OAuth do Google Calendar:", err);

    if (connectToken) {
      return NextResponse.redirect(`${process.env.APP_URL ?? ""}/conectar/${connectToken}?status=erro`);
    }
    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/crm/clinicas/${clinicId}/conexoes?status=erro&channel=google-calendar`
    );
  }
}
