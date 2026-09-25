// Como um Lead/agendamento aparece num card (hoje só em ClientPanelView,
// mas extraído pra um arquivo próprio testável — o resto do projeto segue
// esse padrão de manter lógica pura fora de arquivos .tsx, ver follow-up.ts).
//
// Histórico do formato — 2 versões antes desta:
//   1. Só nome (com igUsername como fallback quando não havia nome).
//   2. PR #54/#55: "@handle (Nome)", tudo numa string só, @ primeiro — pra
//      sobreviver ao truncamento do card (que corta do fim) e priorizar o
//      dado que a secretária usa pra achar o perfil de verdade no
//      Instagram.
// Voltou pro nome como elemento PRINCIPAL — pedido explícito depois de ver
// a v2 em produção: "Nome @handle", nome em destaque normal, @ como
// informação secundária (cor mais discreta, fonte menor), sem parênteses.
// Como os dois pedaços precisam de estilo DIFERENTE (não dá mais pra
// devolver uma string só), a função devolve as duas partes separadas — o
// caller (ClientPanelView.tsx) decide como estilizar cada uma.
export type LeadDisplayParts = {
  primary: string;
  // Só preenchido quando name E igUsername existem os dois — sem name, o
  // "primary" já cai pro igUsername sozinho (ver abaixo), e repetir o
  // mesmo @ como secundário seria redundante.
  handle: string | null;
};

export function leadDisplayParts(
  lead: { name: string | null; igUsername: string | null } | null,
  manualTitle: string | null
): LeadDisplayParts {
  if (!lead) return { primary: manualTitle ?? "Agendamento", handle: null };
  if (lead.name && lead.igUsername) return { primary: lead.name, handle: lead.igUsername };
  return { primary: lead.name ?? lead.igUsername ?? "Lead", handle: null };
}
