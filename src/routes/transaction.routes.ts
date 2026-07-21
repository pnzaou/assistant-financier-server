import { Router } from "express";
import * as transactionController from "../controllers/transaction.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import {
  validerCreationTransaction,
  validerIdTransaction,
  validerListeTransactions,
  validerModificationTransaction,
} from "../validators/transaction.validator.js";

const transactionRouter = Router();

transactionRouter.use(middlewareJwt);
transactionRouter.post("/", validerCreationTransaction, transactionController.creer);
transactionRouter.get("/", validerListeTransactions, transactionController.lister);
transactionRouter.get("/:id", validerIdTransaction, transactionController.obtenir);
transactionRouter.patch("/:id", validerModificationTransaction, transactionController.modifier);
transactionRouter.delete("/:id", validerIdTransaction, transactionController.supprimer);

export default transactionRouter;
