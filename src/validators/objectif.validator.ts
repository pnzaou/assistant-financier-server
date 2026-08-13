import { body } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

export const validerCreationObjectif = [
  body("nom")
    .trim()
    .notEmpty()
    .withMessage("Le nom de l'objectif est requis.")
    .isLength({ max: 100 }),
  body("montantCible")
    .isFloat({ gt: 0 })
    .withMessage("Le montant cible doit être un nombre positif."),
  body("montantActuel")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Le montant actuel doit être un nombre positif ou nul."),
  body("dateEcheance").optional().isISO8601().withMessage("Date d'échéance invalide."),
  body("compteId").optional().isUUID().withMessage("compteId invalide."),
  gererValidation,
];
