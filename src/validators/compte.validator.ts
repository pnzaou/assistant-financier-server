import { body } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

const TYPES_COMPTE = ["COURANT", "EPARGNE", "CARTE_CREDIT", "ESPECES", "INVESTISSEMENT", "AUTRE"];

export const validerCreationCompte = [
  body("nom").trim().notEmpty().withMessage("Le nom du compte est requis.").isLength({ max: 100 }),
  body("type").optional().isIn(TYPES_COMPTE).withMessage("Type de compte invalide."),
  body("soldeInitial").optional().isFloat().withMessage("Le solde initial doit être un nombre."),
  body("devise")
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage("La devise doit être un code ISO 4217 à 3 lettres."),
  body("institution").optional().isString().isLength({ max: 100 }),
  body("couleur").optional().isString().isLength({ max: 20 }),
  gererValidation,
];
