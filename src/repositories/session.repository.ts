import { prisma } from "../config/prisma.js";

interface DonneesCreationSession {
  personneId: string;
  jetonHash: string;
  expireLe: Date;
}

export function creer(donnees: DonneesCreationSession) {
  return prisma.sessionRefresh.create({ data: donnees });
}

// Active = non révoquée ET non expirée.
export function trouverActive(jetonHash: string) {
  return prisma.sessionRefresh.findFirst({
    where: { jetonHash, revoqueLe: null, expireLe: { gt: new Date() } },
    include: { personne: true },
  });
}

export function revoquer(id: string) {
  return prisma.sessionRefresh.update({ where: { id }, data: { revoqueLe: new Date() } });
}

// Déconnexion globale : changement de mot de passe, bannissement...
export function revoquerToutesPourPersonne(personneId: string) {
  return prisma.sessionRefresh.updateMany({
    where: { personneId, revoqueLe: null },
    data: { revoqueLe: new Date() },
  });
}
