// Lista FIXA (negar por padrão) do que o login Revisor pode acessar — ver
// UserRole.REVIEWER no schema e o pedido explícito do App Review da Meta.
// Módulo puro de propósito: usado tanto pelo middleware.ts (decisão rápida
// por pathname, sem tocar banco) quanto pelo teste que varre TODAS as
// rotas de src/app/crm e src/app/api (ver reviewer-access.test.ts) — nunca
// duplicar esta lista em outro lugar do código.
//
// Rotas liberadas (só da clínica do próprio Revisor, ver clinicId):
//   /crm/clinicas/<clinicId>            (Pipeline)
//   /crm/clinicas/<clinicId>/conexoes
//   /crm/clinicas/<clinicId>/painel
//   /crm/conversas/<qualquer id>        (dono verificado depois, na própria
//                                         página/rota — aqui não dá pra
//                                         saber a clínica só pelo path)
//   /api/conversas/<qualquer id>/mensagens (mesmo motivo acima)
// Qualquer outra coisa sob /crm ou /api/conversas é negada.
export function isReviewerAllowedPath(pathname: string, clinicId: string): boolean {
  if (!clinicId) return false;

  if (pathname === `/crm/clinicas/${clinicId}`) return true;
  if (pathname === `/crm/clinicas/${clinicId}/conexoes`) return true;
  if (pathname === `/crm/clinicas/${clinicId}/painel`) return true;

  if (/^\/crm\/conversas\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/conversas\/[^/]+\/mensagens$/.test(pathname)) return true;

  return false;
}
