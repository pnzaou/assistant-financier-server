import type { Request, Response } from "express";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as dashboardService from "../services/dashboard.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

export async function soldes(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const resultat = await dashboardService.obtenirSoldes(utilisateur.id);
  res.json(resultat);
}

export async function depensesParCategorie(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const resultat = await dashboardService.obtenirDepensesParCategorie(
    utilisateur.id,
    req.query.du as string | undefined,
    req.query.au as string | undefined,
  );
  res.json({ depenses: resultat });
}
