// Ferramenta interna "Buscar seguidores" (ver DESIGN.md) — NUNCA usa a API
// da Meta. O script abaixo roda no NAVEGADOR do operador, autenticado
// manualmente no instagram.com na conta da própria clínica; o VEXO só
// entrega o texto pronto pra copiar, nunca executa nem acessa nada do
// Instagram sozinho (o navegador bloqueia a página do VEXO de ler
// instagram.com de qualquer forma — "same-origin policy").
//
// ATRÁS DE UM INTERRUPTOR (FOLLOWER_TOOL_ENABLED) que PRECISA ficar
// desligado enquanto o VEXO estiver em análise da Meta — ver README.md,
// seção "Buscar seguidores (interno)". Desligado (padrão): a rota 404 pra
// todo mundo, inclusive admin, e nenhuma ação aqui devolve o texto do
// script. Ligado: só quem está logado como INTERNAL_ADMIN acessa.
export function isFollowerToolEnabled(): boolean {
  return process.env.FOLLOWER_TOOL_ENABLED === "true";
}

export const FOLLOWER_TOOL_MIN_LIMIT = 50;
export const FOLLOWER_TOOL_MAX_LIMIT = 500;
export const FOLLOWER_TOOL_DEFAULT_LIMIT = 300;

export function validateFollowerToolLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < FOLLOWER_TOOL_MIN_LIMIT || limit > FOLLOWER_TOOL_MAX_LIMIT) {
    throw new Error(`Quantidade por rodada precisa ser um número inteiro entre ${FOLLOWER_TOOL_MIN_LIMIT} e ${FOLLOWER_TOOL_MAX_LIMIT}.`);
  }
}

// Texto-modelo EXATO pedido — nunca alterar o conteúdo do script aqui, só
// os dois placeholders ({{LIMITE}}/{{RECOMECAR}}) via renderFollowerToolScript.
const FOLLOWER_TOOL_SCRIPT_TEMPLATE = `(async () => {
  const LIMITE = {{LIMITE}};
  const RECOMECAR = {{RECOMECAR}};
  const POR_PAGINA = 12;
  const espera = (a, b) => new Promise(r => setTimeout(r, (a + Math.random() * (b - a)) * 1000));
  const H = { "x-ig-app-id": "936619743392459", "x-requested-with": "XMLHttpRequest" };
  const get = async (url) => {
    const r = await fetch(url, { headers: H, credentials: "include" });
    if (!r.ok) throw new Error("Instagram respondeu " + r.status + (r.status === 429 || r.status === 403 || r.status === 400 ? " (PARE e espere várias horas)" : ""));
    return r.json();
  };
  let lista = [];
  const m = document.cookie.match(/ds_user_id=(\\d+)/);
  if (!m) { console.log("Não achei a conta logada. Entre no Instagram nesta aba."); return; }
  const id = m[1];
  const chave = "cursor_proprio_" + id;
  try {
    let maxId = RECOMECAR ? "" : (localStorage.getItem(chave) || "");
    console.log(maxId ? "Continuando de onde parou." : "Começando do início.");
    while (lista.length < LIMITE) {
      const d = await get(\`https://www.instagram.com/api/v1/friendships/\${id}/followers/?count=\${POR_PAGINA}\` + (maxId ? \`&max_id=\${maxId}\` : "") + \`&search_surface=follow_list_page\`);
      for (const u of d.users || []) lista.push(u.username);
      console.log(lista.length + " lidos");
      if (!d.next_max_id) { localStorage.removeItem(chave); console.log("Fim da lista: todos os seguidores foram lidos."); break; }
      maxId = d.next_max_id;
      localStorage.setItem(chave, maxId);
      await espera(3, 7);
    }
  } catch (e) {
    console.log("PAROU:", e.message);
  } finally {
    lista = [...new Set(lista)];
    if (lista.length) {
      const dia = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["usuario\\n" + lista.join("\\n") + "\\n"], { type: "text/csv" }));
      a.download = "seguidores_" + id + "_" + dia + ".csv";
      a.click();
      console.log("Pronto: " + lista.length + " perfis neste arquivo.");
    }
  }
})();`;

export function renderFollowerToolScript(params: { limit: number; restart: boolean }): string {
  validateFollowerToolLimit(params.limit);
  return FOLLOWER_TOOL_SCRIPT_TEMPLATE.replace("{{LIMITE}}", String(params.limit)).replace("{{RECOMECAR}}", String(params.restart));
}
