import "server-only";

// PostgREST (donc supabase-js) sérialise/désérialise les colonnes `bytea` en
// texte hex Postgres standard (`\x...`), jamais en Buffer JS brut : il faut
// encoder avant un insert/update et décoder après une lecture.
export function bytesToPgHex(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

export function pgHexToBytes(hex: string): Buffer {
  return Buffer.from(hex.replace(/^\\x/, ""), "hex");
}
