import crypto from "crypto";

// Criptografia simétrica (AES-256-GCM) para tokens de OAuth em repouso
// (Instagram / Google Calendar). Nunca armazenamos senha — apenas tokens
// revogáveis, e mesmo esses ficam criptografados no banco.

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY não configurada — necessária para criptografar tokens OAuth."
    );
  }
  // Aceita chave em hex (64 chars) ou qualquer string, derivada via sha256.
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    "."
  );
}

export function decryptToken(payload: string): string {
  const [ivB64, authTagB64, dataB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Payload de token criptografado em formato inválido.");
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
