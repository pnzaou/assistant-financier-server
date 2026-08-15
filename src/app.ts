// dotenv en PREMIER : en ESM, les imports s'exécutent avant le corps du module.
// Un appel config() placé plus bas s'exécuterait APRÈS les routes/services
// importés (et donc après config/prisma.ts, qui lit DATABASE_URL).
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
// Import nommé et non par défaut : le paquet expose les deux, mais en ESM avec
// `verbatimModuleSyntax` TypeScript résout l'import par défaut vers l'espace de
// noms du module, qui n'est pas appelable.
import { pinoHttp } from "pino-http";
import { prisma } from "./config/prisma.js";
import { journal } from "./config/journal.js";
import { registre } from "./config/metriques.js";
import { serviceDisponible } from "./config/etat-service.js";
import { middlewareMetriques } from "./middlewares/metriques.middleware.js";
import { middlewareErreurs } from "./middlewares/erreurs.middleware.js";
import appRouter from "./routes/index.js";

const app = express();

const allowedOrigins = (process.env.CLIENT_URLS ?? "http://localhost:5173")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const allowedOriginPatterns = [
  /^https?:\/\/192\.168\.\d+\.\d+:(5000|5173)$/,
  /^exp:\/\/192\.168\.\d+\.\d+:\d+$/,
];

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (allowedOriginPatterns.some((pattern) => pattern.test(origin))) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} non autorisée`));
    },
    credentials: true,
  }),
);

// Journalisation structurée. Remplace morgan : une ligne de texte libre n'est
// pas requêtable, un objet JSON se filtre par requestId, statut ou durée.
app.use(
  pinoHttp({
    logger: journal,

    // Identifiant de corrélation. On honore celui du client s'il en fournit un
    // (utile quand le front instrumentera ses appels), sinon on en génère un.
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const existant = req.headers["x-request-id"];
      const id = (Array.isArray(existant) ? existant[0] : existant) ?? randomUUID();
      // Renvoyé au client : il peut le citer dans un rapport de bug, et on
      // retrouve alors la requête exacte dans les journaux.
      res.setHeader("X-Request-Id", id);
      return id;
    },

    // Un 4xx est une erreur d'usage, pas une panne : le classer en `error`
    // noierait les vraies alertes.
    customLogLevel(_req: IncomingMessage, res: ServerResponse, err?: Error) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },

    customSuccessMessage(req: IncomingMessage, res: ServerResponse) {
      // `originalUrl` et non `url` : Express réécrit `req.url` relativement au
      // point de montage du routeur, si bien qu'une requête vers
      // /api/v1/comptes s'afficherait « GET / ».
      const url = (req as { originalUrl?: string }).originalUrl ?? req.url;
      return `${req.method} ${url} → ${res.statusCode}`;
    },

    // Sérialiseurs réduits à l'essentiel. Par défaut, pino-http recopie TOUS
    // les en-têtes de requête et de réponse : avec ceux que pose helmet, une
    // ligne atteint ~1,5 Ko. À 30 requêtes/s cela représente ~47 Go par mois
    // d'ingestion Log Analytics, soit plus de 100 $ — pour des en-têtes
    // identiques d'une ligne à l'autre.
    //
    // ATTENTION : pino-http active `wrapSerializers` par défaut. Ces fonctions
    // reçoivent donc la sortie du sérialiseur STANDARD (déjà aplatie), et non
    // la requête Node brute — d'où `remoteAddress` et non `socket.remoteAddress`.
    serializers: {
      req(req: {
        id?: string;
        method?: string;
        url?: string;
        remoteAddress?: string;
        headers?: Record<string, string | string[] | undefined>;
      }) {
        return {
          id: req.id,
          methode: req.method,
          // Le sérialiseur standard a déjà résolu originalUrl : pas de "/" ici.
          url: req.url,
          // Conservés : c'est ce qui permet de repérer un scanner ou de
          // corréler une série d'appels suspects.
          ip: req.remoteAddress,
          agent: req.headers?.["user-agent"],
        };
      },
      res(res: { statusCode?: number }) {
        return { statut: res.statusCode };
      },
    },

    autoLogging: {
      // Les sondes de vivacité frappent /health toutes les 10 s par pod, et
      // Prometheus /metrics toutes les 30 s. Les journaliser produirait des
      // milliers de lignes sans intérêt qui masqueraient le trafic réel.
      ignore: (req: IncomingMessage) => req.url === "/health" || req.url === "/metrics",
    },
  }),
);

app.use(middlewareMetriques);
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

/**
 * Sonde de disponibilité.
 *
 * Répond 503 pendant l'arrêt en douceur : c'est ce qui indique à Kubernetes de
 * cesser de router du trafic vers ce pod avant qu'il ne ferme ses connexions.
 */
app.get("/health", async (_req, res) => {
  if (!serviceDisponible()) {
    res.status(503).json({ status: "arret_en_cours" });
    return;
  }
  try {
    const categories = await prisma.categorie.count();
    res.json({ status: "ok", db: "ok", categories });
  } catch {
    res.status(503).json({ status: "ok", db: "down" });
  }
});

/**
 * Métriques Prometheus.
 *
 * Non exposé publiquement : l'Ingress ne route que /api et /health vers cette
 * API, tout le reste va au front. Prometheus, lui, scrute le Service
 * directement à l'intérieur du cluster (voir le ServiceMonitor du chart Helm).
 */
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registre.contentType);
  res.send(await registre.metrics());
});

app.use("/api/v1", appRouter);

// Après toutes les routes : 404 JSON propre pour les URLs inconnues...
app.use((_req, res) => {
  res.status(404).json({ message: "Route introuvable." });
});

// ...et le filet final : exceptions métier → bon statut, imprévus → 500 loggé.
app.use(middlewareErreurs);

export default app;
