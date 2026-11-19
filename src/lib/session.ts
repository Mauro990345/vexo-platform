import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Helpers de sessão usados pelas páginas server-side do App Router.
// Garantem isolamento de tenant: um usuário CLIENT só enxerga dados de
// clinicId === session.user.clinicId. Usuários internos veem tudo.

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/entrar");

  // Desativar um usuário (ver User.active, pensado pro login Revisor, mas
  // vale pra qualquer um) precisa tirar o acesso NA PRÓXIMA REQUISIÇÃO,
  // mesmo de quem já está logado — a sessão é JWT (sem registro no banco,
  // ver auth.ts), então o único jeito é checar `active` aqui, a cada
  // carregamento de página server-side. redirect("/entrar") sozinho não
  // apaga o cookie de sessão (não dá pra mexer em cookie fora de Server
  // Action/Route Handler durante o render) — por isso /entrar/page.tsx
  // também confere `active` antes de redirecionar pra dentro do app de
  // novo: sem isso, um usuário desativado ficaria preso num loop entre
  // esta página e /entrar.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { active: true } });
  if (!user?.active) redirect("/entrar");

  return session;
}

export async function requireInternalSession() {
  const session = await requireSession();
  // Revisor nunca passa por aqui — toda página que já existe (e qualquer
  // página nova que seguir o mesmo padrão) continua chamando
  // requireInternalSession() normalmente; só as poucas páginas da lista
  // liberada chamam requireInternalOrReviewerSession no lugar (ver
  // abaixo). notFound() (não redirect): pro Revisor, uma rota fora da
  // lista precisa responder "não existe", nunca revelar que existe nem
  // mandar pra outro lugar.
  if (session.user.role === "REVIEWER") notFound();
  if (session.user.role !== "INTERNAL_ADMIN" && session.user.role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }
  return session;
}

// Única exceção explícita ao bloqueio acima — usada SÓ pelas 4 páginas/
// rota liberadas pro Revisor (Conexões, Painel, Pipeline, a conversa de um
// lead + a rota que atualiza ela sozinha). `clinicId` é o dono do recurso
// sendo acessado (o :id da própria rota, ou o clinicId da conversa já
// carregada) — o Revisor só passa se for EXATAMENTE a clínica dele.
// Nunca espalhar esta checagem em mais lugares: toda página nova continua
// usando requireInternalSession (bloqueia o Revisor por padrão).
export async function requireInternalOrReviewerSession(clinicId: string) {
  const session = await requireSession();
  if (isInternal(session.user.role)) return session;
  if (session.user.role === "REVIEWER" && session.user.clinicId === clinicId) return session;
  notFound();
}

// Gate "frouxo" usado só pelo layout raiz de /crm (crm/layout.tsx) — deixa
// Admin/Equipe/Revisor passarem estruturalmente pra dentro da árvore de
// rotas (cada página embaixo decide, ela mesma, se aquele papel pode ver
// AQUELA página específica via requireInternalSession ou
// requireInternalOrReviewerSession). Cliente continua redirecionado pro
// painel dele, exatamente como sempre foi.
export async function requireCrmAreaSession() {
  const session = await requireSession();
  if (session.user.role !== "INTERNAL_ADMIN" && session.user.role !== "INTERNAL_STAFF" && session.user.role !== "REVIEWER") {
    redirect("/dashboard");
  }
  return session;
}

// Só pras ações do admin de verdade (ver "Login de revisão" em Contas) —
// Equipe/Staff não gerencia o login Revisor, só Admin.
export async function requireAdminSession() {
  const session = await requireInternalSession();
  if (session.user.role !== "INTERNAL_ADMIN") {
    redirect("/crm");
  }
  return session;
}

export async function requireClientSession() {
  const session = await requireSession();
  if (session.user.role !== "CLIENT" || !session.user.clinicId) {
    redirect("/crm");
  }
  return session;
}

export function isInternal(role: string) {
  return role === "INTERNAL_ADMIN" || role === "INTERNAL_STAFF";
}

export function isReviewer(role: string) {
  return role === "REVIEWER";
}
