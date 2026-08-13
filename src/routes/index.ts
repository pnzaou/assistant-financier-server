import { Router } from "express";
import authRouter from "./auth.routes.js";
import budgetRouter from "./budget.routes.js";
import categorieRouter from "./categorie.routes.js";
import chatbotRouter from "./chatbot.routes.js";
import compteRouter from "./compte.routes.js";
import dashboardRouter from "./dashboard.routes.js";
import notificationRouter from "./notification.routes.js";
import objectifRouter from "./objectif.routes.js";
import transactionRouter from "./transaction.routes.js";

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/comptes", compteRouter);
appRouter.use("/categories", categorieRouter);
appRouter.use("/transactions", transactionRouter);
appRouter.use("/dashboard", dashboardRouter);
appRouter.use("/budgets", budgetRouter);
appRouter.use("/objectifs", objectifRouter);
appRouter.use("/notifications", notificationRouter);
appRouter.use("/chatbot", chatbotRouter);

export default appRouter;
