import { notFound } from "next/navigation";
import { Settings, ClipboardList } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { Tabs } from "@/components/Tabs";
import { updateClinicSettings, logApproach } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ClinicAutomationPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id } });
  if (!clinic) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-base font-semibold tracking-tight">Automações</h1>

      {/* Abas horizontais — mesmo padrão do topo do Follow-up (ver
          FollowUpView.tsx): clicar numa aba troca o conteúdo abaixo, sem
          empilhar nada. Substituiu o accordion vertical (CollapsibleSection,
          removido — ficou sem nenhum consumidor) depois de pedido explícito
          pra igualar ao padrão de abas já usado no Follow-up. */}
      <Tabs
        defaultTabId="configuracao"
        tabs={[
          {
            id: "configuracao",
            label: "Configuração",
            icon: <Settings className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Endereço, WhatsApp da clínica e status da clínica.
                </p>

                <form
                  action={updateClinicSettings.bind(null, clinic.id)}
                  className="mt-5 space-y-3 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
                >
                  <div>
                    <label className="mb-1 block text-xs" htmlFor="address">
                      Endereço da clínica
                    </label>
                    <input
                      id="address"
                      name="address"
                      defaultValue={clinic.address ?? ""}
                      placeholder="Rua, número, bairro, cidade"
                      className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    />
                    <p className="mt-1 text-caption text-vexo-muted">
                      Preenche automaticamente a localização do evento no Google Calendar quando um
                      agendamento é confirmado — não precisa digitar em dois lugares.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs" htmlFor="clientWhatsappNumber">
                      WhatsApp da clínica
                    </label>
                    <input
                      id="clientWhatsappNumber"
                      name="clientWhatsappNumber"
                      defaultValue={clinic.clientWhatsappNumber ?? ""}
                      placeholder="+55 11 99999-9999"
                      className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    />
                    <p className="mt-1 text-caption text-vexo-muted">
                      Usado para enviar a confirmação de agendamento ao lead e é o número do link
                      que o lead recebe quando pede para falar com a clínica. Inclua o código do
                      país (55 para o Brasil) e o DDD; espaços, parênteses, traços ou "+" não
                      atrapalham, são removidos automaticamente, mas os dígitos do 55+DDD precisam
                      estar lá.
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="active" defaultChecked={clinic.active} className="rounded border-vexo-border" />
                      Clínica ativa
                    </label>
                    <p className="mt-1 text-caption text-vexo-muted">
                      Mostra a clínica como ativa (bolinha verde) ou inativa (cinza) na lista de
                      Contas e no Painel.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="rounded-lg border border-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
                  >
                    Salvar configuração
                  </button>
                </form>
              </section>
            ),
          },
          {
            id: "abordagens",
            label: "Registrar abordagens de hoje",
            icon: <ClipboardList className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />,
            content: (
              <section>
                <p className="text-xs text-vexo-muted">
                  Registre manualmente quantas pessoas você abordou hoje, caso o sistema ainda não
                  capture isso automaticamente pelo Instagram.
                </p>

                <form
                  action={logApproach.bind(null, clinic.id)}
                  className="mt-5 flex flex-col gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-3.5"
                >
                  <div>
                    <label className="mb-1 block text-xs text-vexo-muted" htmlFor="count">
                      Quantidade abordada hoje
                    </label>
                    <input
                      id="count"
                      name="count"
                      type="number"
                      min={1}
                      required
                      placeholder="ex: 25"
                      className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
                    />
                  </div>
                  <button className="self-start rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90">
                    Registrar
                  </button>
                </form>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
