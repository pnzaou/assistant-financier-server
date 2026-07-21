import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import { validerPeriode } from "../validators/dashboard.validator.js";

const dashboardRouter = Router();

dashboardRouter.use(middlewareJwt);
dashboardRouter.get("/soldes", dashboardController.soldes);
dashboardRouter.get(
  "/depenses-par-categorie",
  validerPeriode,
  dashboardController.depensesParCategorie,
);

export default dashboardRouter;
