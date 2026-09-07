import { createClinic } from "@/app/crm/clinicas/actions";

export default function NewClinicPage() {
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
