import type { NextFunction, Request, Response } from "express";
import { HttpException } from "../exceptions/http.exception.js";
import { journal } from "../config/journal.js";
import { totalErreurs } from "../config/metriques.js";

// Le filet de sécurité final d'Express — reconnu comme gestionnaire d'erreurs
// à ses 4 paramètres. Express 5 y envoie automatiquement les erreurs (et
// rejets de promesses) de tous les handlers, y compris async.
export function middlewareErreurs(
  erreur: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (erreur instanceof HttpException) {
    // Erreur métier attendue : on la compte par type (NonAutorise, Conflit…)
    // pour distinguer « l'utilisateur s'est trompé » de « le service est
    // cassé » — deux situations que le seul code HTTP confond.
    totalErreurs.inc({ type: erreur.constructor.name, statut: String(erreur.statut) });
    res.status(erreur.statut).json({ message: erreur.message });
    return;
  }

  // Erreur imprévue : tout est journalisé côté serveur, rien ne fuite au
  // client (ni trace d'appels, ni détail interne).
  totalErreurs.inc({ type: "Imprevue", statut: "500" });
  journal.error(
    {
      err: erreur,
      // `req.id` est posé par pino-http : il relie cette erreur à la ligne de
      // journal de la requête, et au X-Request-Id renvoyé au client.
      requestId: req.id,
      methode: req.method,
      url: req.originalUrl,
    },
    "Erreur non gérée",
  );
  res.status(500).json({ message: "Erreur interne du serveur." });
}
