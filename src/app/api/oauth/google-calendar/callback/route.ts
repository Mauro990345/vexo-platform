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

  try {
    const result = await exchangeGoogleCode(code);

    await prisma.googleCalendarAccount.upsert({
      where: { clinicId: parsedState.clinicId },
      update: {
        googleAccountEmail: result.email,
        accessTokenEnc: encryptToken(result.accessToken),
        refreshTokenEnc: encryptToken(result.refreshToken),
        tokenExpiresAt: result.expiryDate,
      },
      create: {
        clinicId: parsedState.clinicId,
        googleAccountEmail: result.email,
        accessTokenEnc: encryptToken(result.accessToken),
        refreshTokenEnc: encryptToken(result.refreshToken),
        tokenExpiresAt: result.expiryDate,
      },
    });

    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/crm/clinicas/${parsedState.clinicId}/google-calendar?status=conectado`
    );
  } catch (err) {
    console.error("[vexo] Falha no callback OAuth do Google Calendar:", err);
    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/crm/clinicas/${parsedState.clinicId}/google-calendar?status=erro`
    );
  }
}
