import { Router } from "express";
import * as categorieController from "../controllers/categorie.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";

const categorieRouter = Router();

categorieRouter.use(middlewareJwt);
categorieRouter.get("/", categorieController.lister);

export default categorieRouter;
