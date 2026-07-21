import { body, param, query } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

const TYPES_TRANSACTION = ["DEPENSE", "REVENU"];

export const validerCreationTransaction = [
  body("compteId").isUUID().withMessage("compteId invalide."),
  body("montant").isFloat({ gt: 0 }).withMessage("Le montant doit être un nombre positif."),
  body("type").isIn(TYPES_TRANSACTION).withMessage("Type de transaction invalide."),
  body("libelle").trim().notEmpty().withMessage("Le libellé est requis.").isLength({ max: 200 }),
  body("note").optional().isString().isLength({ max: 500 }),
  body("dateOperation").isISO8601().withMessage("Date d'opération invalide (format AAAA-MM-JJ)."),
  body("categorieId").optional().isUUID().withMessage("categorieId invalide."),
  gererValidation,
];

export const validerModificationTransaction = [
  param("id").isUUID().withMessage("Identifiant de transaction invalide."),
  body("montant")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Le montant doit être un nombre positif."),
  body("libelle").optional().trim().notEmpty().isLength({ max: 200 }),
  body("note").optional().isString().isLength({ max: 500 }),
  body("dateOperation").optional().isISO8601().withMessage("Date d'opération invalide."),
  body("categorieId").optional().isUUID().withMessage("categorieId invalide."),
  body("pointee").optional().isBoolean(),
  gererValidation,
];

export const validerIdTransaction = [
  param("id").isUUID().withMessage("Identifiant de transaction invalide."),
  gererValidation,
];

export const validerListeTransactions = [
  query("compteId").optional().isUUID().withMessage("compteId invalide."),
  query("categorieId").optional().isUUID().withMessage("categorieId invalide."),
  query("du").optional().isISO8601().withMessage("Date 'du' invalide."),
  query("au").optional().isISO8601().withMessage("Date 'au' invalide."),
  query("page").optional().isInt({ min: 1 }).withMessage("page doit être un entier >= 1."),
  query("limite")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limite doit être entre 1 et 100."),
  gererValidation,
];
