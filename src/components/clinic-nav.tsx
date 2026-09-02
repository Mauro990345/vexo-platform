import { Columns3, Repeat, MessageCircle, AtSign, Calendar, CalendarDays, Settings } from "lucide-react";
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
export function buildClinicNavGroups(clinicId: string): NavGroup[] {
  const base = `/crm/clinicas/${clinicId}`;

  return [
    {
      label: "Operação",
      items: [
        { href: base, label: "Pipeline", icon: <Columns3 className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: `${base}/follow-up`, label: "Follow-up", icon: <Repeat className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: `${base}/agenda`, label: "Agenda", icon: <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={2} /> },
      ],
    },
    {
      label: "Conexões",
      items: [
        { href: `${base}/whatsapp`, label: "WhatsApp", icon: <MessageCircle className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: `${base}/instagram`, label: "Instagram", icon: <AtSign className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: `${base}/google-calendar`, label: "Google Calendar", icon: <Calendar className="h-4 w-4 shrink-0" strokeWidth={2} /> },
      ],
    },
    {
      label: "Configurações",
      items: [
        { href: `${base}/configuracoes`, label: "Ajustes", icon: <Settings className="h-4 w-4 shrink-0" strokeWidth={2} /> },
      ],
    },
  ];
}
