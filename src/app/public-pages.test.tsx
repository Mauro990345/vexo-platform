import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

const getServerSessionMock = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSessionMock(...a) }));
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { default: HomePage } = await import("./page");
const { default: PrivacyPage } = await import("./privacidade/page");
const { default: TermsPage } = await import("./termos/page");
const { default: LegacyTermsPage } = await import("./termos-de-uso/page");
const { default: DeletionPage } = await import("./exclusao-de-dados/page");
const { default: EntrarPage } = await import("./entrar/page");
const { default: LoginRedirectPage } = await import("./login/page");
const { requireSession, requireInternalSession } = await import("@/lib/session");
const { LEGAL_INFO, formatCompanyLine, hasCompanyRegistration, PUBLIC_ROUTES } = await import("@/lib/legal-info");
const { default: sitemap } = await import("./sitemap");
const { default: robots } = await import("./robots");

const PAGES = {
  "/": HomePage,
  "/privacidade": PrivacyPage,
  "/termos": TermsPage,
  "/termos-de-uso": LegacyTermsPage,
  "/exclusao-de-dados": DeletionPage,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue(null);
});

describe("páginas públicas — renderizam sem login e sem consultar sessão/banco", () => {
  for (const [route, Page] of Object.entries(PAGES)) {
    it(`${route}: renderiza com cabeçalho, conteúdo e rodapé`, () => {
      const html = renderToStaticMarkup(<Page />);
      expect(html).toContain("<header");
      expect(html).toContain('<main id="conteudo"');
      expect(html).toContain("<footer");
      expect(html).toContain('href="/entrar"');
      expect(getServerSessionMock).not.toHaveBeenCalled();
    });

    it(`${route}: sem placeholder, sem "M8 Growth" e sem razão social/CNPJ enquanto vazios`, () => {
      const html = renderToStaticMarkup(<Page />);
      expect(html).not.toContain("[PREENCHER]");
      expect(html).not.toContain("M8 Growth");
      expect(html).not.toMatch(/CNPJ/);
      expect(html).not.toMatch(/raz[ãa]o social/i);
    });
  }

  it("página inicial: seções com os ids do menu e contato por e-mail", () => {
    const html = renderToStaticMarkup(<HomePage />);
    for (const id of ["como-funciona", "antes-depois", "resultados", "seguranca", "contato"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain(`href="mailto:${LEGAL_INFO.emails.contact}"`);
    expect(html).toContain("Exemplo ilustrativo");
    expect(html).toContain("O VEXO IA não é afiliado, patrocinado nem endossado pela Meta.");
  });

  it("encarregado (DPO) é privacidade@vexoia.com.br na política e na exclusão", () => {
    expect(renderToStaticMarkup(<PrivacyPage />)).toContain("mailto:privacidade@vexoia.com.br");
    const del = renderToStaticMarkup(<DeletionPage />);
    expect(del).toContain("mailto:privacidade@vexoia.com.br?subject=Exclus%C3%A3o%20de%20dados");
  });
});

describe("rodapé — todo link aponta pra uma rota/âncora que existe", () => {
  it("links internos têm página; âncoras existem na página inicial; e-mails corretos", () => {
    const html = renderToStaticMarkup(<HomePage />);
    const footer = html.slice(html.indexOf("<footer"));
    const hrefs = [...footer.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThanOrEqual(10);
    for (const href of hrefs) {
      if (href.startsWith("mailto:")) {
        expect(Object.values(LEGAL_INFO.emails)).toContain(href.slice(7));
      } else if (href.startsWith("/#")) {
        expect(html).toContain(`id="${href.slice(2)}"`);
      } else {
        const pageFile = path.join(__dirname, href === "/" ? "" : href, "page.tsx");
        expect(existsSync(pageFile), `${href} sem página`).toBe(true);
      }
    }
    for (const r of ["/privacidade", "/termos", "/exclusao-de-dados", "/entrar"]) expect(hrefs).toContain(r);
  });
});

describe("legal-info — razão social/CNPJ só aparecem quando preenchidos", () => {
  it("hoje vazios: nada é exibido", () => {
    expect(LEGAL_INFO.companyName).toBe("");
    expect(LEGAL_INFO.cnpj).toBe("");
    expect(hasCompanyRegistration()).toBe(false);
    expect(formatCompanyLine()).toBeNull();
  });
  it("preenchidos: vira a linha do rodapé", () => {
    expect(formatCompanyLine({ companyName: "VEXO IA Tecnologia Ltda.", cnpj: "00.000.000/0001-00" })).toBe(
      "VEXO IA Tecnologia Ltda. · CNPJ 00.000.000/0001-00"
    );
  });
  it("só um dos dois preenchido: continua oculto", () => {
    expect(formatCompanyLine({ companyName: "X Ltda.", cnpj: "" })).toBeNull();
  });
});

describe("login em /entrar", () => {
  it("sem sessão: mostra o MESMO formulário de login (e-mail, senha, Entrar)", async () => {
    const html = renderToStaticMarkup(await EntrarPage());
    expect(html).toContain('id="email"');
    expect(html).toContain('id="password"');
    expect(html).toContain("Entrar");
    expect(html).not.toContain("M8 Growth");
  });
  it("já logado (interno): vai pro /crm; cliente: /dashboard", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "INTERNAL_ADMIN" } });
    await expect(EntrarPage()).rejects.toThrow("REDIRECT:/crm");
    getServerSessionMock.mockResolvedValue({ user: { role: "CLIENT", clinicId: "c1" } });
    await expect(EntrarPage()).rejects.toThrow("REDIRECT:/dashboard");
  });
  it("/login antigo redireciona pra /entrar", () => {
    expect(() => LoginRedirectPage()).toThrow("REDIRECT:/entrar");
  });
});

describe("área logada continua protegida", () => {
  it("sem sessão, requireSession manda pro /entrar", async () => {
    await expect(requireSession()).rejects.toThrow("REDIRECT:/entrar");
  });
  it("cliente tentando o CRM é mandado pro /dashboard", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "CLIENT", clinicId: "c1" } });
    await expect(requireInternalSession()).rejects.toThrow("REDIRECT:/dashboard");
  });
});

describe("SEO", () => {
  it("sitemap tem exatamente as 4 rotas públicas", () => {
    expect(PUBLIC_ROUTES).toEqual(["/", "/privacidade", "/termos", "/exclusao-de-dados"]);
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://vexoia.com.br",
      "https://vexoia.com.br/privacidade",
      "https://vexoia.com.br/termos",
      "https://vexoia.com.br/exclusao-de-dados",
    ]);
  });
  it("robots libera as públicas e bloqueia área logada/APIs", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.allow).toEqual(expect.arrayContaining(["/", "/privacidade", "/termos", "/exclusao-de-dados"]));
    expect(rule.disallow).toEqual(expect.arrayContaining(["/crm", "/dashboard", "/api"]));
  });
});

describe("página inicial — ajustes de design e conteúdo (2ª rodada)", () => {
  const html = () => renderToStaticMarkup(<HomePage />);

  it("FAQ (#duvidas): 8 perguntas em <details> nativos, a primeira aberta, na ordem pedida", () => {
    const h = html();
    expect(h).toContain('id="duvidas"');
    const faq = h.slice(h.indexOf('id="duvidas"'));
    const details = [...faq.matchAll(/<details([^>]*)>/g)];
    expect(details).toHaveLength(8);
    expect(details[0]![1]).toContain("open");
    for (const d of details.slice(1)) expect(d[1]).not.toContain("open");
    const questions = [...faq.matchAll(/<summary[^>]*>([^<]+)</g)].map((m) => m[1]!.trim());
    expect(questions[0]).toBe("O que o VEXO IA faz, na prática?");
    expect(questions).toEqual([
      "O que o VEXO IA faz, na prática?",
      "O VEXO substitui gestor de tráfego, campanha paga, CRC e SDR?",
      "Quem faz o contato com os pacientes?",
      "Preciso trocar meu número ou meu Instagram?",
      "Os dados da clínica e dos pacientes estão seguros?",
      "Como a clínica acompanha os resultados?",
      "Posso cancelar ou revogar o acesso quando quiser?",
      "Quanto custa e como começo?",
    ]);
  });

  it("cabeçalho tem o link 'Dúvidas' pra âncora #duvidas", () => {
    expect(html()).toMatch(/<a href="\/#duvidas"[^>]*>Dúvidas<\/a>/);
  });

  it("logo: 'vexo' em minúsculas, sem uppercase, com o X simétrico", async () => {
    const { VexoLogo } = await import("@/components/public/VexoLogo");
    const logo = renderToStaticMarkup(<VexoLogo />);
    expect(logo).not.toMatch(/\buppercase\b/);
    expect(logo).toContain("normal-case");
    expect(logo).toMatch(/>vexo<span[^>]*> ia<\/span>/);
    expect(logo).toContain('d="M6 6l14 14"');
    expect(logo).toContain('d="M20 6L6 20"');
  });

  it("diz O QUE o VEXO faz, nunca COMO: sem canal por função, sem quem faz a primeira mensagem, sem regra de reativação", () => {
    const h = html();
    expect(h).toContain("Ele atende o paciente, agenda, confirma e traz de volta quem sumiu. Sua equipe só atende.");
    for (const forbidden of [
      /pelo WhatsApp/i,
      /no Instagram e no WhatsApp/i,
      /conversa (com o paciente )?no Instagram/i,
      /primeira mensagem (é|e) enviada/i,
      /só a primeira/i,
      /IA assume/i,
      /prazo de retorno/i,
      /único contato/i,
      /A IA conversa também pelo WhatsApp/i,
      /Como funciona a reativação/i,
    ]) {
      expect(h).not.toMatch(forbidden);
    }
    expect(String(metadataDescription())).not.toMatch(/WhatsApp|Instagram/);
  });

  it("selos de segurança: só os verdadeiros, nunca certificações que não temos", () => {
    const h = html();
    const seals = h.slice(h.indexOf('aria-label="Medidas de segurança"'));
    for (const s of ["HTTPS", "Chaves cifradas", "Senhas em hash", "Login obrigatório"]) expect(seals).toContain(s);
    expect(h).not.toMatch(/SOC ?2|ISO ?27001|GDPR|HIPAA/i);
  });

  it("funil em pontos: 60 pontos pequenos (12 colunas), acessível, e marcado como exemplo", () => {
    const h = html();
    expect(h).toContain('aria-label="Exemplo ilustrativo com 60 pessoas abordadas: 26 compareceram, 3 agendaram e não compareceram, 14 conversaram sem agendar e 17 não responderam."');
    const grid = h.slice(h.indexOf("Exemplo ilustrativo com 60 pessoas"));
    const dots = grid.slice(0, grid.indexOf("</div>"));
    expect(dots.match(/h-2\.5 w-2\.5 rounded-full/g)).toHaveLength(60);
    expect(h).toContain("grid-cols-12 gap-[9px]");
  });

  it("ícones de Como funciona/Segurança/agendamento só em traço (sem círculo colorido); Depois sem verde/dourado/roxo", () => {
    const h = html();
    const depois = h.slice(h.indexOf("Um fluxo só, do primeiro contato à consulta."), h.indexOf('id="como-funciona"'));
    expect(depois).not.toMatch(/pub-green|pubGreen|tab-icon-2|pub-violet|pubViolet/);
    expect(depois).toContain("Confirmada");
    // fora da órbita do hero (que continua colorida), nenhum ícone em círculo colorido
    const afterOrbit = h.slice(h.indexOf("UM SISTEMA, TODO O CAMINHO"));
    expect(afterOrbit).not.toMatch(/rgb\(var\(--(tab-icon-\d|pub-violet|pub-green|pub-accent)\) \/ 0\.12\)/);
  });

  it("faixas claras em 'Como funciona' e 'Perguntas frequentes'; abordagem por social sellers", () => {
    const h = html();
    expect(h.match(/pub-light-band/g)).toHaveLength(2);
    expect(h).toContain("O contato com quem já se interessa pela clínica é feito por social sellers em conjunto com a IA.");
  });
});

async function importMeta() {
  return (await import("./page")).metadata;
}
let cachedMeta: Awaited<ReturnType<typeof importMeta>> | null = null;
function metadataDescription() {
  return cachedMeta?.description ?? "";
}
beforeEach(async () => {
  cachedMeta = await importMeta();
});

describe("página inicial — CTA e Antes/Depois (ajuste fino)", () => {
  it("cartão do relatório no CTA não tem altura fixa nem corte: os 4 números aparecem, em 2x2 no celular", () => {
    const h = renderToStaticMarkup(<HomePage />);
    const cta = h.slice(h.indexOf('id="contato"'));
    expect(cta).not.toContain("h-[210px]");
    expect(cta).not.toMatch(/max-w-\[720px\][^"]*overflow-hidden/);
    for (const label of ["Abordados", "Em conversa", "Agendaram", "Compareceram"]) expect(cta).toContain(`>${label}<`);
    expect(cta).toContain("grid grid-cols-2 gap-2 sm:grid-cols-4");
    expect(cta.match(/min-w-0 rounded-2xl/g)).toHaveLength(4);
  });

  it("bloco Depois usa as classes que só compactam a partir de 900px", () => {
    const h = renderToStaticMarkup(<HomePage />);
    expect(h).toContain("pub-after ");
    expect(h).toContain("pub-after-chat");
    expect(h.match(/pub-after-bubble/g)).toHaveLength(3);
    expect(h).toContain("pub-after-card");
  });
});
