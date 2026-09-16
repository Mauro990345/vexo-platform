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
    // token (não reutilizável) e manda pra tela pública em vez da tela de
    // Conexões do CRM.
    if (connectToken) {
      const appUrl = process.env.APP_URL ?? "";
      const usedLink = await prisma.connectionLink.findFirst({
        where: { token: connectToken, clinicId, channel: "google-calendar" },
      });
      if (usedLink) {
        await prisma.connectionLink.update({ where: { id: usedLink.id }, data: { usedAt: new Date() } });
      }

      // Se este link nasceu de um ConnectionBundle (link combinado
      // Instagram + Google Calendar — ver createConnectionBundle,
      // src/app/crm/clinicas/actions.ts), volta pra página do bundle em
      // vez da tela de sucesso terminal de um canal só — lá o cliente já
      // vê os dois canais e o que falta conectar.
      if (usedLink?.bundleId) {
        const bundle = await prisma.connectionBundle.findUnique({
          where: { id: usedLink.bundleId },
          select: { token: true },
        });
        if (bundle) {
          return NextResponse.redirect(`${appUrl}/conectar/${bundle.token}`);
        }
      }

      return NextResponse.redirect(`${appUrl}/conectar/${connectToken}/sucesso`);
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
