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
import { bonusBodyFont, bonusTitleFont } from "@/lib/bonus-fonts";
import styles from "./FullFaceBonusGuide.module.css";

// Guia "Bônus Full Face" — uma tela por vez (Visão geral, Passos 1–7,
// Checklist e mensagens), menu lateral próprio (faixa horizontal só com os
// números no celular), setas do teclado, "Modo call" e caixas de marcar
// salvas SÓ no navegador (localStorage, sempre dentro de try/catch — nada
// vai pro banco). Conteúdo em @/lib/full-face-bonus-content.
//
// Visual: exceção à regra de "compacto" do VEXO — segue o protótipo
// aprovado (fontes Bricolage Grotesque/Figtree, tokens claro/escuro,
// respiro de página de leitura), tudo ESCOPADO em
// FullFaceBonusGuide.module.css; nada vaza pro resto do app. No "celular"
// (guia com até 860px) nenhum texto fica abaixo de 16px.

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
// dentro do AppShell do admin, sem as abas da cliente). No admin a sidebar
// do AppShell já ocupa espaço — por isso o corte "celular" é por container
// query (largura do guia), não pela largura da janela.
export function FullFaceBonusGuide({
  storageKey,
  tabs,
  header,
}: {
  storageKey: string;
  tabs?: { panelHref: string; bonusHref: string };
  header?: React.ReactNode;
}) {
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

  const current = screen.startsWith("step-") ? BONUS_STEPS.find((st) => `step-${st.number}` === screen) : undefined;

  const callButton = (
    <button
      type="button"
      onClick={() => setCallMode((v) => !v)}
      aria-pressed={callMode}
      className={`${styles.callBtn} ${callMode ? styles.callBtnActive : ""}`}
    >
      <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      Modo call
    </button>
  );

  return (
    <div ref={topRef} className={`scroll-mt-4 ${styles.scope} ${bonusTitleFont.variable} ${bonusBodyFont.variable}`}>
      {tabs ? (
        <ClientPanelTabs active="bonus" panelHref={tabs.panelHref} bonusHref={tabs.bonusHref} trailing={callButton} />
      ) : (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">{header}</div>
          <div className="shrink-0">{callButton}</div>
        </div>
      )}

      <div className={`${styles.root} ${callMode ? styles.call : ""}`}>
        <div className={styles.inner}>
          <div className={styles.layout}>
            {!callMode && (
              <>
                <nav className={styles.side} aria-label="Telas do guia">
                  <SideItem active={screen === "overview"} onClick={() => go("overview")}>
                    <span className={styles.circle}>
                      <Home className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className={styles.sideTitle}>Visão geral</span>
                  </SideItem>
                  <div className={styles.sep} />
                  {BONUS_STEPS.map((st) => {
                    const id = `step-${st.number}` as BonusScreenId;
                    const done = doneCount(st);
                    return (
                      <SideItem key={id} active={screen === id} onClick={() => go(id)}>
                        <span className={styles.circle}>{st.number}</span>
                        <span className={styles.sideTitle}>{st.title}</span>
                        <span className={`${styles.sideCount} ${done === st.actions.length ? styles.sideCountDone : ""}`}>
                          {done}/{st.actions.length}
                        </span>
                      </SideItem>
                    );
                  })}
                  <div className={styles.sep} />
                  <SideItem active={screen === "checklist"} onClick={() => go("checklist")}>
                    <span className={styles.circle}>
                      <ListChecks className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className={styles.sideTitle}>Checklist e mensagens</span>
                  </SideItem>
                </nav>

                {/* "Celular": faixa rolável de pílulas só com os números */}
                <nav className={styles.strip} aria-label="Telas do guia">
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
                        className={`${styles.pill} ${active ? styles.pillActive : ""}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </nav>
              </>
            )}

            <main key={screen} className={styles.main}>
              {screen === "overview" && (
                <div>
                  <p className={styles.eyebrow}>{BONUS_OVERVIEW.eyebrow}</p>
                  <h1 className={styles.h1}>{BONUS_OVERVIEW.title}</h1>
                  <p className={styles.lead}>{BONUS_OVERVIEW.subtitle}</p>

                  <h2 className={styles.sectionLabel}>Como usar</h2>
                  <div className={styles.howGrid}>
                    {BONUS_OVERVIEW.howTo.map((c) => (
                      <div key={c.title} className={styles.howCard}>
                        <p className={styles.howTitle}>{c.title}</p>
                        <p className={styles.howText}>{c.text}</p>
                      </div>
                    ))}
                  </div>

                  <h2 className={styles.sectionLabel}>Os 7 passos</h2>
                  <ol className={styles.stepList}>
                    {BONUS_STEPS.map((st) => (
                      <li key={st.number}>
                        <button type="button" onClick={() => go(`step-${st.number}`)} className={styles.stepRow}>
                          <span className={styles.stepNum}>{st.number}</span>
                          <span className="min-w-0">
                            <span className={styles.stepRowTitle}>{st.title}</span>
                            <span className={styles.stepRowIdea}>{st.idea}</span>
                          </span>
                          <ChevronRight className={`h-4 w-4 ${styles.chevron}`} strokeWidth={2} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {current && (
                <StepScreen
                  step={current}
                  isChecked={(i) => Boolean(actions[actionKey(current.number, i)])}
                  onToggle={(i) => toggleAction(actionKey(current.number, i))}
                />
              )}

              {screen === "checklist" && (
                <ChecklistScreen checked={checklist} onToggle={toggleChecklist} onReset={resetChecklist} />
              )}

              <FooterNav screen={screen} go={go} />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function SideItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "step" : undefined}
      className={`${styles.sideItem} ${active ? styles.sideItemActive : ""}`}
    >
      {children}
    </button>
  );
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className={`${styles.check} ${checked ? styles.checkDone : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

// Volume inicial de 50% em todo player de áudio do guia (inclusive os dos
// próximos passos). A pessoa continua ajustando pelo controle do player.
// No iPhone/iPad (Safari) o volume de <audio> é só leitura por código — lá
// fica no volume do aparelho, e isso não é contornado de propósito.
function setInitialVolume(el: HTMLAudioElement | null) {
  if (!el) return;
  try {
    el.volume = 0.5;
  } catch {
    // ignora navegadores que não permitem
  }
}

function BlockCard({ block }: { block: ScriptBlock }) {
  return (
    <section className={styles.card}>
      {block.title && <h2 className={styles.blockTitle}>{block.title}</h2>}
      {block.media?.kind === "video" && (
        <video controls preload="metadata" src={block.media.url} className="mb-4 w-full rounded-lg" />
      )}
      {/* Player nativo no topo do bloco, acima do texto (abaixo do título,
          quando o bloco tem um). preload="none": nada é baixado até dar play. */}
      {block.media?.kind === "audio" && (
        <audio ref={setInitialVolume} controls preload="none" src={block.media.url} className={styles.audio} />
      )}
      {block.items.map((item, i) =>
        item.type === "subtitle" ? (
          <h3 key={i} className={styles.sub}>
            {item.text}
          </h3>
        ) : (
          <p key={i} className={styles.p}>
            {item.text}
          </p>
        )
      )}
    </section>
  );
}

function StepScreen({
  step,
  isChecked,
  onToggle,
}: {
  step: BonusStep;
  isChecked: (i: number) => boolean;
  onToggle: (i: number) => void;
}) {
  const done = step.actions.filter((_, i) => isChecked(i)).length;
  return (
    <div>
      <header className={styles.stepHeader}>
        <p className={styles.eyebrow}>
          Passo {step.number} de {BONUS_STEPS.length}
        </p>
        <h1 className={styles.stepTitle}>{step.title}</h1>
      </header>

      <div className={styles.idea}>
        <p className={styles.ideaLabel}>Ideia central</p>
        <p className={styles.ideaText}>{step.idea}</p>
      </div>

      <div className={styles.phrase}>
        <p className={styles.phraseLabel}>Frase para usar</p>
        <p className={styles.phraseText}>{step.phrase}</p>
        {step.phraseNote && <p className={styles.phraseNote}>{step.phraseNote}</p>}
      </div>

      {step.blocks.map((b) => (
        <BlockCard key={b.id} block={b} />
      ))}

      <section className={styles.apply}>
        <div className={styles.applyHead}>
          <h2 className={styles.applyTitle}>Aplique esta semana</h2>
          <span className={styles.meta}>
            {done}/{step.actions.length}
          </span>
        </div>
        {step.actions.map((a, i) => (
          <CheckRow key={i} checked={isChecked(i)} onChange={() => onToggle(i)}>
            {a}
          </CheckRow>
        ))}
      </section>
    </div>
  );
}

function ChecklistScreen({
  checked,
  onToggle,
  onReset,
}: {
  checked: CheckState;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  return (
    <div>
      <p className={styles.eyebrow}>{BONUS_CHECKLIST_SCREEN.eyebrow}</p>
      <h1 className={styles.stepTitle}>{BONUS_CHECKLIST_SCREEN.title}</h1>
      <div className={styles.checklistHead}>
        <p className={styles.checklistSub}>{BONUS_CHECKLIST_SCREEN.subtitle}</p>
        <button type="button" onClick={onReset} className={styles.pillBtn}>
          {BONUS_CHECKLIST_SCREEN.resetLabel}
        </button>
      </div>

      {BONUS_CHECKLIST.map((g) => {
        const done = g.items.filter((_, i) => checked[checklistKey(g.id, i)]).length;
        return (
          <section key={g.id} className={styles.apply}>
            <div className={styles.applyHead}>
              <h2 className={styles.applyTitle}>{g.title}</h2>
              <span className={styles.meta}>
                {done}/{g.items.length}
              </span>
            </div>
            {g.items.map((item, i) => {
              const key = checklistKey(g.id, i);
              return (
                <CheckRow key={key} checked={Boolean(checked[key])} onChange={() => onToggle(key)}>
                  {item}
                </CheckRow>
              );
            })}
          </section>
        );
      })}

      <h2 className={styles.messagesTitle}>{BONUS_CHECKLIST_SCREEN.messagesTitle}</h2>
      <div className={styles.msgGrid}>
        {BONUS_MESSAGES.map((m, i) => (
          <MessageCard key={m.id} index={i + 1} title={m.title} text={m.text} />
        ))}
      </div>
    </div>
  );
}

function MessageCard({ index, title, text }: { index: number; title: string; text: string }) {
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
    <div className={styles.msgCard}>
      <p className={styles.msgTitle}>
        {index}) {title}
      </p>
      <p className={styles.msgText}>{text}</p>
      <button type="button" onClick={onCopy} className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ""}`}>
        {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
        {copied ? "Copiado" : "Copiar mensagem"}
      </button>
    </div>
  );
}

function FooterNav({ screen, go }: { screen: BonusScreenId; go: (id: BonusScreenId) => void }) {
  const prev = adjacentBonusScreen(screen, -1);
  const next = adjacentBonusScreen(screen, 1);
  const nextLabel =
    screen === "overview" ? "Começar pelo passo 1 →" : next === "checklist" ? "Checklist e mensagens →" : "Próximo passo →";

  return (
    <div className={styles.footer}>
      {prev && (
        <button type="button" onClick={() => go(prev)} className={styles.btn}>
          ← Anterior
        </button>
      )}
      {next && (
        <button type="button" onClick={() => go(next)} className={`${styles.btn} ${styles.btnPrimary}`}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}
