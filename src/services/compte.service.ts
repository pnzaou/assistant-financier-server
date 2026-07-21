import type { CompteFinancier } from "../../generated/prisma/client.js";
import type { CompteAvecSoldeDto, CreerCompteDto } from "../dtos/compte.dto.js";
import { NonTrouveException } from "../exceptions/http.exception.js";
import * as compteRepository from "../repositories/compte.repository.js";
import { calculerSolde } from "./solde.service.js";

function versDto(compte: CompteFinancier, solde: number): CompteAvecSoldeDto {
  return {
    id: compte.id,
    nom: compte.nom,
    type: compte.type,
    soldeInitial: compte.soldeInitial.toNumber(),
    solde,
    devise: compte.devise,
    institution: compte.institution,
    couleur: compte.couleur,
  };
}

export async function creerCompte(
  personneId: string,
  dto: CreerCompteDto,
): Promise<CompteAvecSoldeDto> {
  const compte = await compteRepository.creer(personneId, dto);
  return versDto(compte, await calculerSolde(compte));
}

export async function listerComptes(personneId: string): Promise<CompteAvecSoldeDto[]> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  return Promise.all(comptes.map(async (compte) => versDto(compte, await calculerSolde(compte))));
}

// Utilisé par les modules Transactions et Dashboard pour vérifier qu'un
// compte appartient bien à l'utilisateur connecté avant d'agir dessus.
export async function trouverCompteDeLaPersonne(
  compteId: string,
  personneId: string,
): Promise<CompteFinancier> {
  const compte = await compteRepository.trouverParId(compteId);
  if (!compte || compte.personneId !== personneId) {
    throw new NonTrouveException("Compte introuvable.");
  }
  return compte;
}
