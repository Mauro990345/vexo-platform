import { prisma } from "@/lib/prisma";
import { createClinic } from "@/app/crm/clinicas/actions";

export const dynamic = "force-dynamic";

// "Copiar configurações de:" (item 1 do pedido, snapshot) — lista todas as
// clínicas existentes pra popular o <select> abaixo; padrão "Nenhuma" (sem
// copiar nada, comportamento de sempre). Ver createClinic (crm/clinicas/
// actions.ts) pro que exatamente é copiado quando uma é escolhida.
export default async function NewClinicPage() {
  const clinics = await prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Nova clínica</h1>
      <form action={createClinic} className="space-y-4 rounded-2xl border border-vexo-border bg-vexo-surface p-5">
        <div>
          <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="name">
            Nome da clínica
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="address">
            Endereço (opcional)
          </label>
          <input
            id="address"
            name="address"
            placeholder="Rua, número, bairro, cidade"
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
          />
          <p className="mt-1 text-xs text-vexo-muted">
            Preenche automaticamente a localização do evento no Google Calendar quando um
            agendamento é confirmado — dá pra preencher ou ajustar depois em Automações.
          </p>
        </div>

        {clinics.length > 0 && (
          <div className="border-t border-vexo-border pt-4">
            <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="copyFromClinicId">
              Copiar configurações de
            </label>
            <select
              id="copyFromClinicId"
              name="copyFromClinicId"
              defaultValue=""
              className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
            >
              <option value="">Nenhuma</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-vexo-muted">
              Copia lembretes, prazos de retorno, tentativas do Quente, limites diários de envio e
              o prompt do agente de IA da clínica escolhida — nunca conexões, dados específicos
              (endereço, briefing, vídeo de confirmação), leads, conversas ou agendamentos. As duas
              clínicas ficam totalmente independentes depois — alterar uma não muda a outra.
            </p>
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-vexo-accent px-3 py-2 text-sm font-medium text-vexo-accentFg hover:opacity-90"
        >
          Criar clínica
        </button>
        <p className="text-xs text-vexo-muted">
          Após criar, entre na clínica pra conectar o Instagram e o Google Calendar, colar o
          prompt de conversação e criar o login do painel do cliente.
        </p>
      </form>
    </div>
  );
}
