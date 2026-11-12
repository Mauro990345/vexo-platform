// Dados legais do VEXO IA — fonte ÚNICA usada pelo rodapé da página pública
// e pelas páginas legais (/privacidade, /termos, /exclusao-de-dados).
//
// `companyName` (razão social) e `cnpj` ficam VAZIOS enquanto a empresa não
// tiver CNPJ: a tela só mostra esses dados quando estiverem preenchidos
// (ver hasCompanyRegistration) — nunca um placeholder. Quando o CNPJ existir,
// basta preencher os dois campos aqui.
export const LEGAL_INFO = {
  brandName: "VEXO IA",
  companyName: "",
  cnpj: "",
  siteUrl: "https://vexoia.com.br",
  emails: {
    contact: "contato@vexoia.com.br",
    support: "suporte@vexoia.com.br",
    privacy: "privacidade@vexoia.com.br",
  },
  // Data de atualização mostrada nas páginas legais.
  legalUpdatedAt: "12 de novembro de 2026",
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
