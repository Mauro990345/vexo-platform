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

  try {
    const result = await exchangeInstagramCode(code);

    await prisma.instagramAccount.upsert({
      where: { clinicId: parsedState.clinicId },
      update: {
        igUserId: result.igUserId,
        igUsername: result.igUsername,
        facebookPageId: result.facebookPageId,
        accessTokenEnc: encryptToken(result.pageAccessToken),
      },
      create: {
        clinicId: parsedState.clinicId,
        igUserId: result.igUserId,
        igUsername: result.igUsername,
        facebookPageId: result.facebookPageId,
        accessTokenEnc: encryptToken(result.pageAccessToken),
      },
    });

    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/crm/clinicas/${parsedState.clinicId}/conexoes?status=conectado&channel=instagram`
    );
  } catch (err) {
    console.error("[vexo] Falha no callback OAuth do Instagram:", err);
    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/crm/clinicas/${parsedState.clinicId}/conexoes?status=erro&channel=instagram`
    );
  }
}
