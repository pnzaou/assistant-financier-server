import { Router } from "express";
import * as budgetController from "../controllers/budget.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import { validerCreationBudget } from "../validators/budget.validator.js";

const budgetRouter = Router();

budgetRouter.use(middlewareJwt);
budgetRouter.post("/", validerCreationBudget, budgetController.creer);
budgetRouter.get("/", budgetController.lister);

export default budgetRouter;
