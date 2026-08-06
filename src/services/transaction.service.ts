import type { Transaction } from "../../generated/prisma/client.js";
import type {
  CreerTransactionDto,
  ListerTransactionsFiltresDto,
  ModifierTransactionDto,
  PageDto,
  TransactionDto,
} from "../dtos/transaction.dto.js";
import { NonTrouveException, RequeteInvalideException } from "../exceptions/http.exception.js";
import * as categorieRepository from "../repositories/categorie.repository.js";
import * as compteRepository from "../repositories/compte.repository.js";
import * as transactionRepository from "../repositories/transaction.repository.js";
import { deviner } from "./categorisation.service.js";
import { trouverCompteDeLaPersonne } from "./compte.service.js";
import { verifierGrosseDepense } from "./detection-proactive.service.js";

function versDto(transaction: Transaction): TransactionDto {
  return {
    id: transaction.id,
    compteId: transaction.compteId,
    categorieId: transaction.categorieId,
    montant: transaction.montant.toNumber(),
    type: transaction.type as "DEPENSE" | "REVENU",
    libelle: transaction.libelle,
    note: transaction.note,
    dateOperation: transaction.dateOperation.toISOString().slice(0, 10),
    pointee: transaction.pointee,
  };
}

// Un categorieId fourni par l'utilisateur doit être une catégorie SYSTÈME
// existante, du même type que la transaction — sinon RequeteInvalideException.
async function validerCategorie(categorieId: string, type: "DEPENSE" | "REVENU"): Promise<void> {
  const categorie = await categorieRepository.trouverSystemeParId(categorieId);
  if (!categorie || categorie.type !== type) {
    throw new RequeteInvalideException("Catégorie invalide pour ce type de transaction.");
  }
}

// Vérifie que la transaction existe ET que son compte appartient bien à
// l'utilisateur connecté — même exception (404) dans les deux cas.
async function trouverTransactionDeLaPersonne(
  id: string,
  personneId: string,
): Promise<Transaction> {
  const transaction = await transactionRepository.trouverParId(id);
  if (!transaction) {
    throw new NonTrouveException("Transaction introuvable.");
  }
  const compte = await compteRepository.trouverParId(transaction.compteId);
  if (!compte || compte.personneId !== personneId) {
    throw new NonTrouveException("Transaction introuvable.");
  }
  return transaction;
}

export async function creerTransaction(
  personneId: string,
  dto: CreerTransactionDto,
): Promise<TransactionDto> {
  await trouverCompteDeLaPersonne(dto.compteId, personneId);

  let categorieId: string;
  if (dto.categorieId) {
    await validerCategorie(dto.categorieId, dto.type);
    categorieId = dto.categorieId;
  } else {
    categorieId = await deviner(dto.libelle, dto.type);
  }

  const transaction = await transactionRepository.creer({
    compteId: dto.compteId,
    categorieId,
    montant: dto.montant,
    type: dto.type,
    libelle: dto.libelle,
    ...(dto.note !== undefined ? { note: dto.note } : {}),
    dateOperation: new Date(dto.dateOperation),
  });

  // Ne bloque jamais la réponse de création : le conseil proactif appelle
  // maintenant le chatbot (LLM), une latence qui n'a rien à faire dans le
  // chemin critique d'un simple enregistrement de transaction.
  if (dto.type === "DEPENSE") {
    void verifierGrosseDepense(personneId, {
      id: transaction.id,
      montant: dto.montant,
      libelle: dto.libelle,
    }).catch((error) => {
      console.log("[transaction] verifierGrosseDepense a échoué", error);
    });
  }

  return versDto(transaction);
}

export async function listerTransactions(
  personneId: string,
  filtres: ListerTransactionsFiltresDto,
): Promise<PageDto<TransactionDto>> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  const compteIds = comptes.map((compte) => compte.id);

  if (filtres.compteId && !compteIds.includes(filtres.compteId)) {
    throw new NonTrouveException("Compte introuvable.");
  }

  const { items, total } = await transactionRepository.lister({
    compteIds: filtres.compteId ? [filtres.compteId] : compteIds,
    ...(filtres.categorieId !== undefined ? { categorieId: filtres.categorieId } : {}),
    ...(filtres.du !== undefined ? { du: new Date(filtres.du) } : {}),
    ...(filtres.au !== undefined ? { au: new Date(filtres.au) } : {}),
    page: filtres.page,
    limite: filtres.limite,
  });

  return { items: items.map(versDto), page: filtres.page, limite: filtres.limite, total };
}

export async function obtenirTransaction(id: string, personneId: string): Promise<TransactionDto> {
  const transaction = await trouverTransactionDeLaPersonne(id, personneId);
  return versDto(transaction);
}

export async function modifierTransaction(
  id: string,
  personneId: string,
  dto: ModifierTransactionDto,
): Promise<TransactionDto> {
  const transaction = await trouverTransactionDeLaPersonne(id, personneId);

  if (dto.categorieId) {
    await validerCategorie(dto.categorieId, transaction.type as "DEPENSE" | "REVENU");
  }

  const misAJour = await transactionRepository.modifier(id, {
    ...(dto.montant !== undefined ? { montant: dto.montant } : {}),
    ...(dto.libelle !== undefined ? { libelle: dto.libelle } : {}),
    ...(dto.note !== undefined ? { note: dto.note } : {}),
    ...(dto.dateOperation !== undefined ? { dateOperation: new Date(dto.dateOperation) } : {}),
    ...(dto.categorieId !== undefined ? { categorieId: dto.categorieId } : {}),
    ...(dto.pointee !== undefined ? { pointee: dto.pointee } : {}),
  });
  return versDto(misAJour);
}

export async function supprimerTransaction(id: string, personneId: string): Promise<void> {
  await trouverTransactionDeLaPersonne(id, personneId);
  await transactionRepository.supprimer(id);
}
