import { prisma } from "../config/prisma.js";
import type { TypeCategorieDto } from "../dtos/categorie.dto.js";

export function listerSysteme(type?: TypeCategorieDto) {
  return prisma.categorie.findMany({
    where: { personneId: null, ...(type ? { type } : {}) },
    orderBy: { nom: "asc" },
  });
}

export function trouverSystemeParNomEtType(nom: string, type: TypeCategorieDto) {
  return prisma.categorie.findFirst({ where: { personneId: null, nom, type } });
}

export function trouverSystemeParId(id: string) {
  return prisma.categorie.findFirst({ where: { id, personneId: null } });
}
