import { Router } from "express";
import * as objectifController from "../controllers/objectif.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import { validerCreationObjectif } from "../validators/objectif.validator.js";

const objectifRouter = Router();

objectifRouter.use(middlewareJwt);
objectifRouter.post("/", validerCreationObjectif, objectifController.creer);
objectifRouter.get("/", objectifController.lister);
objectifRouter.patch("/:id", objectifController.modifier);

export default objectifRouter;
