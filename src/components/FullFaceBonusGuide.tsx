"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClientPanelTabs } from "@/components/ClientPanelTabs";
import { Check, ChevronRight, Copy, Home, ListChecks, Maximize2 } from "lucide-react";
import {
  BONUS_CHECKLIST,
  BONUS_CHECKLIST_SCREEN,
  BONUS_MESSAGES,
  BONUS_OVERVIEW,
  BONUS_SCREENS,
  BONUS_STEPS,
  adjacentBonusScreen,
  type BonusScreenId,
  type BonusStep,
  type ScriptBlock,
} from "@/lib/full-face-bonus-content";

// Guia "Bônus Full Face" — uma tela por vez (Visão geral, Passos 1–7,
// Checklist e mensagens), menu lateral próprio (faixa horizontal só com os
// números no celular), setas do teclado, "Modo call" e caixas de marcar
// salvas SÓ no navegador (localStorage, sempre dentro de try/catch — nada
// vai pro banco). Conteúdo em @/lib/full-face-bonus-content.
//
// Tamanhos: no PC segue a escala compacta do VEXO (text-xs/text-sm); só no
// celular (abaixo de sm) o texto sobe pra no mínimo 16px.

type CheckState = Record<string, boolean>;

const HASH_BY_SCREEN = (id: BonusScreenId): string =>
  id === "overview" ? "visao-geral" : id === "checklist" ? "checklist" : `passo-${id.slice("step-".length)}`;

function screenFromHash(hash: string): BonusScreenId | null {
  const h = hash.replace(/^#/, "");
  if (h === "visao-geral") return "overview";
  if (h === "checklist") return "checklist";
  const m = /^passo-(\d+)$/.exec(h);
  if (m) {
    const id = `step-${m[1]}` as BonusScreenId;
    return BONUS_SCREENS.includes(id) ? id : null;
  }
  return null;
}

function readStore(key: string): CheckState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CheckState) : {};
  } catch {
    return {};
  }
}

function writeStore(key: string, value: CheckState) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navegador sem storage (aba anônima, bloqueado) — segue só em memória.
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const actionKey = (step: number, i: number) => `${step}-${i}`;
const checklistKey = (group: string, i: number) => `${group}-${i}`;

// Duas formas de uso: `tabs` (Painel do cliente, /dashboard/bonus e "Ver
// painel": abas "Painel / Bônus Full Face" no topo) ou `header` (item
// "Bônus" do menu lateral da clínica no CRM, /crm/clinicas/[id]/bonus —
// dentro do AppShell do admin, sem as abas da cliente). No modo admin o
// menu interno do guia só vira lateral a partir de lg, porque a sidebar do
// AppShell já ocupa espaço; o modo cliente continua igual (md).
export function FullFaceBonusGuide({
  storageKey,
  tabs,
  header,
}: {
  storageKey: string;
  tabs?: { panelHref: string; bonusHref: string };
  header?: React.ReactNode;
}) {
  const inAdmin = !tabs;
  const actionsKey = `${storageKey}:acoes`;
  const checklistStoreKey = `${storageKey}:checklist`;

  const [screen, setScreen] = useState<BonusScreenId>("overview");
  const [callMode, setCallMode] = useState(false);
  const [actions, setActions] = useState<CheckState>({});
  const [checklist, setChecklist] = useState<CheckState>({});
  const topRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Lê storage/hash só depois de montar (evita divergência de hidratação).
  useEffect(() => {
    setActions(readStore(actionsKey));
    setChecklist(readStore(checklistStoreKey));
    const fromHash = screenFromHash(window.location.hash);
    if (fromHash) setScreen(fromHash);
    function onHash() {
      const id = screenFromHash(window.location.hash);
      if (id) setScreen(id);
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [actionsKey, checklistStoreKey]);

  const go = useCallback((id: BonusScreenId) => {
    setScreen(id);
    try {
      window.history.replaceState(null, "", `#${HASH_BY_SCREEN(id)}`);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ block: "start" });
  }, [screen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox")) return;
      if (t && (t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const next = adjacentBonusScreen(screen, e.key === "ArrowLeft" ? -1 : 1);
      if (next) {
        e.preventDefault();
        go(next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, go]);

  function toggleAction(key: string) {
    setActions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeStore(actionsKey, next);
      return next;
    });
  }
  function toggleChecklist(key: string) {
    setChecklist((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeStore(checklistStoreKey, next);
      return next;
    });
  }
  function resetChecklist() {
    setChecklist({});
    writeStore(checklistStoreKey, {});
  }

  const doneCount = (step: BonusStep) => step.actions.filter((_, i) => actions[actionKey(step.number, i)]).length;

  // Escala de texto: compacta no PC; mínimo 16px no celular; maior no Modo call.
  const s = callMode
    ? {
        body: "text-[19px] sm:text-lg",
        small: "text-[17px] sm:text-base",
        label: "text-[16px] sm:text-sm",
        h1: "text-[26px] sm:text-2xl",
        h2: "text-[20px] sm:text-xl",
        phrase: "text-[21px] sm:text-xl",
      }
    : {
        body: "text-[16px] sm:text-sm",
        small: "text-[16px] sm:text-xs",
        label: "text-[16px] sm:text-[11px]",
        h1: "text-[22px] sm:text-lg",
        h2: "text-[17px] sm:text-sm",
        phrase: "text-[18px] sm:text-base",
      };

  const current = screen.startsWith("step-") ? BONUS_STEPS.find((st) => `step-${st.number}` === screen) : undefined;

  const callButton = (
    <button
            type="button"
            onClick={() => setCallMode((v) => !v)}
            aria-pressed={callMode}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[16px] font-medium sm:text-xs ${
              callMode
                ? "border-vexo-accent bg-vexo-accent text-vexo-accentFg hover:opacity-90"
                : "border-vexo-border text-vexo-fg hover:border-vexo-accent"
            }`}
          >
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
            Modo call
          </button>
  );

  return (
    <div ref={topRef} className="scroll-mt-4">
      {tabs ? (
        <ClientPanelTabs active="bonus" panelHref={tabs.panelHref} bonusHref={tabs.bonusHref} trailing={callButton} />
      ) : (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">{header}</div>
          <div className="shrink-0">{callButton}</div>
        </div>
      )}

      <div
        className={
          callMode
            ? ""
            : inAdmin
              ? "lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6"
              : "md:grid md:grid-cols-[230px_minmax(0,1fr)] md:gap-6"
        }
      >
        {!callMode && (
          <>
            {/* Celular: faixa horizontal rolável só com os números */}
            <nav className={`-mx-4 mb-4 overflow-x-auto px-4 ${inAdmin ? "lg:hidden" : "md:hidden"}`} aria-label="Telas do guia">
              <div className="flex w-max gap-1.5">
                {BONUS_SCREENS.map((id) => {
                  const active = id === screen;
                  const label =
                    id === "overview" ? (
                      <Home className="h-4 w-4" strokeWidth={2} aria-label="Visão geral" />
                    ) : id === "checklist" ? (
                      <ListChecks className="h-4 w-4" strokeWidth={2} aria-label="Checklist e mensagens" />
                    ) : (
                      id.slice("step-".length)
                    );
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => go(id)}
                      aria-current={active ? "step" : undefined}
                      className={`flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-[16px] font-medium ${
                        active ? "border-vexo-accent bg-vexo-accent/15 text-vexo-accent" : "border-vexo-border bg-vexo-surface text-vexo-fg/80"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* PC/tablet: menu lateral */}
            <nav className={inAdmin ? "hidden lg:block" : "hidden md:block"} aria-label="Telas do guia">
              <div className="sticky top-4 space-y-0.5 rounded-xl border border-vexo-border bg-vexo-surface p-1.5">
                <SideItem active={screen === "overview"} onClick={() => go("overview")}>
                  <Home className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  <span className="min-w-0 flex-1 truncate">Visão geral</span>
                </SideItem>
                {BONUS_STEPS.map((st) => {
                  const id = `step-${st.number}` as BonusScreenId;
                  const done = doneCount(st);
                  return (
                    <SideItem key={id} active={screen === id} onClick={() => go(id)}>
                      <span className="w-3.5 shrink-0 text-center font-semibold text-vexo-muted">{st.number}</span>
                      <span className="min-w-0 flex-1 truncate" title={st.title}>
                        {st.title}
                      </span>
                      <span className={`shrink-0 text-caption tabular-nums ${done === st.actions.length ? "text-vexo-success" : "text-vexo-muted"}`}>
                        {done}/{st.actions.length}
                      </span>
                    </SideItem>
                  );
                })}
                <SideItem active={screen === "checklist"} onClick={() => go("checklist")}>
                  <ListChecks className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  <span className="min-w-0 flex-1 truncate">Checklist e mensagens</span>
                </SideItem>
              </div>
            </nav>
          </>
        )}

        <main className={`min-w-0 ${callMode ? "mx-auto max-w-4xl" : "max-w-3xl"}`}>
          {screen === "overview" && (
            <div className="space-y-5">
              <header>
                <p className={`${s.label} font-semibold uppercase tracking-wide text-vexo-accent`}>{BONUS_OVERVIEW.eyebrow}</p>
                <h1 className={`mt-1 ${s.h1} font-semibold leading-tight tracking-tight`}>{BONUS_OVERVIEW.title}</h1>
                <p className={`mt-1.5 ${s.body} text-vexo-muted`}>{BONUS_OVERVIEW.subtitle}</p>
              </header>

              <section>
                <h2 className={`${s.label} font-semibold uppercase tracking-wide text-vexo-muted`}>Como usar</h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {BONUS_OVERVIEW.howTo.map((c) => (
                    <div key={c.title} className="rounded-xl border border-vexo-border bg-vexo-surface p-3">
                      <p className={`${s.body} font-semibold`}>{c.title}</p>
                      <p className={`mt-0.5 ${s.small} text-vexo-muted`}>{c.text}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className={`${s.label} font-semibold uppercase tracking-wide text-vexo-muted`}>Os 7 passos</h2>
                <ol className="mt-2 space-y-1.5">
                  {BONUS_STEPS.map((st) => (
                    <li key={st.number}>
                      <button
                        type="button"
                        onClick={() => go(`step-${st.number}`)}
                        className="flex w-full items-center gap-3 rounded-xl border border-vexo-border bg-vexo-surface px-3 py-2.5 text-left hover:border-vexo-accent"
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-vexo-accent/15 ${s.small} font-semibold text-vexo-accent`}>
                          {st.number}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block ${s.body} font-medium`}>{st.title}</span>
                          <span className={`mt-0.5 block ${s.small} text-vexo-muted`}>{st.idea}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-vexo-muted" strokeWidth={2} />
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}

          {current && (
            <StepScreen
              step={current}
              s={s}
              isChecked={(i) => Boolean(actions[actionKey(current.number, i)])}
              onToggle={(i) => toggleAction(actionKey(current.number, i))}
            />
          )}

          {screen === "checklist" && (
            <ChecklistScreen s={s} checked={checklist} onToggle={toggleChecklist} onReset={resetChecklist} />
          )}

          <FooterNav screen={screen} go={go} s={s} />
        </main>
      </div>
    </div>
  );
}

type Sizes = { body: string; small: string; label: string; h1: string; h2: string; phrase: string };

function SideItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "step" : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
        active ? "bg-vexo-petrol text-vexo-fg" : "text-vexo-fg/75 hover:bg-vexo-petrol/60 hover:text-vexo-fg"
      }`}
    >
      {children}
    </button>
  );
}

function CheckRow({ checked, onChange, children, size }: { checked: boolean; onChange: () => void; children: React.ReactNode; size: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-vexo-surface2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-[3px] h-4 w-4 shrink-0 cursor-pointer rounded border-vexo-border accent-[rgb(var(--vexo-accent))]"
      />
      <span className={`${size} ${checked ? "text-vexo-muted" : ""}`}>{children}</span>
    </label>
  );
}

function BlockCard({ block, s }: { block: ScriptBlock; s: Sizes }) {
  return (
    <section className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5 sm:p-4">
      {block.title && <h2 className={`mb-2 ${s.h2} font-semibold`}>{block.title}</h2>}
      {block.media?.kind === "video" && (
        <video controls preload="metadata" src={block.media.url} className="mb-3 w-full rounded-lg" />
      )}
      {/* Player nativo no topo do bloco, acima do texto (abaixo do título,
          quando o bloco tem um). preload="none": nada é baixado até dar play.
          Mais alto no celular (toque), compacto no PC. */}
      {block.media?.kind === "audio" && (
        <audio controls preload="none" src={block.media.url} className="mb-3 block h-11 w-full sm:h-9" />
      )}
      <div className="space-y-2.5">
        {block.items.map((item, i) =>
          item.type === "subtitle" ? (
            <h3 key={i} className={`pt-1.5 ${s.h2} font-semibold text-vexo-fg`}>
              {item.text}
            </h3>
          ) : (
            <p key={i} className={`${s.body} leading-relaxed text-vexo-fg/90`}>
              {item.text}
            </p>
          )
        )}
      </div>
    </section>
  );
}

function StepScreen({
  step,
  s,
  isChecked,
  onToggle,
}: {
  step: BonusStep;
  s: Sizes;
  isChecked: (i: number) => boolean;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="space-y-3">
      <header className="mb-1">
        <p className={`${s.label} font-semibold uppercase tracking-wide text-vexo-accent`}>
          Passo {step.number} de {BONUS_STEPS.length}
        </p>
        <h1 className={`mt-1 ${s.h1} font-semibold leading-tight tracking-tight`}>{step.title}</h1>
      </header>

      <div className="rounded-xl border border-vexo-border bg-vexo-surface2 p-3">
        <p className={`${s.label} font-semibold uppercase tracking-wide text-vexo-muted`}>Ideia central</p>
        <p className={`mt-1 ${s.body}`}>{step.idea}</p>
      </div>

      <div className="rounded-xl border border-vexo-accent/50 bg-vexo-accent/10 p-3">
        <p className={`${s.label} font-semibold uppercase tracking-wide text-vexo-accent`}>Frase para usar</p>
        <p className={`mt-1 ${s.phrase} font-semibold leading-snug`}>{step.phrase}</p>
        {step.phraseNote && <p className={`mt-1.5 ${s.small} text-vexo-muted`}>{step.phraseNote}</p>}
      </div>

      {step.blocks.map((b) => (
        <BlockCard key={b.id} block={b} s={s} />
      ))}

      <section className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5 sm:p-4">
        <h2 className={`mb-1.5 ${s.h2} font-semibold`}>Aplique esta semana</h2>
        <div className="space-y-0.5">
          {step.actions.map((a, i) => (
            <CheckRow key={i} checked={isChecked(i)} onChange={() => onToggle(i)} size={s.body}>
              {a}
            </CheckRow>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChecklistScreen({
  s,
  checked,
  onToggle,
  onReset,
}: {
  s: Sizes;
  checked: CheckState;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={`${s.label} font-semibold uppercase tracking-wide text-vexo-accent`}>{BONUS_CHECKLIST_SCREEN.eyebrow}</p>
          <h1 className={`mt-1 ${s.h1} font-semibold leading-tight tracking-tight`}>{BONUS_CHECKLIST_SCREEN.title}</h1>
          <p className={`mt-1 ${s.small} text-vexo-muted`}>{BONUS_CHECKLIST_SCREEN.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="self-start whitespace-nowrap rounded-lg border border-vexo-border px-2.5 py-1.5 text-[16px] font-medium hover:border-vexo-accent sm:self-auto sm:text-xs"
        >
          {BONUS_CHECKLIST_SCREEN.resetLabel}
        </button>
      </header>

      <div className="grid gap-2 lg:grid-cols-3">
        {BONUS_CHECKLIST.map((g) => {
          const done = g.items.filter((_, i) => checked[checklistKey(g.id, i)]).length;
          return (
            <section key={g.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3">
              <div className="mb-1 flex items-center justify-between">
                <h2 className={`${s.h2} font-semibold`}>{g.title}</h2>
                <span className={`${s.small} tabular-nums text-vexo-muted`}>
                  {done}/{g.items.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {g.items.map((item, i) => {
                  const key = checklistKey(g.id, i);
                  return (
                    <CheckRow key={key} checked={Boolean(checked[key])} onChange={() => onToggle(key)} size={s.small}>
                      {item}
                    </CheckRow>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section>
        <h2 className={`${s.h2} font-semibold`}>{BONUS_CHECKLIST_SCREEN.messagesTitle}</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {BONUS_MESSAGES.map((m, i) => (
            <MessageCard key={m.id} index={i + 1} title={m.title} text={m.text} s={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MessageCard({ index, title, text, s }: { index: number; title: string; text: string; s: Sizes }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function onCopy() {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col rounded-xl border border-vexo-border bg-vexo-surface p-3">
      <p className={`${s.body} font-semibold`}>
        {index}) {title}
      </p>
      <p className={`mt-1.5 flex-1 whitespace-pre-line rounded-lg bg-vexo-surface2 p-2.5 ${s.small} leading-relaxed text-vexo-fg/90`}>{text}</p>
      <button
        type="button"
        onClick={onCopy}
        className={`mt-2 inline-flex items-center gap-1.5 self-start rounded-lg border px-2.5 py-1.5 text-[16px] font-medium sm:text-xs ${
          copied ? "border-vexo-success text-vexo-success" : "border-vexo-accent text-vexo-accent hover:bg-vexo-accent/10"
        }`}
      >
        {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
        {copied ? "Copiado" : "Copiar mensagem"}
      </button>
    </div>
  );
}

function FooterNav({ screen, go, s }: { screen: BonusScreenId; go: (id: BonusScreenId) => void; s: Sizes }) {
  const prev = adjacentBonusScreen(screen, -1);
  const next = adjacentBonusScreen(screen, 1);
  const nextLabel =
    screen === "overview" ? "Começar pelo passo 1 →" : next === "checklist" ? "Checklist e mensagens →" : "Próximo passo →";

  return (
    <div className="mt-5 flex items-center justify-between gap-2 border-t border-vexo-border pt-4">
      {prev ? (
        <button
          type="button"
          onClick={() => go(prev)}
          className={`rounded-lg border border-vexo-border px-3 py-1.5 ${s.small} font-medium hover:border-vexo-accent`}
        >
          ← Anterior
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button
          type="button"
          onClick={() => go(next)}
          className={`rounded-lg bg-vexo-accent px-3 py-1.5 ${s.small} font-medium text-vexo-accentFg hover:opacity-90`}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}
