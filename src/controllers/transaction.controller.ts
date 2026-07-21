import type { Request, Response } from "express";
import type {
  CreerTransactionDto,
  ListerTransactionsFiltresDto,
  ModifierTransactionDto,
} from "../dtos/transaction.dto.js";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as transactionService from "../services/transaction.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

// req.params.id est garanti défini par le validateur (isUUID) en amont ;
// noUncheckedIndexedAccess le type en `string | undefined` côté TS.
function idParametre(req: Request): string {
  return req.params.id as string;
}

function chaineDepuisQuery(valeur: unknown): string | undefined {
  return typeof valeur === "string" ? valeur : undefined;
}

export async function creer(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const transaction = await transactionService.creerTransaction(
    utilisateur.id,
    req.body as CreerTransactionDto,
  );
  res.status(201).json({ transaction });
}

export async function lister(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const compteId = chaineDepuisQuery(req.query.compteId);
  const categorieId = chaineDepuisQuery(req.query.categorieId);
  const du = chaineDepuisQuery(req.query.du);
  const au = chaineDepuisQuery(req.query.au);
  const filtres: ListerTransactionsFiltresDto = {
    ...(compteId !== undefined ? { compteId } : {}),
    ...(categorieId !== undefined ? { categorieId } : {}),
    ...(du !== undefined ? { du } : {}),
    ...(au !== undefined ? { au } : {}),
    page: req.query.page ? Number(req.query.page) : 1,
    limite: req.query.limite ? Number(req.query.limite) : 20,
  };
  const resultat = await transactionService.listerTransactions(utilisateur.id, filtres);
  res.json({ transactions: resultat });
}

export async function obtenir(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const transaction = await transactionService.obtenirTransaction(idParametre(req), utilisateur.id);
  res.json({ transaction });
}

export async function modifier(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const transaction = await transactionService.modifierTransaction(
    idParametre(req),
    utilisateur.id,
    req.body as ModifierTransactionDto,
  );
  res.json({ transaction });
}

export async function supprimer(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  await transactionService.supprimerTransaction(idParametre(req), utilisateur.id);
  res.status(204).send();
}
