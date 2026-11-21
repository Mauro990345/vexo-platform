import { Columns3, Repeat, Gift, Link2, Activity, Bot, Zap, LayoutDashboard, ClipboardList } from "lucide-react";
import type { NavGroup } from "@/components/AppShell";

// Grupos de navegação de UMA clínica específica — usados tanto pelo layout
// da própria clínica (clinicas/[id]/layout.tsx) quanto pela tela de
// conversa individual (conversas/[id]/layout.tsx), já que abrir uma
// conversa continua "dentro" do contexto daquela clínica.
//
// "Follow-up" aponta pra rota /crm/clinicas/[id]/follow-up, não pro CRM
// global — a config em si é compartilhada por todas as clínicas
// (FollowUpStep/FollowUpSettings não têm clinicId no schema), mas a rota
// dentro do contexto da clínica renderiza a MESMA config (ver FollowUpView)
// só que sem trocar a sidebar pra global, senão os outros itens (Pipeline,
// Conexões...) somem da tela ao clicar aqui.
//
// "Conexões" é um item só (não mais 3 separados WhatsApp/Instagram/Google
// Calendar) — leva pro grid com os 3 canais lado a lado (ver
// clinicas/[id]/conexoes/page.tsx); as rotas individuais continuam
// existindo (whatsapp tem QR code, as outras completam o OAuth), só não
// aparecem mais como itens próprios na sidebar.
//
// Ordem pedida pelo usuário: Conexões, Painel, Pipeline, Agente de IA
// (config de conversação/IA — separada de Automações), Automações (só o
// que sobrou: lembretes, ativa/inativa, registrar abordagens), Follow-up.
// O grupo "Status" voltou (tinha sido removido na PR #259, quando o menu
// GLOBAL ganhou seu próprio link "Status" com badge — ver
// crm/(global)/layout.tsx): na prática, só o link global forçava sair da
// clínica (clicar em "Contas") pra checar/resolver uma falha dela — pedido
// explícito pra restaurar o atalho por clínica de volta, agora com os DOIS
// links coexistindo (global = todas as clínicas; este = só esta). A rota
// /crm/clinicas/[id]/status nunca foi tocada em nenhuma dessas idas e
// vindas — sempre existiu e sempre funcionou, com ou sem item de menu
// apontando pra ela.
// (A Agenda — grade semanal — existiu aqui entre Pipeline e Agente de IA e
// foi removida do sistema: a integração com o Google Calendar da clínica
// continua normal, só a tela/visualização saiu.)
//
// "Painel" aponta pra /crm/clinicas/[id]/painel — o painel DESTA clínica
// específica, dentro da própria árvore de rotas da clínica, então mantém
// a sidebar (Pipeline, Follow-up...) visível o tempo todo. Não é mais o
// atalho pra /crm/painel (a visão geral de TODAS as clínicas) — aquilo
// tirava o usuário do contexto da clínica que estava vendo, trocando a
// sidebar inteira pela global só com "Contas". A visão geral continua
// acessível por "Contas" no menu global a qualquer momento — por isso
// clinicas/[id]/painel/page.tsx não tem mais link nenhum de volta pra ela
// (era redundante, "Contas" já mostra a lista de todas as clínicas).
export function buildClinicNavGroups(clinicId: string, statusFailedCount = 0): NavGroup[] {
  const base = `/crm/clinicas/${clinicId}`;

  return [
    {
      label: "Operação",
      items: [
        {
          href: `${base}/conexoes`,
          label: "Conexões",
          icon: <Link2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
          // "/whatsapp" é rota irmã (não filha) de "/conexoes" na URL, mas é
          // alcançada a partir de lá (card WhatsApp -> "Conectar", quando
          // ainda não conectado — leva pra tela do QR code) — sem isso,
          // "Pipeline" ficava destacado por engano nessa tela (ver
          // comentário em resolveActiveHref, AppShell.tsx).
          activeMatch: [`${base}/whatsapp`],
        },
        { href: `${base}/painel`, label: "Painel", icon: <LayoutDashboard className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: base, label: "Pipeline", icon: <Columns3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/briefing`, label: "Briefing", icon: <ClipboardList className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/agente-ia`, label: "Agente de IA", icon: <Bot className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/automacoes`, label: "Automações", icon: <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/follow-up`, label: "Follow-up", icon: <Repeat className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        // Guia "Bônus Full Face" (ver /crm/clinicas/[id]/bonus) — sempre
        // visível pro admin, independente do interruptor da conta (que só
        // controla a aba no Painel da CLIENTE).
        { href: `${base}/bonus`, label: "Bônus", icon: <Gift className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
      ],
    },
    {
      label: "Status",
      items: [
        {
          href: `${base}/status`,
          label: "Status",
          icon: <Activity className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
          // Mesmo badge (vexo-error, só quando > 0) do "Status" do menu
          // global (PR #258, AppShell.tsx) — aqui a contagem já vem
          // filtrada só pra esta clínica (ver clinicas/[id]/layout.tsx e
          // conversas/[id]/layout.tsx, que calculam com o MESMO where da
          // própria página de Status: status "FAILED" + conversation.clinicId).
          badge: statusFailedCount > 0 ? statusFailedCount : undefined,
        },
      ],
    },
  ];
}

// Sidebar do login Revisor (ver UserRole.REVIEWER/DESIGN.md) — só os 3
// itens que ele pode ver, nada mais. Lista FIXA de propósito (não um
// filtro de buildClinicNavGroups): não depende de manter as duas listas
// "sincronizadas" por acidente — qualquer item novo em buildClinicNavGroups
// não aparece aqui a menos que seja adicionado explicitamente, reforçando
// a regra "negar por padrão" também na sidebar (a página em si já nega por
// requireInternalOrReviewerSession; isto aqui é só não oferecer o link).
export function buildReviewerNavGroups(clinicId: string): NavGroup[] {
  const base = `/crm/clinicas/${clinicId}`;

  return [
    {
      label: "Operação",
      items: [
        { href: `${base}/conexoes`, label: "Conexões", icon: <Link2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/painel`, label: "Painel", icon: <LayoutDashboard className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: base, label: "Pipeline", icon: <Columns3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
      ],
    },
  ];
}
