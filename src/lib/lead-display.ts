// Como um Lead/agendamento aparece num card (hoje só em ClientPanelView,
// mas extraído pra um arquivo próprio testável — o resto do projeto segue
// esse padrão de manter lógica pura fora de arquivos .tsx, ver follow-up.ts).
//
// Ajuste sobre a primeira versão (PR #54): aquela mostrava o @ só quando
// name E igUsername existiam os dois — mas contra dados reais, a maioria
// dos leads ainda não tinha igUsername salvo (a captura automática do
// handle real via Conversations API, ver
// getInstagramConversationParticipantUsername em instagram.ts, é recente;
// leads mais antigos dependem do backfill, ver lead-username-backfill.ts, e
// leads sem handle disponível continuam sem @ mesmo depois disso, já que a
// Meta não garante esse dado em toda conversa). Resultado: o card caía
// sempre no fallback de só nome, exatamente o bug reportado.
//
// Formato exato pedido: "@handle (Nome)" — @ primeiro (é o que a
// secretária usa pra achar o perfil de verdade no Instagram, por isso vem
// antes e sobrevive ao truncamento do card, que corta do fim pro início),
// nome entre parênteses depois, só quando os dois existem. Sem igUsername,
// cai pro nome sozinho — não dá pra inventar um @ que a Meta não devolveu.
export function leadDisplayLabel(
  lead: { name: string | null; igUsername: string | null } | null,
  manualTitle: string | null
): string {
  if (!lead) return manualTitle ?? "Agendamento";
  if (lead.igUsername && lead.name) return `@${lead.igUsername} (${lead.name})`;
  if (lead.igUsername) return `@${lead.igUsername}`;
  return lead.name ?? "Lead";
}
