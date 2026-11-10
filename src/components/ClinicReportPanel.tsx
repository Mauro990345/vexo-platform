"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import {
  getClinicReportPanelData,
  updateClinicReportConfig,
  sendClinicReportNow,
  regenerateClinicReportLink,
  revokeClinicReportLink,
  type ClinicReportPanelData,
  type ClinicReportConfigView,
} from "@/app/crm/clinicas/report-actions";
import type { ReportFrequency, MonthlyDayMode } from "@/lib/report-period";

// Botão "Relatório" (lista de Contas) + painel compacto de configuração —
// mesmo padrão de modal já usado em ClientAccessModal.tsx (overlay +
// Escape pra fechar), mesmo padrão de "pending/copiado/erro" local de
// BriefingLinkSection.tsx. SOMENTE ADMIN: toda ação daqui chama uma
// server action de report-actions.ts, e cada uma delas já exige
// requireInternalSession no servidor — o bloqueio real não é este
// componente nunca renderizar pro cliente (ele nem aparece fora de /crm,
// que já é protegido inteiro), é o SERVIDOR recusar a chamada mesmo que
// alguém tentasse invocar a action direto.
//
// "Ver relatório" abre /crm/clinicas/[id]/relatorio-preview numa aba nova
// do NAVEGADOR (target="_blank") — não é uma aba nova do VEXO (pedido
// explícito: "NÃO criar aba nova dentro da clínica" — essa rota nem
// aparece na navegação da clínica, ver clinic-nav.tsx, só é alcançável
// por este link).
const FREQUENCY_OPTIONS: { value: ReportFrequency; label: string }[] = [
  { value: "MONTHLY", label: "Mensal" },
  { value: "BIWEEKLY", label: "Quinzenal" },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateTimeBr(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

const STATUS_LABEL: Record<"SENT" | "FAILED", string> = { SENT: "Enviado", FAILED: "Falhou" };
const STATUS_DOT: Record<"SENT" | "FAILED", string> = { SENT: "bg-vexo-success", FAILED: "bg-vexo-error" };

export function ClinicReportTrigger({ clinicId, clinicName, nextSendDateLabel }: { clinicId: string; clinicName: string; nextSendDateLabel: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 whitespace-nowrap rounded-md border border-vexo-border px-2 py-1 text-card text-vexo-muted hover:border-vexo-accent hover:text-vexo-accent"
      >
        Relatório{nextSendDateLabel && <span className="text-vexo-muted"> · {nextSendDateLabel}</span>}
      </button>

      {open && <ClinicReportModal clinicId={clinicId} clinicName={clinicName} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ClinicReportModal({ clinicId, clinicName, onClose }: { clinicId: string; clinicName: string; onClose: () => void }) {
  const [data, setData] = useState<ClinicReportPanelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getClinicReportPanelData(clinicId).then((d) => {
      if (active) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [clinicId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-vexo-border bg-vexo-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Relatório de resultados</h2>
            <p className="truncate text-caption text-vexo-muted">{clinicName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0 text-vexo-muted hover:text-vexo-fg">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {loading || !data ? (
          <p className="text-xs text-vexo-muted">Carregando…</p>
        ) : (
          <ClinicReportPanelBody clinicId={clinicId} initialData={data} onUpdate={setData} />
        )}
      </div>
    </div>
  );
}

export function ClinicReportPanelBody({
  clinicId,
  initialData,
  onUpdate,
}: {
  clinicId: string;
  initialData: ClinicReportPanelData;
  onUpdate: (data: ClinicReportPanelData) => void;
}) {
  const [data, setData] = useState(initialData);
  const [form, setForm] = useState<ClinicReportConfigView>(initialData.config!);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  function update(patch: Partial<ClinicReportConfigView>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await updateClinicReportConfig(clinicId, {
        whatsappNumber: form.whatsappNumber ?? "",
        frequency: form.frequency,
        monthlyDayMode: form.monthlyDayMode,
        monthlyFixedDay: form.monthlyFixedDay,
        sendHour: form.sendHour,
        sendMinute: form.sendMinute,
        autoSendEnabled: form.autoSendEnabled,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      const refreshed = await getClinicReportPanelData(clinicId);
      setData(refreshed);
      onUpdate(refreshed);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    setSending(true);
    setSendNotice(null);
    try {
      const result = await sendClinicReportNow(clinicId);
      setSendNotice(describeSendResult(result));
      const refreshed = await getClinicReportPanelData(clinicId);
      setData(refreshed);
      onUpdate(refreshed);
    } finally {
      setSending(false);
    }
  }

  async function handleCopy() {
    if (!data.latestDelivery?.url) return;
    try {
      await navigator.clipboard.writeText(data.latestDelivery.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // URL já fica visível na tela pra copiar manualmente nesse caso.
    }
  }

  async function handleRegenerate() {
    if (!data.latestDelivery) return;
    setLinkBusy(true);
    try {
      await regenerateClinicReportLink(data.latestDelivery.id);
      const refreshed = await getClinicReportPanelData(clinicId);
      setData(refreshed);
      onUpdate(refreshed);
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleRevoke() {
    if (!data.latestDelivery) return;
    if (!window.confirm("Revogar este link? Quem já tiver o link recebido por WhatsApp não consegue mais abrir o relatório.")) return;
    setLinkBusy(true);
    try {
      await revokeClinicReportLink(data.latestDelivery.id);
      const refreshed = await getClinicReportPanelData(clinicId);
      setData(refreshed);
      onUpdate(refreshed);
    } finally {
      setLinkBusy(false);
    }
  }

  const delivery = data.latestDelivery;

  return (
    <div className="space-y-3 text-xs">
      <Card surface="surface2" className="space-y-2.5">
        <div>
          <label className="mb-1 block text-vexo-muted">Número de WhatsApp que recebe o relatório</label>
          <input
            value={form.whatsappNumber ?? ""}
            onChange={(e) => update({ whatsappNumber: e.target.value })}
            placeholder="Ex: 11988887777"
            className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 outline-none focus:border-vexo-accent"
          />
          <p className="mt-1 text-caption text-vexo-muted">
            Diferente do WhatsApp que a clínica usa com pacientes — normalmente o celular pessoal da dona/responsável.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-vexo-muted">Frequência</label>
          <div className="flex gap-1.5">
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ frequency: opt.value, monthlyFixedDay: opt.value === "BIWEEKLY" ? null : form.monthlyFixedDay })}
                className={`flex-1 rounded-control border px-control-x py-control-y font-medium transition ${
                  form.frequency === opt.value ? "border-vexo-accent bg-vexo-accent/15 text-vexo-accent" : "border-vexo-border text-vexo-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {form.frequency === "MONTHLY" ? (
          <div>
            <label className="mb-1 block text-vexo-muted">Dia do envio</label>
            <div className="flex items-center gap-2">
              <select
                value={form.monthlyDayMode}
                onChange={(e) => update({ monthlyDayMode: e.target.value as MonthlyDayMode, monthlyFixedDay: e.target.value === "LAST_DAY" ? null : form.monthlyFixedDay ?? 1 })}
                className="rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 outline-none focus:border-vexo-accent"
              >
                <option value="LAST_DAY">Último dia do mês</option>
                <option value="FIXED_DAY">Dia fixo</option>
              </select>
              {form.monthlyDayMode === "FIXED_DAY" && (
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={form.monthlyFixedDay ?? 1}
                  onChange={(e) => update({ monthlyFixedDay: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 outline-none focus:border-vexo-accent"
                />
              )}
            </div>
          </div>
        ) : (
          <p className="text-vexo-muted">Dia do envio: sempre dia 15 e último dia do mês (fixo).</p>
        )}

        <div>
          <label className="mb-1 block text-vexo-muted">Horário do envio (Brasília)</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={23}
              value={form.sendHour}
              onChange={(e) => update({ sendHour: Number(e.target.value) })}
              className="w-14 rounded-lg border border-vexo-border bg-vexo-bg px-2 py-1.5 text-center outline-none focus:border-vexo-accent"
            />
            <span className="text-vexo-muted">:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={form.sendMinute}
              onChange={(e) => update({ sendMinute: Number(e.target.value) })}
              className="w-14 rounded-lg border border-vexo-border bg-vexo-bg px-2 py-1.5 text-center outline-none focus:border-vexo-accent"
            />
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.autoSendEnabled} onChange={(e) => update({ autoSendEnabled: e.target.checked })} className="rounded border-vexo-border accent-vexo-accent" />
          Envio automático
        </label>

        {saveError && <p className="text-vexo-error">{saveError}</p>}

        <Button type="button" variant="outline" onClick={handleSave} disabled={saving} className="w-full justify-center">
          {saving ? "Salvando…" : saved ? "Salvo ✓" : "Salvar configuração"}
        </Button>
      </Card>

      <Card surface="surface2" className="space-y-1.5">
        {data.nextSendDateLabel && (
          <p className="text-vexo-muted">
            Próximo envio: <span className="text-vexo-fg">{data.nextSendDateLabel}</span> às {pad2(form.sendHour)}h{pad2(form.sendMinute)}
          </p>
        )}
        {delivery ? (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-vexo-muted">
                Último envio: <span className="text-vexo-fg">{delivery.periodLabel}</span> ({delivery.dateRange})
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-vexo-muted">
                {delivery.status && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[delivery.status]}`} />}
                {delivery.status ? STATUS_LABEL[delivery.status] : "Pendente"}
                {delivery.status === "FAILED" && ` · tentativa ${delivery.attempt} de 3`}
                {" · "}
                {formatDateTimeBr(delivery.sentAt ?? delivery.lastAttemptAt)}
              </p>
              {delivery.lastError && <p className="mt-0.5 text-vexo-error">{delivery.lastError}</p>}
            </div>
          </div>
        ) : (
          <p className="text-vexo-muted">Nenhum relatório enviado ainda.</p>
        )}
      </Card>

      {sendNotice && <p className="text-vexo-muted">{sendNotice}</p>}

      <div className="flex gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={handleSendNow} disabled={sending} className="flex-1">
          {sending ? "Enviando…" : "Enviar agora"}
        </Button>
        <Link
          href={data.previewUrl}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center rounded-control border border-vexo-border px-control-x py-control-y font-medium text-vexo-muted hover:border-vexo-accent hover:text-vexo-accent"
        >
          Ver relatório
        </Link>
      </div>

      {delivery?.url && (
        <div className="space-y-1">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-vexo-accent px-control-x py-control-y font-medium text-vexo-accent hover:bg-vexo-accent/10"
            >
              {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
              {copied ? "Copiado!" : "Copiar link"}
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={linkBusy}
              title="Gerar um link novo (invalida o atual)"
              className="shrink-0 rounded-control border border-vexo-border px-2 text-vexo-muted hover:border-vexo-accent hover:text-vexo-accent disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={linkBusy}
              className="shrink-0 rounded-control border border-vexo-border px-2 text-card text-vexo-muted hover:border-vexo-error hover:text-vexo-error disabled:opacity-50"
            >
              Revogar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function describeSendResult(result: { ok: boolean; alreadySent?: boolean; reason?: string }): string {
  if (result.ok) return result.alreadySent ? "Já tinha um envio registrado pra este período." : "Enviado com sucesso.";
  switch (result.reason) {
    case "restricted_to_demo":
      return "Restrito à Clínica Demo durante a fase de testes (ver CLINIC_REPORT_SEND_RESTRICTED_TO_DEMO).";
    case "not_configured":
      return "Informe o número de WhatsApp antes de enviar.";
    case "self_send_blocked":
      return "O número do relatório é igual ao da conexão da clínica — mudar o número antes de enviar.";
    case "whatsapp_not_connected":
      return "Clínica sem WhatsApp conectado.";
    default:
      return "Falha ao enviar — veja o erro no status abaixo.";
  }
}
