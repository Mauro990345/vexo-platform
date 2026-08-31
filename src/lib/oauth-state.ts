import crypto from "crypto";

// Assina o parâmetro `state` do fluxo OAuth para amarrar o callback à
// clínica correta e evitar CSRF, sem precisar de sessão de servidor
// compartilhada entre start/callback.

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET não configurado.");
  return s;
}

export function signOAuthState(clinicId: string): string {
  const nonce = crypto.randomBytes(8).toString("hex");
  const ts = Date.now().toString();
  const payload = `${clinicId}.${nonce}.${ts}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyOAuthState(state: string): { clinicId: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [clinicId, nonce, ts, sig] = decoded.split(".");
    if (!clinicId || !nonce || !ts || !sig) return null;

    const payload = `${clinicId}.${nonce}.${ts}`;
    const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
    if (
      expected.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return null;
    }

    // Expira em 10 minutos
    if (Date.now() - Number(ts) > 10 * 60 * 1000) return null;

    return { clinicId };
  } catch {
    return null;
  }
}
