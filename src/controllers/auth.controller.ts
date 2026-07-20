import type { Request, Response } from "express";
import {
  CHEMIN_COOKIE_REFRESH,
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  DUREE_ACCESS_TOKEN_MS,
  DUREE_SESSION_REFRESH_JOURS,
} from "../constants/auth.js";
import type { LoginDto, RegisterDto } from "../dtos/auth.dto.js";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as authService from "../services/auth.service.js";

// Le controller ne fait que traduire HTTP ⇄ métier : lire la requête,
// appeler le service, poser les cookies, choisir le code de statut.
// Toute la logique vit dans services/auth.service.ts.

// Les tokens partent par les DEUX canaux à la fois : cookies httpOnly pour
// les apps web, corps JSON pour l'app mobile. Chaque client prend le sien.
function poserCookiesAuth(res: Response, accessToken: string, refreshToken: string): void {
  const enProduction = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: enProduction,
    maxAge: DUREE_ACCESS_TOKEN_MS,
  });
  res.cookie(COOKIE_REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: enProduction,
    maxAge: DUREE_SESSION_REFRESH_JOURS * 24 * 60 * 60 * 1000,
    // Le navigateur n'enverra ce cookie que sur les routes d'auth.
    path: CHEMIN_COOKIE_REFRESH,
  });
}

function effacerCookiesAuth(res: Response): void {
  res.clearCookie(COOKIE_ACCESS_TOKEN);
  res.clearCookie(COOKIE_REFRESH_TOKEN, { path: CHEMIN_COOKIE_REFRESH });
}

// Cookie (web) d'abord, corps JSON (mobile) sinon.
function extraireRefreshToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown>;
  const depuisCookie = cookies[COOKIE_REFRESH_TOKEN];
  if (typeof depuisCookie === "string" && depuisCookie !== "") {
    return depuisCookie;
  }
  const corps = (req.body ?? {}) as { refreshToken?: unknown };
  return typeof corps.refreshToken === "string" && corps.refreshToken !== ""
    ? corps.refreshToken
    : undefined;
}

export async function register(req: Request, res: Response): Promise<void> {
  const resultat = await authService.inscrire(req.body as RegisterDto);
  poserCookiesAuth(res, resultat.accessToken, resultat.refreshToken);
  res.status(201).json(resultat);
}

export async function login(req: Request, res: Response): Promise<void> {
  const resultat = await authService.seConnecter(req.body as LoginDto);
  poserCookiesAuth(res, resultat.accessToken, resultat.refreshToken);
  res.json(resultat);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = extraireRefreshToken(req);
  if (!refreshToken) {
    throw new NonAutoriseException("Refresh token manquant.");
  }
  const resultat = await authService.rafraichir(refreshToken);
  poserCookiesAuth(res, resultat.accessToken, resultat.refreshToken);
  res.json(resultat);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const refreshToken = extraireRefreshToken(req);
  if (refreshToken) {
    await authService.seDeconnecter(refreshToken);
  }
  effacerCookiesAuth(res);
  res.status(204).send();
}

export async function verifierEmail(req: Request, res: Response): Promise<void> {
  const corps = req.body as { jeton: string };
  await authService.verifierEmail(corps.jeton);
  res.json({ message: "Email vérifié. Bienvenue sur Assistant Financier !" });
}

export async function renvoyerVerification(req: Request, res: Response): Promise<void> {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  await authService.renvoyerVerification(req.utilisateur.id);
  res.json({ message: "Email de vérification renvoyé." });
}

export async function motDePasseOublie(req: Request, res: Response): Promise<void> {
  const corps = req.body as { email: string };
  await authService.demanderReinitialisation(corps.email);
  // Toujours la même réponse, que l'email existe ou non (anti-énumération).
  res.json({
    message: "Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.",
  });
}

export async function reinitialiserMotDePasse(req: Request, res: Response): Promise<void> {
  const corps = req.body as { jeton: string; nouveauMotDePasse: string };
  await authService.reinitialiserMotDePasse(corps.jeton, corps.nouveauMotDePasse);
  res.json({ message: "Mot de passe réinitialisé. Tu peux te reconnecter." });
}

export async function moi(req: Request, res: Response): Promise<void> {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  const utilisateur = await authService.profilConnecte(req.utilisateur.id);
  res.json({ utilisateur });
}
