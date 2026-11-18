// Dados legais do VEXO IA — fonte ÚNICA usada pelo rodapé da página pública
// e pelas páginas legais (/privacidade, /termos, /exclusao-de-dados).
//
// `companyName` (razão social) e `cnpj`: quando os dois estão preenchidos
// (ver hasCompanyRegistration), a tela mostra a linha "razão social · CNPJ
// 00.000.000/0001-00" (formatCompanyLine) — nunca escrita na mão em outro
// lugar, sempre a partir destes dois campos.
export const LEGAL_INFO = {
  brandName: "VEXO IA",
  companyName: "70.193.804 MAURO DA SILVA",
  cnpj: "70.193.804/0001-30",
  siteUrl: "https://vexoia.com.br",
  // Só contato@ (inclusive pra privacidade/dados pessoais/exclusão — não
  // existe um e-mail dedicado a isso) e suporte@ — nenhum terceiro e-mail.
  emails: {
    contact: "contato@vexoia.com.br",
    support: "suporte@vexoia.com.br",
  },
  // Data de atualização mostrada nas páginas legais.
  legalUpdatedAt: "18 de novembro de 2026",
} as const;

export function hasCompanyRegistration(info: { companyName: string; cnpj: string } = LEGAL_INFO): boolean {
  return info.companyName.trim() !== "" && info.cnpj.trim() !== "";
}

// "Razão Social Ltda. · CNPJ 00.000.000/0001-00" — só quando os DOIS
// estiverem preenchidos; senão null (nada é exibido).
export function formatCompanyLine(info: { companyName: string; cnpj: string } = LEGAL_INFO): string | null {
  if (!hasCompanyRegistration(info)) return null;
  return `${info.companyName.trim()} · CNPJ ${info.cnpj.trim()}`;
}

// As 4 rotas públicas (sem login) — sitemap e testes.
export const PUBLIC_ROUTES = ["/", "/privacidade", "/termos", "/exclusao-de-dados"] as const;
