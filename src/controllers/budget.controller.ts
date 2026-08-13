import type { Request, Response } from "express";
import type { CreerBudgetDto } from "../dtos/budget.dto.js";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as budgetService from "../services/budget.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

export async function creer(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const budget = await budgetService.creerBudget(utilisateur.id, req.body as CreerBudgetDto);
  res.status(201).json({ budget });
}

export async function lister(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const budgets = await budgetService.listerBudgets(utilisateur.id);
  res.json({ budgets });
}
