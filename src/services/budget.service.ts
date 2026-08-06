import type { Budget } from "../../generated/prisma/client.js";
import type { BudgetDto, CreerBudgetDto } from "../dtos/budget.dto.js";
import { ConflitException, RequeteInvalideException } from "../exceptions/http.exception.js";
import * as budgetRepository from "../repositories/budget.repository.js";
import * as categorieRepository from "../repositories/categorie.repository.js";

function versDto(budget: Budget): BudgetDto {
  return {
    id: budget.id,
    categorieId: budget.categorieId,
    montantPlafond: budget.montantPlafond.toNumber(),
    periode: budget.periode,
    actif: budget.actif,
  };
}

// Un budget plafonne des DÉPENSES : la catégorie doit exister et être de type
// DEPENSE, même contrôle que pour une transaction (voir transaction.service).
async function validerCategorieDepense(categorieId: string): Promise<void> {
  const categorie = await categorieRepository.trouverSystemeParId(categorieId);
  if (!categorie || categorie.type !== "DEPENSE") {
    throw new RequeteInvalideException("Catégorie invalide pour un budget.");
  }
}

export async function creerBudget(personneId: string, dto: CreerBudgetDto): Promise<BudgetDto> {
  await validerCategorieDepense(dto.categorieId);
  const periode = dto.periode ?? "MENSUEL";

  const existant = await budgetRepository.trouverActif(personneId, dto.categorieId, periode);
  if (existant) {
    throw new ConflitException("Un budget existe déjà pour cette catégorie sur cette période.");
  }

  const budget = await budgetRepository.creer(personneId, dto.categorieId, {
    montantPlafond: dto.montantPlafond,
    periode,
  });
  return versDto(budget);
}

export async function listerBudgets(personneId: string): Promise<BudgetDto[]> {
  const budgets = await budgetRepository.listerParPersonne(personneId);
  return budgets.map(versDto);
}
