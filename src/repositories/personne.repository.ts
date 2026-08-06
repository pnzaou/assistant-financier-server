import { prisma } from "../config/prisma.js";

interface DonneesCreationPersonne {
  email: string;
  passwordHash: string;
  nom: string;
  prenom: string;
}

export function trouverParEmail(email: string) {
  return prisma.personne.findUnique({ where: { email } });
}

export function trouverParId(id: string) {
  return prisma.personne.findUnique({ where: { id } });
}

export function creer(donnees: DonneesCreationPersonne) {
  return prisma.personne.create({ data: donnees });
}

export function marquerEmailVerifie(id: string) {
  return prisma.personne.update({ where: { id }, data: { emailVerifieLe: new Date() } });
}

export function mettreAJourMotDePasse(id: string, passwordHash: string) {
  return prisma.personne.update({ where: { id }, data: { passwordHash } });
}

export function mettreAJourPushToken(id: string, expoPushToken: string | null) {
  return prisma.personne.update({
    where: { id },
    data: { expoPushToken, expoPushTokenMisAJourLe: new Date() },
  });
}
