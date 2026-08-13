import type { ObjectifEpargne } from "../../generated/prisma/client.js";
import type { CreerObjectifDto, ObjectifDto } from "../dtos/objectif.dto.js";
import * as objectifRepository from "../repositories/objectif.repository.js";
import { trouverCompteDeLaPersonne } from "./compte.service.js";

function versDto(objectif: ObjectifEpargne): ObjectifDto {
  return {
    id: objectif.id,
    nom: objectif.nom,
    montantCible: objectif.montantCible.toNumber(),
    montantActuel: objectif.montantActuel.toNumber(),
    dateEcheance: objectif.dateEcheance ? objectif.dateEcheance.toISOString().slice(0, 10) : null,
    compteId: objectif.compteId,
    statut: objectif.statut,
  };
}

export async function creerObjectif(
  personneId: string,
  dto: CreerObjectifDto,
): Promise<ObjectifDto> {
  if (dto.compteId) {
    await trouverCompteDeLaPersonne(dto.compteId, personneId);
  }
  const objectif = await objectifRepository.creer(personneId, dto);
  return versDto(objectif);
}

export async function listerObjectifs(personneId: string): Promise<ObjectifDto[]> {
  const objectifs = await objectifRepository.listerParPersonne(personneId);
  return objectifs.map(versDto);
}

export async function mettreAJourObjectif(
  personneId: string,
  objectifId: string,
  donnees: { montantActuel?: number },
): Promise<ObjectifDto> {
  const existing = await objectifRepository.trouverParId(objectifId);
  if (!existing || existing.personneId !== personneId) {
    throw new Error("Objectif non trouvé");
  }

  const updated = await objectifRepository.mettreAJour(objectifId, donnees);

  const montantActuel =
    donnees.montantActuel !== undefined ? donnees.montantActuel : updated.montantActuel.toNumber();
  const statut = montantActuel >= updated.montantCible.toNumber() ? "ATTEINT" : "EN_COURS";
  if (statut !== updated.statut) {
    await objectifRepository.mettreAJourStatut(objectifId, statut);
    const refreshed = await objectifRepository.trouverParId(objectifId);
    return versDto(refreshed!);
  }

  return versDto(updated);
}
