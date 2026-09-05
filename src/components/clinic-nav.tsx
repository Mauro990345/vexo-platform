import { Columns3, Repeat, Link2, CalendarDays, Settings, Bot, Zap, LayoutDashboard } from "lucide-react";
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
// Agenda, Conexões...) somem da tela ao clicar aqui.
//
// "Conexões" é um item só (não mais 3 separados WhatsApp/Instagram/Google
// Calendar) — leva pro grid com os 3 canais lado a lado (ver
// clinicas/[id]/conexoes/page.tsx); as rotas individuais continuam
// existindo (whatsapp tem QR code, as outras completam o OAuth), só não
// aparecem mais como itens próprios na sidebar.
//
// Ordem pedida pelo usuário: Conexões, Painel, Pipeline, Agenda, Agente de
// IA (config de conversação/IA — separada de Automações), Automações (só o
// que sobrou: lembretes, ativa/inativa, registrar abordagens), Follow-up.
// "Configurações" (tema/aparência) segue como último grupo, sozinho.
//
// "Painel" aponta pra /crm/painel-cliente/[id] (fora da árvore
// /crm/clinicas/[id]/*, ver o comentário daquele arquivo) — abre em nova
// aba (target: "_blank") porque aquela rota não tem sidebar nenhuma; se
// navegasse na aba atual, a sidebar inteira (e todo o resto do menu)
// sumiria sem um caminho de volta além do botão "voltar" do navegador.
export function buildClinicNavGroups(clinicId: string): NavGroup[] {
  const base = `/crm/clinicas/${clinicId}`;

  return [
    {
      label: "Operação",
      items: [
        { href: `${base}/conexoes`, label: "Conexões", icon: <Link2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        {
          href: `/crm/painel-cliente/${clinicId}`,
          label: "Painel ↗",
          icon: <LayoutDashboard className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
          target: "_blank",
        },
        { href: base, label: "Pipeline", icon: <Columns3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: `${base}/agenda`, label: "Agenda", icon: <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
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
