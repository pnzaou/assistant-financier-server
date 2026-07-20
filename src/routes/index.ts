import { Router } from "express";
import authRouter from "./auth.routes.js";

// La table des matières de l'API : tous les groupes de routes se lisent ici.
// Les URLs finales sont préfixées par /api/v1 (montage dans app.ts).
// Les futurs domaines métier (comptes, transactions, budgets…) viendront
// s'ajouter ici, chacun avec son propre routeur.
const appRouter = Router();

appRouter.use("/auth", authRouter);

export default appRouter;
