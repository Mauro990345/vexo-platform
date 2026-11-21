import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { encode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Segundo link de acesso do cliente (ver ClientFilaLink no schema, gerado
// em getOrCreateClientFilaLink, src/app/crm/clinicas/actions.ts) — mesmo
// mecanismo do /acesso/[token] original (login automático via cookie
// montado manualmente, mesmo motivo: não existe signIn() chamável fora de
// uma submissão de formulário no NextAuth v4 — ver comentário grande lá),
// só que este dá acesso SÓ à Fila de abordagem (/dashboard/fila), nunca
// ao painel inteiro (/dashboard).
//
// A ÚNICA diferença que importa pra regra de segurança pedida
// (quem só tem este link nunca alcança /dashboard, mesmo digitando a URL
// direto) é o claim `scope: "fila"` gravado no token abaixo — não existe
// role nova nem tabela de permissão: o middleware (isFilaScopeAllowedPath,
// client-fila-access.ts) lê esse claim direto do JWT (Edge, sem Prisma) e
// bloqueia qualquer pathname sob /dashboard que não seja /dashboard/fila;
// requireClientSession (session.ts) repete a mesma checagem como segunda
// camada. O inverso (quem tem o link do painel completo, sem esse claim,
// abrindo /dashboard/fila a partir do botão "Abrir Fila de abordagem") é
// permitido de propósito — requireClientFilaSession não exige scope
// nenhum.
const appUrl = process.env.APP_URL ?? "";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const link = await prisma.clientFilaLink.findUnique({
    where: { token: params.token },
    select: { clinic: { select: { id: true, name: true, active: true } } },
  });

  if (!link || !link.clinic.active) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  // Mesmo desvio do /acesso/[token] original: equipe interna já logada no
  // mesmo navegador não perde a própria sessão — manda pra visão interna
  // equivalente (a Fila desta clínica, dentro do CRM) em vez de
  // sobrescrever o cookie.
  const existingSession = await getServerSession(authOptions);
  if (existingSession?.user && isInternal(existingSession.user.role)) {
    return NextResponse.redirect(`${appUrl}/crm/clinicas/${link.clinic.id}/abordagem/fila`);
  }

  const secureCookie = appUrl.startsWith("https://");
  const maxAge = 60 * 60 * 24 * 365;

  const sessionToken = await encode({
    token: {
      sub: `client-fila-link:${link.clinic.id}`,
      name: link.clinic.name,
      role: "CLIENT",
      clinicId: link.clinic.id,
      scope: "fila",
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge,
  });

  const res = NextResponse.redirect(`${appUrl}/dashboard/fila`);
  res.cookies.set({
    name: secureCookie ? "__Secure-next-auth.session-token" : "next-auth.session-token",
    value: sessionToken,
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
