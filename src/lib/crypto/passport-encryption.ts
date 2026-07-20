import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// Format exact documenté dans db/schema.sql (table travelers) :
// nonce (12 octets) || ciphertext || authTag (16 octets).
const ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(version: number): Buffer {
  const key = process.env[`PASSPORT_ENCRYPTION_KEY_V${version}`];
  if (!key) throw new Error(`Clé de chiffrement introuvable pour la version ${version}`);

  const buffer = Buffer.from(key, "base64");
  if (buffer.length !== 32) {
    throw new Error(`Clé de chiffrement invalide pour la version ${version} (attendu 32 octets)`);
  }
  return buffer;
}

export function currentEncryptionKeyVersion(): number {
  return Number(process.env.PASSPORT_ENCRYPTION_KEY_CURRENT_VERSION ?? "1");
}

export function encryptPassportField(plaintext: string): { encrypted: Buffer; keyVersion: number } {
  const keyVersion = currentEncryptionKeyVersion();
  const key = getKey(keyVersion);
  const nonce = randomBytes(NONCE_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { encrypted: Buffer.concat([nonce, ciphertext, authTag]), keyVersion };
}

export function decryptPassportField(encrypted: Buffer, keyVersion: number): string {
  const key = getKey(keyVersion);
  const nonce = encrypted.subarray(0, NONCE_LENGTH);
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(NONCE_LENGTH, encrypted.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
