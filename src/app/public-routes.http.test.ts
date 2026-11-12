// Teste HTTP real das rotas (pedido explícito): sobe o app de verdade
// (`next start` sobre o build em .next) e faz requisições SEM login. Precisa
// de um build feito antes (`npm run build`); sem build, o teste é pulado
// avisando — rode `npm run build && npx vitest run src/app/public-routes.http.test.ts`.
// O layout raiz já cai nas cores padrão sem banco (getThemeColors), então
// não precisa de DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const HAS_BUILD = existsSync(path.join(ROOT, ".next", "BUILD_ID"));
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;

if (!HAS_BUILD) console.warn("[public-routes.http.test] sem build em .next — teste HTTP pulado (rode npm run build antes).");

describe.skipIf(!HAS_BUILD)("rotas públicas via HTTP, sem login", () => {
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: ROOT,
      env: { ...process.env, NEXTAUTH_SECRET: "test-secret", NEXTAUTH_URL: BASE, DATABASE_URL: "" },
      stdio: "ignore",
    });
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(`${BASE}/robots.txt`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error("next start não subiu");
  }, 45_000);

  afterAll(() => {
    server?.kill();
  });

  for (const route of ["/", "/privacidade", "/termos", "/termos-de-uso", "/exclusao-de-dados", "/entrar", "/robots.txt", "/sitemap.xml", "/icon.svg"]) {
    it(`${route} responde 200`, async () => {
      const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
      expect(res.status).toBe(200);
    });
  }

  it("/entrar mostra o formulário de login", async () => {
    const html = await (await fetch(`${BASE}/entrar`)).text();
    expect(html).toContain('id="email"');
    expect(html).toContain('id="password"');
  });

  it("/login antigo redireciona pra /entrar", async () => {
    const res = await fetch(`${BASE}/login`, { redirect: "manual" });
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/entrar");
  });

  for (const route of ["/crm", "/dashboard"]) {
    it(`${route} continua protegido (sem login não abre)`, async () => {
      const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
      expect(res.status).not.toBe(200);
      if (res.status >= 300 && res.status < 400) expect(res.headers.get("location")).toContain("/entrar");
    });
  }
});
