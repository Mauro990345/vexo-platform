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
