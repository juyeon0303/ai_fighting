import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const DEV_PREFIX = "dev:";

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "ai-debate-arena-v1", 32);
}

export function encryptApiKey(plain: string): string {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    return `${DEV_PREFIX}${Buffer.from(plain, "utf8").toString("base64")}`;
  }

  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptApiKey(payload: string): string | null {
  if (!payload) return null;

  if (payload.startsWith(DEV_PREFIX)) {
    try {
      return Buffer.from(payload.slice(DEV_PREFIX.length), "base64").toString(
        "utf8",
      );
    } catch {
      return null;
    }
  }

  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) return null;

  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;

  try {
    const key = deriveKey(secret);
    const decipher = createDecipheriv(
      ALGO,
      key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
