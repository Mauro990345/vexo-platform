import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildGoogleOAuthUrl } from "@/lib/google-calendar";
import { signOAuthState } from "@/lib/oauth-state";

// Igual a /api/oauth/google-calendar/start, mas sem exigir sessão admin —
// autoriza pelo token do ConnectionLink (ver conectar/[token]/page.tsx) em
// vez de clinicId + sessão. O token viaja dentro do `state` assinado até o
// callback, que marca o link como usado só depois do sucesso.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("token obrigatório", { status: 400 });

  const link = await prisma.connectionLink.findUnique({ where: { token } });
  if (!link || link.usedAt || link.expiresAt < new Date()) {
    return new NextResponse("Link inválido ou expirado.", { status: 400 });
  }

  const state = signOAuthState(link.clinicId, token);
  return NextResponse.redirect(buildGoogleOAuthUrl(state));
}
