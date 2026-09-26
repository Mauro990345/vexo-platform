import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { encode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Login automático do cliente via link permanente (ver ClientPanelLink no
// schema, gerado em getOrCreateClientPanelLink/regenerateClientPanelLink,
// src/app/crm/clinicas/actions.ts) — o cliente clica, cai direto em
// /dashboard, sem digitar e-mail/senha em lugar nenhum. Mesmo espírito do
// /conectar/[token] que já existe pra conexão de canais, mas autentica em
// vez de abrir uma tela de OAuth.
//
// Não existe signIn() do NextAuth v4 chamável fora de uma submissão de
// formulário (o provider de credentials espera um POST vindo da tela de
// login) — a única forma de autenticar sem essa tela é montar o cookie de
// sessão manualmente, com o mesmo shape (role/clinicId) que o callback
// jwt() de src/lib/auth.ts produziria num login normal, e assinado com o
// mesmo NEXTAUTH_SECRET. getServerSession() no resto do app não diferencia
// de onde veio o cookie — só decodifica e confia.
//
// sub sintético (não é um User.id real — esse acesso não tem User nenhum
// por trás, só o ClientPanelLink) porque nada no fluxo CLIENT usa
// session.user.id: requireClientSession, setAppointmentAttendanceClientAction
// (src/app/dashboard/actions.ts) e todo o resto de /dashboard só olham
// role + clinicId. Prefixado e fixo por clínica (não randômico a cada
// clique) só por clareza em debug, se um dia precisar decodificar um token
// à mão.
//
// Sem expiração/uso único de propósito (ver comentário no schema) — dura
// 1 ano, igual ao "login permanente" por e-mail/senha (authOptions.session.maxAge
// em src/lib/auth.ts), renovado a cada clique no link.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const link = await prisma.clientPanelLink.findUnique({
    where: { token: params.token },
    select: { clinic: { select: { id: true, name: true, active: true } } },
  });

  if (!link || !link.clinic.active) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Bug real reportado no primeiro teste deste link: alguém da equipe
  // interna (M8 Growth) clicou nele NO MESMO NAVEGADOR onde já estava
  // logado no CRM — e o cookie de sessão abaixo, ao ser sobrescrito sem
  // aviso, trocou o login dela (INTERNAL_ADMIN/STAFF) pelo do cliente
  // (CLIENT). Resultado: a sidebar do CRM "sumiu" e a navegação ficou
  // presa em /dashboard — não por bug de layout (/dashboard nunca teve
  // sidebar, ver comentário em src/app/dashboard/page.tsx), mas porque a
  // sessão de staff genuinamente deixou de existir depois do clique, sem
  // nenhuma tela avisando disso.
  //
  // Pra quem já está logado como equipe interna, não sobrescreve a sessão
  // dela — manda pra visão de preview que já existe pra esse exato caso
  // (Ver painel de clínica, /crm/painel-cliente/[id]: mesmo conteúdo do
  // /dashboard do cliente, mas sob a própria sessão interna, sem tocar no
  // cookie). Um cliente real nunca tem sessão prévia nesse navegador, então
  // esse desvio não afeta o fluxo principal — só protege quem está testando
  // logado.
  const existingSession = await getServerSession(authOptions);
  if (existingSession?.user && isInternal(existingSession.user.role)) {
    return NextResponse.redirect(new URL(`/crm/painel-cliente/${link.clinic.id}`, req.url));
  }

  const secureCookie = process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  const maxAge = 60 * 60 * 24 * 365;

  const sessionToken = await encode({
    token: {
      sub: `client-panel-link:${link.clinic.id}`,
      name: link.clinic.name,
      role: "CLIENT",
      clinicId: link.clinic.id,
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge,
  });

  const res = NextResponse.redirect(new URL("/dashboard", req.url));
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
