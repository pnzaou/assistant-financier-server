import pino from "pino";

const enProduction = process.env.NODE_ENV === "production";

/**
 * Logger applicatif.
 *
 * En production : une ligne JSON par événement sur stdout. C'est ce que
 * Kubernetes ramasse et ce que Log Analytics sait indexer — une ligne de texte
 * libre à la `morgan` n'est pas requêtable, alors qu'un objet JSON se filtre
 * par `statusCode`, `requestId` ou `dureeMs`.
 *
 * En développement : sortie colorée et lisible via pino-pretty, qui est une
 * dépendance de dev. L'image de production est construite avec
 * `npm ci --omit=dev` : le transport ne doit donc JAMAIS être activé quand
 * NODE_ENV vaut "production", sinon le serveur planterait au démarrage sur un
 * module introuvable.
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
  ...(enProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname,service",
          },
        },
      }),
});
