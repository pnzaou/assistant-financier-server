import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Registre Prometheus de l'API.
 *
 * Un registre dédié plutôt que le registre global : les tests peuvent le
 * remettre à zéro sans effet de bord, et rien d'extérieur ne vient y déposer
 * de métriques parasites.
 */
export const registre = new Registry();

registre.setDefaultLabels({ service: "assistant-financier-api" });

// Métriques du process Node : mémoire, boucle d'événements, descripteurs de
// fichiers, GC. C'est ce qui répond à « le service sature-t-il ? » — le
// quatrième des signaux d'or, celui qu'on oublie le plus souvent.
collectDefaultMetrics({ register: registre });

/**
 * Durée des requêtes HTTP.
 *
 * Les bornes sont choisies pour CETTE API, pas reprises des valeurs par défaut :
 * la connexion hache le mot de passe avec bcrypt à 12 tours (~250 ms), donc une
 * échelle qui s'arrêterait à 100 ms mettrait toutes les requêtes d'auth dans le
 * même seau et rendrait le p95 illisible.
 */
export const dureeRequetes = new Histogram({
  name: "http_requetes_duree_secondes",
  help: "Durée des requêtes HTTP en secondes",
  labelNames: ["methode", "route", "statut"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registre],
});

/** Nombre de requêtes HTTP servies, ventilé par route et par code. */
export const totalRequetes = new Counter({
  name: "http_requetes_total",
  help: "Nombre total de requêtes HTTP",
  labelNames: ["methode", "route", "statut"] as const,
  registers: [registre],
});

/**
 * Erreurs métier remontées au client (4xx et 5xx), par type d'exception.
 * Permet de distinguer « 400 parce que l'utilisateur s'est trompé » de
 * « 500 parce que le service est cassé », que le seul code HTTP confond.
 */
export const totalErreurs = new Counter({
  name: "api_erreurs_total",
  help: "Erreurs renvoyées au client, par type",
  labelNames: ["type", "statut"] as const,
  registers: [registre],
});
