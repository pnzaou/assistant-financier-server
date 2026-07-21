import { Router } from "express";
import * as compteController from "../controllers/compte.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import { validerCreationCompte } from "../validators/compte.validator.js";

const compteRouter = Router();

compteRouter.use(middlewareJwt);
compteRouter.post("/", validerCreationCompte, compteController.creer);
compteRouter.get("/", compteController.lister);

export default compteRouter;
