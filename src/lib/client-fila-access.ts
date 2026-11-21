// Gate de pathname pro segundo link de acesso do cliente (ClientFilaLink,
// `scope: "fila"` no JWT — ver acesso-fila/[token]/route.ts e
// middleware.ts) — mesmo espírito/molde de isReviewerAllowedPath
// (reviewer-access.ts): decisão só por PATHNAME, sem tocar banco, pra
// cobrir automaticamente qualquer rota nova que apareça amanhã sob
// /dashboard sem precisar lembrar de negar nela (negar por padrão).
//
// Única rota liberada: /dashboard/fila (e tudo embaixo dela, se um dia
// existir uma sub-rota). Qualquer outra coisa sob /dashboard (o painel em
// si, /dashboard/bonus, o que vier a existir) é negada — regra de
// segurança pedida explicitamente: quem só tem o link da Fila NUNCA
// alcança o painel, mesmo digitando a URL direto.
export function isFilaScopeAllowedPath(pathname: string): boolean {
  return pathname === "/dashboard/fila" || pathname.startsWith("/dashboard/fila/");
}
