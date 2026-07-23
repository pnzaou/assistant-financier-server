import { Router } from "express";
import authRouter from "./auth.routes.js";
import categorieRouter from "./categorie.routes.js";
import chatbotRouter from "./chatbot.routes.js";
import compteRouter from "./compte.routes.js";
import dashboardRouter from "./dashboard.routes.js";
import transactionRouter from "./transaction.routes.js";

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/comptes", compteRouter);
appRouter.use("/categories", categorieRouter);
appRouter.use("/transactions", transactionRouter);
appRouter.use("/dashboard", dashboardRouter);
appRouter.use("/chatbot", chatbotRouter);

export default appRouter;
