import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isReviewerAllowedPath } from "@/lib/reviewer-access";
import { isFilaScopeAllowedPath } from "@/lib/client-fila-access";

// Gate de pathname pro login Revisor (ver UserRole.REVIEWER) — roda ANTES
// de qualquer layout/página, cobrindo automaticamente rota nova que
// alguém crie amanhã sob /crm sem precisar lembrar de barrar o Revisor
// nela (negar por padrão). Só decide por PATHNAME, nunca consulta o banco
// aqui (middleware roda no Edge runtime por padrão no Next 14 — sem
// Prisma): usa só o papel/clinicId já dentro do JWT (getToken, mesma
// lib que o NextAuth usa, sem precisar importar authOptions inteiro, que
// puxaria bcrypt/Prisma pro bundle de edge). Verificação de DONO da
// conversa (/crm/conversas/[id] e /api/conversas/[id]/mensagens — aqui só
// sabemos que É uma conversa, não de qual clínica) fica pra dentro da
// própria página/rota, que já consulta o banco mesmo (ver
// requireInternalOrReviewerSession em src/lib/session.ts).
//
// Segundo gate, mesmo molde, pro segundo link de acesso do cliente
// (ClientFilaLink, `scope: "fila"` no JWT — ver acesso-fila/[token]/
// route.ts/client-fila-access.ts) — regra de segurança pedida
// explicitamente: quem só tem o link da Fila nunca alcança /dashboard
// (o painel inteiro), mesmo digitando a URL direto, mesmo já logado.
// Redireciona pra própria Fila (nunca 404/rewrite como o Revisor acima —
// não é "esconder que a rota existe", é "essa não é a tela deste link",
// um cliente de verdade só erra o caminho, nunca está sondando).
function handleFilaScopeGate(request: NextRequest, pathname: string): NextResponse | null {
  if (!pathname.startsWith("/dashboard")) return null;
  if (isFilaScopeAllowedPath(pathname)) return null;
  return NextResponse.redirect(new URL("/dashboard/fila", request.url));
}

// Qualquer papel que NÃO seja Revisor/CLIENT com scope "fila" passa
// direto, sem nenhuma mudança de comportamento (Admin/Equipe continuam
// exatamente como sempre foram — a lógica de página/ação deles nem é
// tocada por este arquivo).
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (token.role === "CLIENT" && token.scope === "fila") {
    const blocked = handleFilaScopeGate(request, pathname);
    if (blocked) return blocked;
  }

  if (token.role !== "REVIEWER") return NextResponse.next();

  const clinicId = (token.clinicId as string | null) ?? "";
  if (isReviewerAllowedPath(pathname, clinicId)) return NextResponse.next();

  // API: 404 em JSON, nunca uma página HTML. Páginas: reescreve pra um
  // caminho que não existe — o próprio Next.js serve a página de 404
  // padrão (com status 404 de verdade), sem redirecionar e sem revelar
  // que a rota original existe (pedido explícito).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.rewrite(new URL("/__revisor_sem_acesso__", request.url));
}

export const config = {
  matcher: ["/crm/:path*", "/api/conversas/:path*", "/api/clinicas/:path*", "/dashboard/:path*"],
};
