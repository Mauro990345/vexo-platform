import { Columns3, Repeat, MessageCircle, AtSign, Calendar, CalendarDays, Settings } from "lucide-react";
import type { NavGroup } from "@/components/AppShell";

// Grupos de navegação de UMA clínica específica — usados tanto pelo layout
// da própria clínica (clinicas/[id]/layout.tsx) quanto pela tela de
// conversa individual (conversas/[id]/layout.tsx), já que abrir uma
// conversa continua "dentro" do contexto daquela clínica.
//
// "Follow-up" aponta pro CRM global (/crm/follow-up) de propósito — não é
// esquecimento: a sequência de follow-up é configuração compartilhada por
// todas as clínicas (FollowUpStep/FollowUpSettings não têm clinicId no
// schema), então não existe uma versão "desta clínica" pra linkar. Clicar
// nesse item sai do contexto da clínica pro CRM global, o que é o
// comportamento correto dado o modelo de dados atual.
export function buildClinicNavGroups(clinicId: string): NavGroup[] {
  const base = `/crm/clinicas/${clinicId}`;

  return [
    {
      label: "Operação",
      items: [
        { href: base, label: "Pipeline", icon: <Columns3 className="h-4 w-4 shrink-0" strokeWidth={2} /> },
        { href: "/crm/follow-up", label: "Follow-up", icon: <Repeat className="h-4 w-4 shrink-0" strokeWidth={2} /> },
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
