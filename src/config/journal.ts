import pino from "pino";

const enProduction = process.env.NODE_ENV === "production";

/**
 * Sortie colorée via pino-pretty : opt-in EXPLICITE, jamais déduite.
 *
 * Le critère était auparavant `NODE_ENV !== "production"`, et c'était faux.
 * L'image de production est construite avec `npm ci --omit=dev`, donc sans
 * pino-pretty — mais rien n'oblige cette image à tourner avec
 * NODE_ENV=production. La stack e2e la démarre justement en `development`
 * pour que les cookies de session fonctionnent en HTTP, et le serveur
 * plantait alors au démarrage :
 *
 *     Error: unable to determine transport target for "pino-pretty"
 *
 * La disponibilité du module dépend de la façon dont l'image a été
 * construite, pas de la valeur de NODE_ENV. Un drapeau dédié dit exactement
 * ce qu'il veut dire, et vaut `false` partout où on ne l'a pas demandé.
 */
const sortieLisible = process.env.LOG_PRETTY === "true";

/**
 * Logger applicatif.
 *
 * Par défaut : une ligne JSON par événement sur stdout. C'est ce que
 * Kubernetes ramasse et ce que Log Analytics sait indexer — une ligne de texte
 * libre à la `morgan` n'est pas requêtable, alors qu'un objet JSON se filtre
 * par `statusCode`, `requestId` ou `dureeMs`.
 */
export const journal = pino({
  level: process.env.LOG_LEVEL ?? (enProduction ? "info" : "debug"),

  // `time` en ISO plutôt qu'en millisecondes epoch : lisible tel quel dans
  // n'importe quel agrégateur, sans transformation.
  timestamp: pino.stdTimeFunctions.isoTime,

  // Uniformise le nom du niveau ("info" plutôt que 30) — la plupart des
  // agrégateurs filtrent sur la chaîne.
  formatters: {
    level: (etiquette) => ({ level: etiquette }),
  },

  // Ces champs ne doivent jamais atteindre les journaux. Un jeton d'accès
  // recopié dans un log survit à son expiration : il reste lisible par
  // quiconque a accès à l'agrégateur, bien après.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.motDePasse",
      "*.passwordHash",
      "*.jetonHash",
      "*.refreshToken",
      "*.accessToken",
    ],
    censor: "[masqué]",
  },

  base: {
    service: "assistant-financier-api",
  },

  // Diffusion conditionnelle plutôt que `transport: undefined` : le tsconfig
  // active `exactOptionalPropertyTypes`, qui distingue « clé absente » de
  // « clé présente valant undefined » et refuse la seconde.
  ...(sortieLisible
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname,service",
          },
        },
      }
    : {}),
});
