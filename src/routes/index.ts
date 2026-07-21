import { Router } from "express";
import authRouter from "./auth.routes.js";
import compteRouter from "./compte.routes.js";

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/comptes", compteRouter);

export default appRouter;
