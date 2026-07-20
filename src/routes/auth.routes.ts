import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import {
  validerEmailSeul,
  validerJeton,
  validerLogin,
  validerRegister,
  validerReinitialisation,
} from "../validators/auth.validator.js";

const authRouter = Router();

// ── Routes publiques ─────────────────────────────────────────────
authRouter.post("/register", validerRegister, authController.register);
authRouter.post("/login", validerLogin, authController.login);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.post("/verifier-email", validerJeton, authController.verifierEmail);
authRouter.post("/mot-de-passe-oublie", validerEmailSeul, authController.motDePasseOublie);
authRouter.post(
  "/reinitialiser-mot-de-passe",
  validerReinitialisation,
  authController.reinitialiserMotDePasse,
);

// ── Routes authentifiées ─────────────────────────────────────────
authRouter.get("/moi", middlewareJwt, authController.moi);
authRouter.post("/renvoyer-verification", middlewareJwt, authController.renvoyerVerification);

export default authRouter;
