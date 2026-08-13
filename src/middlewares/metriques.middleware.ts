import type { NextFunction, Request, Response } from "express";
import { dureeRequetes, totalRequetes } from "../config/metriques.js";

/**
 * Étiquette de route pour Prometheus.
 *
 * On renvoie le MOTIF de la route (`/api/v1/transactions/:id`), jamais l'URL
 * réelle (`/api/v1/transactions/0193f2a1-…`). C'est le piège classique des
 * métriques HTTP : avec l'URL brute, chaque identifiant crée une nouvelle série
 * temporelle. Quelques milliers de transactions consultées suffisent à faire
 * exploser la mémoire de Prometheus.
 *
 * `req.route` n'est renseigné qu'APRÈS l'appariement d'une route — d'où le
 * calcul dans le gestionnaire `finish` et non à l'entrée du middleware.
 */
function etiquetteRoute(req: Request): string {
  const motif = (req.route as { path?: string } | undefined)?.path;

  if (motif) {
    // baseUrl porte les préfixes de montage successifs
    // ("/api/v1/transactions"), motif la partie propre à la route ("/:id").
    const chemin = `${req.baseUrl}${motif}`;
    // Une route montée sur "/" produirait "/api/v1/comptes/" : on normalise.
    return chemin.length > 1 ? chemin.replace(/\/$/, "") : chemin;
  }

  // Pas de route appariée. Deux cas très différents se cachent derrière :
  //
  //  1. Une requête rejetée par un middleware de routeur AVANT l'appariement —
  //     c'est le cas de tous les 401, les routeurs protégés déclarant
  //     `router.use(middlewareJwt)`. baseUrl vaut alors le point de montage
  //     ("/api/v1/comptes"), ce qui reste parfaitement exploitable et de
  //     cardinalité bornée : les points de montage sont en nombre fini.
  //
  //  2. Une URL qui ne correspond à rien : scanners, robots, fautes de frappe.
  //     baseUrl est vide, et l'URL brute est arbitraire — on regroupe donc tout
  //     sous une étiquette unique pour qu'un scanner ne puisse pas, à lui seul,
  //     faire exploser le nombre de séries temporelles.
  return req.baseUrl || "__inconnu";
}

/** Mesure durée et volume de chaque requête servie. */
export function middlewareMetriques(req: Request, res: Response, next: NextFunction): void {
  // `/metrics` est exclu : le laisser se compter lui-même ajouterait un point
  // à chaque collecte, sans rien apprendre sur l'application.
  if (req.path === "/metrics") {
    next();
    return;
  }

  const fin = dureeRequetes.startTimer();

  res.on("finish", () => {
    const etiquettes = {
      methode: req.method,
      route: etiquetteRoute(req),
      statut: String(res.statusCode),
    };
    fin(etiquettes);
    totalRequetes.inc(etiquettes);
  });

  next();
}
