import type { Request, Response } from "express";
import type { CreerCompteDto } from "../dtos/compte.dto.js";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as compteService from "../services/compte.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

export async function creer(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const compte = await compteService.creerCompte(utilisateur.id, req.body as CreerCompteDto);
  res.status(201).json({ compte });
}

export async function lister(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const comptes = await compteService.listerComptes(utilisateur.id);
  res.json({ comptes });
}
