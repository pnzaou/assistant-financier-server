import jwt from "jsonwebtoken";
import { DUREE_ACCESS_TOKEN } from "../constants/auth.js";

// Signe l'access token (RS256, clé privée du .env — la vérification se fait
// dans middlewares/jwt.middleware.ts avec la clé publique).
export function signerAccessToken(personneId: string): string {
  const clePrivee = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clePrivee) {
    throw new Error("JWT_PRIVATE_KEY manquante dans le .env — voir .env.example.");
  }
  return jwt.sign({ sub: personneId }, clePrivee, {
    algorithm: "RS256",
    expiresIn: DUREE_ACCESS_TOKEN,
  });
}
