// dotenv en PREMIER : en ESM, les imports s'exécutent avant le corps du module.
// Un appel config() placé plus bas s'exécuterait APRÈS les routes/services
// importés (et donc après config/prisma.ts, qui lit DATABASE_URL).
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { prisma } from "./config/prisma.js";
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

app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

// Vérifie que l'API répond et que la base est joignable (via le client généré).
app.get("/health", async (_req, res) => {
  try {
    const categories = await prisma.categorie.count();
    res.json({ status: "ok", db: "ok", categories });
  } catch {
    res.status(503).json({ status: "ok", db: "down" });
  }
});

app.use("/api/v1", appRouter);

// Après toutes les routes : 404 JSON propre pour les URLs inconnues...
app.use((_req, res) => {
  res.status(404).json({ message: "Route introuvable." });
});

// ...et le filet final : exceptions métier → bon statut, imprévus → 500 loggé.
app.use(middlewareErreurs);

export default app;
