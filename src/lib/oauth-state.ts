import crypto from "crypto";

// Assina o parâmetro `state` do fluxo OAuth para amarrar o callback à
// clínica correta e evitar CSRF, sem precisar de sessão de servidor
// compartilhada entre start/callback.
//
// `connectToken` é opcional: quando o fluxo foi iniciado pela página
// pública de conexão (/conectar/[token], sem sessão admin), carregamos o
// token do ConnectionLink aqui dentro pra o callback saber que deve marcar
// o link como usado e redirecionar de volta pra tela pública de sucesso em
// vez da tela de Conexões do CRM. Ausente (undefined) nos fluxos iniciados
// de dentro do CRM — comportamento igual ao de antes.

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET não configurado.");
  return s;
}

export function signOAuthState(clinicId: string, connectToken?: string): string {
  const nonce = crypto.randomBytes(8).toString("hex");
  const ts = Date.now().toString();
  const idField = `${clinicId},${connectToken ?? ""}`;
  const payload = `${idField}.${nonce}.${ts}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyOAuthState(state: string): { clinicId: string; connectToken?: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [idField, nonce, ts, sig] = decoded.split(".");
    if (!idField || !nonce || !ts || !sig) return null;

    const payload = `${idField}.${nonce}.${ts}`;
    const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
    if (
      expected.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return null;
    }

    // Expira em 10 minutos
    if (Date.now() - Number(ts) > 10 * 60 * 1000) return null;

    const [clinicId, connectToken] = idField.split(",");
    if (!clinicId) return null;

    return { clinicId, connectToken: connectToken || undefined };
  } catch {
    return null;
  }
}
