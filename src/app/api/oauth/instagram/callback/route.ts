import { NextRequest, NextResponse } from "next/server";
import { exchangeInstagramCode } from "@/lib/instagram";
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
    const result = await exchangeInstagramCode(code);

    await prisma.instagramAccount.upsert({
      where: { clinicId },
      update: {
        igUserId: result.igUserId,
        igUsername: result.igUsername,
        facebookPageId: result.facebookPageId,
        accessTokenEnc: encryptToken(result.pageAccessToken),
      },
      create: {
        clinicId,
        igUserId: result.igUserId,
        igUsername: result.igUsername,
        facebookPageId: result.facebookPageId,
        accessTokenEnc: encryptToken(result.pageAccessToken),
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
      return NextResponse.redirect(`${process.env.APP_URL ?? ""}/conectar/${connectToken}/sucesso`);
    }

    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/crm/clinicas/${clinicId}/conexoes?status=conectado&channel=instagram`
    );
  } catch (err) {
    console.error("[vexo] Falha no callback OAuth do Instagram:", err);

    if (connectToken) {
      return NextResponse.redirect(`${process.env.APP_URL ?? ""}/conectar/${connectToken}?status=erro`);
    }
    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/crm/clinicas/${clinicId}/conexoes?status=erro&channel=instagram`
    );
  }
}
