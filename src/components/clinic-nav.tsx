import { Columns3, Repeat, Gift, Link2, Bot, Zap, LayoutDashboard, ClipboardList } from "lucide-react";
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
// O grupo "Status" (que existia aqui, sozinho, no lugar onde
// "Configurações" ficava) foi removido: agora há um único link "Status"
// no menu GLOBAL (grupo "Operação" de crm/(global)/layout.tsx), com badge
// de contagem de falhas — repetir o mesmo link dentro de cada clínica
// ficava redundante. A rota /crm/clinicas/[id]/status (filtrada pra esta
// clínica) continua existindo e funcionando normalmente — só não tem mais
// item de menu apontando pra ela aqui; quem chegar até ela pelo menu
// global vê o diagnóstico de todas as clínicas, e quem precisar do
// recorte por clínica ainda pode abrir a URL direto.
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
export function buildClinicNavGroups(clinicId: string): NavGroup[] {
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
