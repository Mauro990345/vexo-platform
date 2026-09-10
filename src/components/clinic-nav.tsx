import { Columns3, Repeat, Link2, Settings, Bot, Zap, LayoutDashboard } from "lucide-react";
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
// "Configurações" (tema/aparência) segue como último grupo, sozinho.
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
// acessível a partir de dentro do painel da clínica (link "Ver painel de
// todas as clínicas" em clinicas/[id]/painel/page.tsx) pra quem quiser.
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
          // alcançada a partir de lá (card WhatsApp -> "Gerenciar") — sem
          // isso, "Pipeline" ficava destacado por engano nessa tela (ver
          // comentário em resolveActiveHref, AppShell.tsx).
          activeMatch: [`${base}/whatsapp`],
        },
        { href: `${base}/painel`, label: "Painel", icon: <LayoutDashboard className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: base, label: "Pipeline", icon: <Columns3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/agente-ia`, label: "Agente de IA", icon: <Bot className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/automacoes`, label: "Automações", icon: <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/follow-up`, label: "Follow-up", icon: <Repeat className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
      ],
    },
    {
      label: "Configurações",
      items: [
        { href: `${base}/configuracoes`, label: "Configurações", icon: <Settings className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
      ],
    },
  ];
}
