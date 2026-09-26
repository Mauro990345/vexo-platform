import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { encode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { isInternal } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Login automático do cliente via link permanente (ver ClientPanelLink no
// schema, gerado em getOrCreateClientPanelLink, src/app/crm/clinicas/actions.ts)
// — único mecanismo de acesso do cliente ao painel dele: o cliente clica,
// cai direto em /dashboard, sem e-mail/senha/tela de login em NENHUMA
// hipótese (o fluxo antigo de e-mail+senha foi removido de propósito, ver
// histórico do ClientAccessModal). Mesmo espírito do /conectar/[token] que
// já existe pra conexão de canais, mas autentica em vez de abrir OAuth.
//
// Não existe signIn() do NextAuth v4 chamável fora de uma submissão de
// formulário (o provider de credentials espera um POST vindo da tela de
// login) — a única forma de autenticar sem essa tela é montar o cookie de
// sessão manualmente, com o mesmo shape (role/clinicId) que o callback
// jwt() de src/lib/auth.ts produziria num login normal, e assinado com o
// mesmo NEXTAUTH_SECRET. getServerSession() no resto do app não diferencia
// de onde veio o cookie — só decodifica e confia.
//
// BUG REAL já corrigido aqui: os redirects abaixo usavam
// `new URL(path, req.url)` — e por trás do proxy do Railway (que termina
// TLS na borda e fala HTTP puro com o container), req.url PODE vir com
// esquema "http:" em vez de "https:", mesmo a conexão real do navegador
// sendo https. O Location resultante apontava pra uma URL http que a borda
// do Railway não repassa de volta corretamente pro container (edge só
// aceita/roteia https pro app) — o link simplesmente não abria em aba
// anônima, sem erro visível. Todo o resto do código do projeto (ver
// api/oauth/*/callback/route.ts) já evita esse problema montando a URL a
// partir de process.env.APP_URL (configurado explicitamente, nunca
// inferido da requisição) em vez de req.url — mesma correção aplicada
// abaixo.
const appUrl = process.env.APP_URL ?? "";

// sub sintético (não é um User.id real — esse acesso não tem User nenhum
// por trás, só o ClientPanelLink) porque nada no fluxo CLIENT usa
// session.user.id: requireClientSession, setAppointmentAttendanceClientAction
// (src/app/dashboard/actions.ts) e todo o resto de /dashboard só olham
// role + clinicId. Prefixado e fixo por clínica (não randômico a cada
// clique) só por clareza em debug, se um dia precisar decodificar um token
// à mão.
//
// Sem expiração/uso único de propósito (ver comentário no schema) — dura
// 1 ano, renovado a cada clique no link.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const link = await prisma.clientPanelLink.findUnique({
    where: { token: params.token },
    select: { clinic: { select: { id: true, name: true, active: true } } },
  });

  if (!link || !link.clinic.active) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  // Quem já está logado como equipe interna (M8 Growth) no mesmo
  // navegador não tem a sessão dela sobrescrita por este link — sem essa
  // checagem, o cookie abaixo troca o login da pessoa (INTERNAL_ADMIN/
  // STAFF) pelo do cliente (CLIENT) sem nenhum aviso, e ela "perde" o
  // próprio acesso ao CRM até logar de novo manualmente (bug real
  // reportado no primeiro teste desta feature). Em vez disso, manda pra
  // visão de preview que já existe pra esse exato caso (Ver painel de
  // clínica, /crm/painel-cliente/[id]: mesmo conteúdo do /dashboard do
  // cliente, mas sob a própria sessão interna, sem tocar no cookie). Um
  // cliente real nunca tem sessão prévia nesse navegador, então esse
  // desvio não afeta o fluxo principal.
  const existingSession = await getServerSession(authOptions);
  if (existingSession?.user && isInternal(existingSession.user.role)) {
    return NextResponse.redirect(`${appUrl}/crm/painel-cliente/${link.clinic.id}`);
  }

  const secureCookie = appUrl.startsWith("https://");
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

  const res = NextResponse.redirect(`${appUrl}/dashboard`);
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
