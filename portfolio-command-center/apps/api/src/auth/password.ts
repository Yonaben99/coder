import { hash, verify } from "@node-rs/argon2";

// Argon2id (library default) per SECURITY.md §3 — no custom crypto.
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext);
}

export async function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  return verify(hashValue, plaintext);
}
