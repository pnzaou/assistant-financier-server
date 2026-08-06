import type { Request, Response } from "express";
import type { CreerObjectifDto } from "../dtos/objectif.dto.js";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as objectifService from "../services/objectif.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

export async function creer(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const objectif = await objectifService.creerObjectif(
    utilisateur.id,
    req.body as CreerObjectifDto,
  );
  res.status(201).json({ objectif });
}

export async function lister(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const objectifs = await objectifService.listerObjectifs(utilisateur.id);
  res.json({ objectifs });
}

export async function modifier(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const id = req.params.id;
  const { montantActuel } = req.body as { montantActuel?: number };
  const objectif = await objectifService.mettreAJourObjectif(utilisateur.id, id, { montantActuel });
  res.json({ objectif });
}
