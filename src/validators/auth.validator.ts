import { body } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

// Le portier de l'API : rejette les entrées mal formées (422) AVANT que le
// controller ne soit appelé. Les règles métier (email déjà pris...) restent
// dans les services — ici on ne juge que la forme.

const emailValide = body("email").isEmail().withMessage("Adresse email invalide.").normalizeEmail();

const motDePasseFort = (champ: string) =>
  body(champ)
    .isLength({ min: 8 })
    .withMessage("Le mot de passe doit contenir au moins 8 caractères.")
    .matches(/[a-zA-Z]/)
    .withMessage("Le mot de passe doit contenir au moins une lettre.")
    .matches(/\d/)
    .withMessage("Le mot de passe doit contenir au moins un chiffre.");

const jetonRequis = body("jeton").isString().withMessage("Jeton requis.").notEmpty();

export const validerRegister = [
  emailValide,
  motDePasseFort("motDePasse"),
  body("nom").trim().notEmpty().withMessage("Le nom est requis.").isLength({ max: 100 }),
  body("prenom").trim().notEmpty().withMessage("Le prénom est requis.").isLength({ max: 100 }),
  gererValidation,
];

export const validerLogin = [
  emailValide,
  body("motDePasse").notEmpty().withMessage("Le mot de passe est requis."),
  gererValidation,
];

export const validerJeton = [jetonRequis, gererValidation];

export const validerEmailSeul = [emailValide, gererValidation];

export const validerReinitialisation = [
  jetonRequis,
  motDePasseFort("nouveauMotDePasse"),
  gererValidation,
];
