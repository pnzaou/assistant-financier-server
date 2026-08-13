import { prisma } from "../config/prisma.js";
import type { PeriodeBudgetDto } from "../dtos/budget.dto.js";

export function creer(
  personneId: string,
  categorieId: string,
  donnees: { montantPlafond: number; periode: PeriodeBudgetDto },
) {
  return prisma.budget.create({
    data: {
      personneId,
      categorieId,
      montantPlafond: donnees.montantPlafond,
      periode: donnees.periode,
    },
  });
}

export function trouverActif(personneId: string, categorieId: string, periode: PeriodeBudgetDto) {
  return prisma.budget.findFirst({ where: { personneId, categorieId, periode } });
}

export function listerParPersonne(personneId: string) {
  return prisma.budget.findMany({
    where: { personneId, actif: true },
    orderBy: { createdAt: "asc" },
  });
}
