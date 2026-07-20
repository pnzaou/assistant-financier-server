import bcrypt from "bcryptjs";

// 12 tours : bon compromis sécurité/latence en 2026 (~250 ms par hash).
const TOURS_BCRYPT = 12;

export function hasherMotDePasse(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, TOURS_BCRYPT);
}

export function verifierMotDePasse(motDePasse: string, hash: string): Promise<boolean> {
  return bcrypt.compare(motDePasse, hash);
}
