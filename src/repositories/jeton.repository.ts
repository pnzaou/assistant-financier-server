import { prisma } from "../config/prisma.js";

export type TypeJeton = "VERIFICATION_EMAIL" | "REINITIALISATION_MOT_DE_PASSE";

interface DonneesCreationJeton {
  personneId: string;
  type: TypeJeton;
  jetonHash: string;
  expireLe: Date;
}

export function creer(donnees: DonneesCreationJeton) {
  return prisma.jetonAuthentification.create({ data: donnees });
}

// Valide = jamais utilisé ET non expiré.
export function trouverValide(jetonHash: string, type: TypeJeton) {
  return prisma.jetonAuthentification.findFirst({
    where: { jetonHash, type, utiliseLe: null, expireLe: { gt: new Date() } },
    include: { personne: true },
  });
}

export function marquerUtilise(id: string) {
  return prisma.jetonAuthentification.update({ where: { id }, data: { utiliseLe: new Date() } });
}

// Avant d'émettre un nouveau jeton d'un type, on jette les anciens : il ne
// peut y avoir qu'un seul lien valable à la fois par personne et par usage.
export function supprimerPourPersonne(personneId: string, type: TypeJeton) {
  return prisma.jetonAuthentification.deleteMany({ where: { personneId, type } });
}
