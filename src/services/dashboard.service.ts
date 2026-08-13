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

export interface VueEnsembleDto {
  revenus: number;
  depenses: number;
  epargne: number;
  budgetPourcentage: number | null;
  variationSoldePourcentage: number | null;
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

// Consommation agrégée des budgets MENSUELS actifs de l'utilisateur, en %
// du total des plafonds. `null` si l'utilisateur n'a aucun budget actif —
// le front doit alors masquer la tuile plutôt qu'afficher un faux 0%.
async function calculerBudgetPourcentage(
  personneId: string,
  compteIds: string[],
  debut: Date,
  fin: Date,
): Promise<number | null> {
  const budgets = await prisma.budget.findMany({
    where: { personneId, actif: true, periode: "MENSUEL" },
  });
  if (budgets.length === 0) {
    return null;
  }

  const plafondTotal = budgets.reduce(
    (total, budget) => total + budget.montantPlafond.toNumber(),
    0,
  );
  if (plafondTotal <= 0) {
    return null;
  }

  const categorieIds = budgets.map((budget) => budget.categorieId);
  const depensesAgg = await prisma.transaction.aggregate({
    where: {
      compteId: { in: compteIds },
      type: "DEPENSE",
      categorieId: { in: categorieIds },
      dateOperation: { gte: debut, lte: fin },
    },
    _sum: { montant: true },
  });
  const depensesBudgetees = depensesAgg._sum.montant?.toNumber() ?? 0;

  return Math.round((depensesBudgetees / plafondTotal) * 100);
}

export async function obtenirVueEnsemble(personneId: string): Promise<VueEnsembleDto> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  const compteIds = comptes.map((compte) => compte.id);
  const { debut, fin } = premierEtDernierJourDuMois(new Date());

  const [revenusAgg, depensesAgg, soldesActuels, soldesDebutMois, budgetPourcentage] =
    await Promise.all([
      prisma.transaction.aggregate({
        where: {
          compteId: { in: compteIds },
          type: "REVENU",
          dateOperation: { gte: debut, lte: fin },
        },
        _sum: { montant: true },
      }),
      prisma.transaction.aggregate({
        where: {
          compteId: { in: compteIds },
          type: "DEPENSE",
          dateOperation: { gte: debut, lte: fin },
        },
        _sum: { montant: true },
      }),
      Promise.all(comptes.map((compte) => calculerSolde(compte))),
      Promise.all(comptes.map((compte) => calculerSolde(compte, debut))),
      calculerBudgetPourcentage(personneId, compteIds, debut, fin),
    ]);

  const revenus = revenusAgg._sum.montant?.toNumber() ?? 0;
  const depenses = depensesAgg._sum.montant?.toNumber() ?? 0;

  const totalActuel = soldesActuels.reduce((total, solde) => total + solde, 0);
  const totalDebutMois = soldesDebutMois.reduce((total, solde) => total + solde, 0);
  const variationSoldePourcentage =
    totalDebutMois !== 0 ? ((totalActuel - totalDebutMois) / Math.abs(totalDebutMois)) * 100 : null;

  return {
    revenus,
    depenses,
    epargne: revenus - depenses,
    budgetPourcentage,
    variationSoldePourcentage,
  };
}
