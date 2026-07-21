import { Router } from "express";
import authRouter from "./auth.routes.js";
import categorieRouter from "./categorie.routes.js";
import compteRouter from "./compte.routes.js";

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/comptes", compteRouter);
appRouter.use("/categories", categorieRouter);

export default appRouter;
