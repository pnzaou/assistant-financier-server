import { query } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

export const validerPeriode = [
  query("du").optional().isISO8601().withMessage("Date 'du' invalide."),
  query("au").optional().isISO8601().withMessage("Date 'au' invalide."),
  gererValidation,
];
