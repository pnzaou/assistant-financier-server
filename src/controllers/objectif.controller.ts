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
  // Même convention que transaction.controller.ts : Express 5 type params
  // comme `string | string[] | undefined`.
  // TODO : contrairement aux transactions, la route /objectifs/:id n'a pas de
  // validateur isUUID en amont. Un identifiant malformé produit donc un 500
  // au lieu d'un 400 — à traiter avec un `validerIdObjectif`.
  const id = req.params.id as string;
  const { montantActuel } = req.body as { montantActuel?: number };
  // `exactOptionalPropertyTypes` distingue « cle absente » de « cle valant
  // undefined » : passer { montantActuel: undefined } est refuse par une
  // signature qui declare `montantActuel?: number`.
  const objectif = await objectifService.mettreAJourObjectif(
    utilisateur.id,
    id,
    montantActuel === undefined ? {} : { montantActuel },
  );
  res.json({ objectif });
}
