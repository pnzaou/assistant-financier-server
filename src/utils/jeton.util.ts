import { createHash, randomBytes } from "node:crypto";

// Jetons opaques (refresh token, liens email) : aléatoire cryptographique.
// On ne stocke JAMAIS le jeton en clair — seulement son empreinte SHA-256 :
// une fuite de la base ne permet pas de rejouer les jetons.
export function genererJetonOpaque(): string {
  return randomBytes(32).toString("hex");
}

export function hasherJeton(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

export function dateDansMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function dateDansHeures(heures: number): Date {
  return dateDansMinutes(heures * 60);
}

export function dateDansJours(jours: number): Date {
  return dateDansHeures(jours * 24);
}
