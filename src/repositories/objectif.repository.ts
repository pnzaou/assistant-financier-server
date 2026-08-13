import { prisma } from "../config/prisma.js";
import type { CreerObjectifDto } from "../dtos/objectif.dto.js";

export function creer(personneId: string, donnees: CreerObjectifDto) {
  return prisma.objectifEpargne.create({
    data: {
      personneId,
      nom: donnees.nom,
      montantCible: donnees.montantCible,
      ...(donnees.montantActuel !== undefined && { montantActuel: donnees.montantActuel }),
      ...(donnees.dateEcheance && { dateEcheance: new Date(donnees.dateEcheance) }),
      ...(donnees.compteId && { compteId: donnees.compteId }),
    },
  });
}

export function listerParPersonne(personneId: string) {
  return prisma.objectifEpargne.findMany({
    where: { personneId },
    orderBy: { createdAt: "asc" },
  });
}

export function trouverParId(id: string) {
  return prisma.objectifEpargne.findUnique({ where: { id } });
}

export function mettreAJour(id: string, donnees: { montantActuel?: number }) {
  return prisma.objectifEpargne.update({
    where: { id },
    data: { ...(donnees.montantActuel !== undefined && { montantActuel: donnees.montantActuel }) },
  });
}

/**
 * `statut` est une colonne enum côté Prisma : un `string` large y est refusé.
 * On reprend donc les valeurs du schéma. Le service calcule déjà un littéral
 * (`"ATTEINT"` ou `"EN_COURS"`) — c'était l'élargissement en `string` qui
 * cassait le typage.
 */
type StatutObjectif = "EN_COURS" | "ATTEINT" | "ABANDONNE";

export function mettreAJourStatut(id: string, statut: StatutObjectif) {
  return prisma.objectifEpargne.update({ where: { id }, data: { statut } });
}
