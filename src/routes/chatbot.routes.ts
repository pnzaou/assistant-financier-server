import { Router } from "express";
import { chat } from "../controllers/chatbot.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";

const chatbotRouter = Router();
chatbotRouter.use(middlewareJwt);
chatbotRouter.post("/", chat);

export default chatbotRouter;
