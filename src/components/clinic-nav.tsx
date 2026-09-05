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
// "Painel" aqui é o MESMO destino do item "Painel" da sidebar global
// (crm/(global)/layout.tsx): /crm/painel, a lista com o card de métricas +
// "Ver painel de [clínica] ↗" de TODAS as clínicas — não um atalho direto
// pro painel desta clínica específica. Antes, pra chegar em /crm/painel de
// dentro de uma clínica, precisava voltar pra "Contas" primeiro; agora dá
// pra ir direto. Sem target="_blank": /crm/painel tem sidebar própria (o
// mesmo layout global), então navegar na mesma aba não perde menu nenhum
// — diferente de /crm/painel-cliente/[id], que é a página sem chrome
// nenhum (essa continua só alcançável pelo botão "Ver painel de [clínica]
// ↗" de dentro de /crm/painel, que aí sim abre em nova aba).
export function buildClinicNavGroups(clinicId: string): NavGroup[] {
  const base = `/crm/clinicas/${clinicId}`;

  return [
    {
      label: "Operação",
      items: [
        { href: `${base}/conexoes`, label: "Conexões", icon: <Link2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
        { href: "/crm/painel", label: "Painel", icon: <LayoutDashboard className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> },
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
