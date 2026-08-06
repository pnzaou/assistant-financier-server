import { body } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

const PERIODES_BUDGET = ["HEBDOMADAIRE", "MENSUEL", "ANNUEL"];

export const validerCreationBudget = [
  body("categorieId").isUUID().withMessage("categorieId invalide."),
  body("montantPlafond").isFloat({ gt: 0 }).withMessage("Le plafond doit être un nombre positif."),
  body("periode").optional().isIn(PERIODES_BUDGET).withMessage("Période invalide."),
  gererValidation,
];
