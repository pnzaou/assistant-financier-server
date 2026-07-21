import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";

interface DonneesCreationTransaction {
  compteId: string;
  categorieId: string;
  montant: number;
  type: "DEPENSE" | "REVENU";
  libelle: string;
  note?: string;
  dateOperation: Date;
}

export function creer(donnees: DonneesCreationTransaction) {
  return prisma.transaction.create({ data: donnees });
}

export function trouverParId(id: string) {
  return prisma.transaction.findUnique({ where: { id } });
}

interface FiltresListe {
  compteIds: string[];
  categorieId?: string;
  du?: Date;
  au?: Date;
  page: number;
  limite: number;
}

function clauseOu(filtres: FiltresListe): Prisma.TransactionWhereInput {
  return {
    compteId: { in: filtres.compteIds },
    ...(filtres.categorieId ? { categorieId: filtres.categorieId } : {}),
    ...(filtres.du || filtres.au
      ? {
          dateOperation: {
            ...(filtres.du ? { gte: filtres.du } : {}),
            ...(filtres.au ? { lte: filtres.au } : {}),
          },
        }
      : {}),
  };
}

export async function lister(filtres: FiltresListe) {
  const where = clauseOu(filtres);
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { dateOperation: "desc" },
      skip: (filtres.page - 1) * filtres.limite,
      take: filtres.limite,
    }),
    prisma.transaction.count({ where }),
  ]);
  return { items, total };
}

export function modifier(id: string, donnees: Prisma.TransactionUpdateInput) {
  return prisma.transaction.update({ where: { id }, data: donnees });
}

export function supprimer(id: string) {
  return prisma.transaction.delete({ where: { id } });
}
