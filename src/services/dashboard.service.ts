import { prisma } from "../config/prisma.js";
import * as compteRepository from "../repositories/compte.repository.js";
import { calculerSolde } from "./solde.service.js";

export interface SoldeCompteDto {
  compteId: string;
  nom: string;
  solde: number;
  devise: string;
}

export interface SoldesDto {
  comptes: SoldeCompteDto[];
  totalGlobal: number;
}

export interface DepenseParCategorieDto {
  categorieId: string;
  nomCategorie: string;
  montantTotal: number;
}

export async function obtenirSoldes(personneId: string): Promise<SoldesDto> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  const soldes = await Promise.all(
    comptes.map(async (compte) => ({
      compteId: compte.id,
      nom: compte.nom,
      solde: await calculerSolde(compte),
      devise: compte.devise,
    })),
  );
  return {
    comptes: soldes,
    totalGlobal: soldes.reduce((total, compte) => total + compte.solde, 0),
  };
}

function premierEtDernierJourDuMois(reference: Date): { debut: Date; fin: Date } {
  const debut = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0));
  return { debut, fin };
}

export async function obtenirDepensesParCategorie(
  personneId: string,
  du?: string,
  au?: string,
): Promise<DepenseParCategorieDto[]> {
  const { debut, fin } = premierEtDernierJourDuMois(new Date());
  const periode = { debut: du ? new Date(du) : debut, fin: au ? new Date(au) : fin };

  const comptes = await compteRepository.listerParPersonne(personneId);
  const compteIds = comptes.map((compte) => compte.id);

  const regroupement = await prisma.transaction.groupBy({
    by: ["categorieId"],
    where: {
      compteId: { in: compteIds },
      type: "DEPENSE",
      categorieId: { not: null },
      dateOperation: { gte: periode.debut, lte: periode.fin },
    },
    _sum: { montant: true },
  });

  const idsCategories = regroupement
    .map((ligne) => ligne.categorieId)
    .filter((id): id is string => id !== null);
  const categories = await prisma.categorie.findMany({ where: { id: { in: idsCategories } } });
  const nomParId = new Map(categories.map((categorie) => [categorie.id, categorie.nom]));

  return regroupement
    .filter((ligne): ligne is typeof ligne & { categorieId: string } => ligne.categorieId !== null)
    .map((ligne) => ({
      categorieId: ligne.categorieId,
      nomCategorie: nomParId.get(ligne.categorieId) ?? "Inconnue",
      montantTotal: ligne._sum.montant?.toNumber() ?? 0,
    }));
}
