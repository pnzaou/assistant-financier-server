import type { NextFunction, Request, Response } from "express";
import { HttpException } from "../exceptions/http.exception.js";

// Le filet de sécurité final d'Express — reconnu comme gestionnaire d'erreurs
// à ses 4 paramètres. Express 5 y envoie automatiquement les erreurs (et
// rejets de promesses) de tous les handlers, y compris async.
export function middlewareErreurs(
  erreur: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (erreur instanceof HttpException) {
    res.status(erreur.statut).json({ message: erreur.message });
    return;
  }
  // Erreur imprévue : tout est loggé côté serveur, rien ne fuite au client
  // (ni stack trace, ni détail interne).
  console.error(erreur); // TODO : brancher le vrai logger (tâche dédiée)
  res.status(500).json({ message: "Erreur interne du serveur." });
}
