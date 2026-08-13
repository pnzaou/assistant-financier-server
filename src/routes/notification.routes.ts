import { Router } from "express";
import * as notificationController from "../controllers/notification.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";

const notificationRouter = Router();

notificationRouter.use(middlewareJwt);
notificationRouter.post("/test", notificationController.envoyerTest);
notificationRouter.post("/test-anomalies", notificationController.testerAnomalies);

export default notificationRouter;
