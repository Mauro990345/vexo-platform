import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { buildBusinessDiscoveryOAuthUrl } from "@/lib/instagram";
import { signOAuthState } from "@/lib/oauth-state";
import { prisma } from "@/lib/prisma";

// Só a equipe interna inicia esta conexão — igual ao /api/oauth/instagram/
// start, e sem versão pública (/conectar/[token]): Business Discovery é um
// bônus opcional (foto de perfil), não um canal essencial pra clínica
// conectar sozinha.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isInternal(session.user.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const clinicId = req.nextUrl.searchParams.get("clinicId");
  if (!clinicId) return new NextResponse("clinicId obrigatório", { status: 400 });

  // Precisa da conexão principal do Instagram já feita e com o ID
  // confirmado por webhook real — é contra ESSE id que o callback confere
  // qual Página do Facebook é a certa (ver exchangeBusinessDiscoveryCode,
  // instagram.ts). Sem isso, não tem como saber qual Página escolher entre
  // as que a pessoa administra.
  const account = await prisma.instagramAccount.findUnique({ where: { clinicId } });
  if (!account) {
    return new NextResponse("Conecte o Instagram desta clínica primeiro (conexão principal).", { status: 400 });
  }
  if (!account.webhookIdVerified) {
    return new NextResponse(
      "O ID da conta do Instagram desta clínica ainda não foi confirmado por um evento de webhook real — espere a clínica receber pelo menos uma mensagem antes de conectar a Business Discovery.",
      { status: 400 }
    );
  }

  const state = signOAuthState(clinicId);
  return NextResponse.redirect(buildBusinessDiscoveryOAuthUrl(state));
}
