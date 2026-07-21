import { prisma } from "../config/prisma.js";
import type { CreerCompteDto } from "../dtos/compte.dto.js";

export function creer(personneId: string, donnees: CreerCompteDto) {
  return prisma.compteFinancier.create({
    data: {
      personneId,
      nom: donnees.nom,
      ...(donnees.type && { type: donnees.type }),
      ...(donnees.soldeInitial !== undefined && { soldeInitial: donnees.soldeInitial }),
      ...(donnees.devise && { devise: donnees.devise }),
      ...(donnees.institution && { institution: donnees.institution }),
      ...(donnees.couleur && { couleur: donnees.couleur }),
    },
  });
}

export function listerParPersonne(personneId: string) {
  return prisma.compteFinancier.findMany({
    where: { personneId, archiveLe: null },
    orderBy: { createdAt: "asc" },
  });
}

export function trouverParId(id: string) {
  return prisma.compteFinancier.findUnique({ where: { id } });
}
