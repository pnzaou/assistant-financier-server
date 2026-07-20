import type { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";

// À placer en fin de chaîne express-validator : si des règles ont échoué,
// renvoie 422 avec le détail champ par champ ; sinon laisse passer.
export function gererValidation(req: Request, res: Response, next: NextFunction): void {
  const resultat = validationResult(req);
  if (resultat.isEmpty()) {
    next();
    return;
  }
  const erreurs = resultat.array().map((erreur) => ({
    champ: erreur.type === "field" ? erreur.path : undefined,
    message: String(erreur.msg),
  }));
  res.status(422).json({ message: "Données invalides.", erreurs });
}
