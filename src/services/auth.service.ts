import type {
  AuthResultatDto,
  LoginDto,
  PersonnePublique,
  RegisterDto,
  UtilisateurPublicDto,
} from "../dtos/auth.dto.js";
import { versUtilisateurPublic } from "../dtos/auth.dto.js";
import {
  AccesRefuseException,
  ConflitException,
  NonAutoriseException,
  NonTrouveException,
  RequeteInvalideException,
} from "../exceptions/http.exception.js";
import * as jetonRepository from "../repositories/jeton.repository.js";
import * as personneRepository from "../repositories/personne.repository.js";
import * as sessionRepository from "../repositories/session.repository.js";
import {
  DUREE_JETON_REINITIALISATION_MINUTES,
  DUREE_JETON_VERIFICATION_EMAIL_HEURES,
  DUREE_SESSION_REFRESH_JOURS,
} from "../constants/auth.js";
import { envoyerEmail, urlFront } from "../utils/email.util.js";
import {
  dateDansHeures,
  dateDansJours,
  dateDansMinutes,
  genererJetonOpaque,
  hasherJeton,
} from "../utils/jeton.util.js";
import { signerAccessToken } from "../utils/jwt.util.js";
import { hasherMotDePasse, verifierMotDePasse } from "../utils/motdepasse.util.js";

// Émet la paire de tokens : access (JWT 15 min) + refresh (opaque, stocké
// hashé en base, révocable). Utilisé par register, login et refresh.
async function creerResultatAuth(personne: PersonnePublique): Promise<AuthResultatDto> {
  const refreshToken = genererJetonOpaque();
  await sessionRepository.creer({
    personneId: personne.id,
    jetonHash: hasherJeton(refreshToken),
    expireLe: dateDansJours(DUREE_SESSION_REFRESH_JOURS),
  });
  return {
    utilisateur: versUtilisateurPublic(personne),
    accessToken: signerAccessToken(personne.id),
    refreshToken,
  };
}

async function envoyerEmailVerification(personneId: string, email: string): Promise<void> {
  await jetonRepository.supprimerPourPersonne(personneId, "VERIFICATION_EMAIL");
  const jeton = genererJetonOpaque();
  await jetonRepository.creer({
    personneId,
    type: "VERIFICATION_EMAIL",
    jetonHash: hasherJeton(jeton),
    expireLe: dateDansHeures(DUREE_JETON_VERIFICATION_EMAIL_HEURES),
  });
  const lien = `${urlFront()}/verifier-email?jeton=${jeton}`;
  await envoyerEmail({
    destinataire: email,
    sujet: "Vérifie ton adresse email — Assistant Financier",
    html:
      `<p>Bienvenue sur Assistant Financier !</p>` +
      `<p>Confirme ton adresse en cliquant sur ce lien : <a href="${lien}">${lien}</a></p>` +
      `<p>Ce lien expire dans ${DUREE_JETON_VERIFICATION_EMAIL_HEURES} heures.</p>`,
  });
}

// Register = créer le COMPTE (Personne). L'app est mono-rôle : aucun rôle à
// attribuer, chacun gère simplement ses propres finances.
export async function inscrire(dto: RegisterDto): Promise<AuthResultatDto> {
  const existante = await personneRepository.trouverParEmail(dto.email);
  if (existante) {
    throw new ConflitException("Un compte existe déjà avec cette adresse email.");
  }
  const personne = await personneRepository.creer({
    email: dto.email,
    passwordHash: await hasherMotDePasse(dto.motDePasse),
    nom: dto.nom,
    prenom: dto.prenom,
  });
  await envoyerEmailVerification(personne.id, personne.email);
  return creerResultatAuth(personne);
}

export async function seConnecter(dto: LoginDto): Promise<AuthResultatDto> {
  const personne = await personneRepository.trouverParEmail(dto.email);
  // Même message que l'email soit inconnu ou le mot de passe faux :
  // ne jamais révéler lequel des deux (anti-énumération de comptes).
  if (!personne || !(await verifierMotDePasse(dto.motDePasse, personne.passwordHash))) {
    throw new NonAutoriseException("Email ou mot de passe incorrect.");
  }
  if (personne.statut !== "ACTIF") {
    throw new AccesRefuseException("Compte suspendu ou banni.");
  }
  return creerResultatAuth(personne);
}

export async function rafraichir(refreshToken: string): Promise<AuthResultatDto> {
  const session = await sessionRepository.trouverActive(hasherJeton(refreshToken));
  if (!session) {
    throw new NonAutoriseException("Session invalide ou expirée — reconnecte-toi.");
  }
  if (session.personne.statut !== "ACTIF") {
    throw new AccesRefuseException("Compte suspendu ou banni.");
  }
  // Rotation : l'ancien refresh token est révoqué, un nouveau est émis.
  // Un refresh token volé puis rejoué après usage devient donc inutilisable.
  await sessionRepository.revoquer(session.id);
  return creerResultatAuth(session.personne);
}

// Idempotent : déconnecter une session déjà close n'est pas une erreur.
export async function seDeconnecter(refreshToken: string): Promise<void> {
  const session = await sessionRepository.trouverActive(hasherJeton(refreshToken));
  if (session) {
    await sessionRepository.revoquer(session.id);
  }
}

export async function verifierEmail(jeton: string): Promise<void> {
  const enregistre = await jetonRepository.trouverValide(hasherJeton(jeton), "VERIFICATION_EMAIL");
  if (!enregistre) {
    throw new RequeteInvalideException("Jeton invalide ou expiré.");
  }
  await jetonRepository.marquerUtilise(enregistre.id);
  await personneRepository.marquerEmailVerifie(enregistre.personneId);
}

export async function renvoyerVerification(personneId: string): Promise<void> {
  const personne = await personneRepository.trouverParId(personneId);
  if (!personne) {
    throw new NonTrouveException("Compte introuvable.");
  }
  if (personne.emailVerifieLe) {
    throw new RequeteInvalideException("Cette adresse email est déjà vérifiée.");
  }
  await envoyerEmailVerification(personne.id, personne.email);
}

export async function demanderReinitialisation(email: string): Promise<void> {
  const personne = await personneRepository.trouverParEmail(email);
  // Aucun signal si l'email est inconnu : le controller répond toujours
  // pareil, et l'email ne part que si le compte existe (anti-énumération).
  if (!personne || personne.statut !== "ACTIF") {
    return;
  }
  await jetonRepository.supprimerPourPersonne(personne.id, "REINITIALISATION_MOT_DE_PASSE");
  const jeton = genererJetonOpaque();
  await jetonRepository.creer({
    personneId: personne.id,
    type: "REINITIALISATION_MOT_DE_PASSE",
    jetonHash: hasherJeton(jeton),
    expireLe: dateDansMinutes(DUREE_JETON_REINITIALISATION_MINUTES),
  });
  const lien = `${urlFront()}/reinitialiser-mot-de-passe?jeton=${jeton}`;
  await envoyerEmail({
    destinataire: personne.email,
    sujet: "Réinitialisation de ton mot de passe — Assistant Financier",
    html:
      `<p>Pour choisir un nouveau mot de passe, clique sur ce lien : <a href="${lien}">${lien}</a></p>` +
      `<p>Ce lien expire dans ${DUREE_JETON_REINITIALISATION_MINUTES} minutes. ` +
      `Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>`,
  });
}

export async function reinitialiserMotDePasse(
  jeton: string,
  nouveauMotDePasse: string,
): Promise<void> {
  const enregistre = await jetonRepository.trouverValide(
    hasherJeton(jeton),
    "REINITIALISATION_MOT_DE_PASSE",
  );
  if (!enregistre) {
    throw new RequeteInvalideException("Jeton invalide ou expiré.");
  }
  await jetonRepository.marquerUtilise(enregistre.id);
  await personneRepository.mettreAJourMotDePasse(
    enregistre.personneId,
    await hasherMotDePasse(nouveauMotDePasse),
  );
  // Sécurité : changer de mot de passe déconnecte toutes les sessions —
  // si quelqu'un avait volé un accès, il le perd ici.
  await sessionRepository.revoquerToutesPourPersonne(enregistre.personneId);
}

// `token` à `null` désinscrit l'appareil (envoyé à la déconnexion, pour
// qu'un appareil partagé ne reçoive plus de notifications après logout).
export async function mettreAJourPushToken(
  personneId: string,
  token: string | null,
): Promise<void> {
  await personneRepository.mettreAJourPushToken(personneId, token);
}

export async function profilConnecte(personneId: string): Promise<UtilisateurPublicDto> {
  const personne = await personneRepository.trouverParId(personneId);
  if (!personne) {
    throw new NonTrouveException("Compte introuvable.");
  }
  return versUtilisateurPublic(personne);
}
