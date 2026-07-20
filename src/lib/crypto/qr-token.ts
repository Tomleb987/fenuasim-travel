import "server-only";
import { randomBytes, createHash } from "node:crypto";

// Token haute entropie, jamais persisté : seul son hash (ci-dessous) est
// stocké dans qr_scan_sessions.token_hash (cf. db/schema.sql).
export function generateScanToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashScanToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
