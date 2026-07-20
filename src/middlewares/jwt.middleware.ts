import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { COOKIE_ACCESS_TOKEN } from "../constants/auth.js";

// Tokens d'accès signés en RS256 : clé privée pour signer (login),
// clé publique pour vérifier (ici). Les clés vivent dans le .env sous forme
// de PEM aplati (générées par scripts/generer-cles.js, voir .env.example).
//
// Le token arrive par DEUX canaux, essayés dans cet ordre :
//   1. En-tête "Authorization: Bearer <token>"  → app mobile, outils, serveurs.
//   2. Cookie httpOnly "accessToken"            → apps web (front React).
//
// Le token ne transporte QUE l'id. Le statut du compte est relu en base à
// chaque requête : un bannissement prend effet immédiatement, sans attendre
// l'expiration du token.
export interface UtilisateurConnecte {
  id: string;
}

// Ajoute req.utilisateur au type Request d'Express (rempli par middlewareJwt).
declare module "express-serve-static-core" {
  interface Request {
    utilisateur?: UtilisateurConnecte;
  }
}

// Reconstitue le PEM depuis le .env (les \n littéraux redeviennent des sauts de ligne).
function lireClePublique(): string | undefined {
  return process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n");
}

// En-tête Authorization d'abord (explicite), cookie "accessToken" sinon.
function extraireToken(req: Request): string | undefined {
  const enTete = req.headers.authorization;
  if (enTete?.startsWith("Bearer ")) {
    return enTete.slice("Bearer ".length);
  }
  const cookies = req.cookies as Record<string, unknown>;
  const depuisCookie = cookies[COOKIE_ACCESS_TOKEN];
  return typeof depuisCookie === "string" && depuisCookie !== "" ? depuisCookie : undefined;
}

export async function middlewareJwt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extraireToken(req);

  if (!token) {
    res.status(401).json({ message: "Authentification requise." });
    return;
  }

  const clePublique = lireClePublique();
  if (!clePublique) {
    res.status(500).json({
      message: "JWT_PUBLIC_KEY manquante dans le .env — voir .env.example.",
    });
    return;
  }

  let payload: string | jwt.JwtPayload;
  try {
    // algorithms épinglé : refuse tout token signé autrement qu'en RS256.
    payload = jwt.verify(token, clePublique, { algorithms: ["RS256"] });
  } catch {
    res.status(401).json({ message: "Token invalide ou expiré." });
    return;
  }

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    res.status(401).json({ message: "Token invalide." });
    return;
  }

  const personne = await prisma.personne.findUnique({
    where: { id: payload.sub },
  });

  if (!personne) {
    res.status(401).json({ message: "Compte introuvable." });
    return;
  }
  if (personne.statut !== "ACTIF") {
    res.status(403).json({ message: "Compte suspendu ou banni." });
    return;
  }

  req.utilisateur = {
    id: personne.id,
  };
  next();
}
