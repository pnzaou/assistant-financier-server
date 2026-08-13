// Les formes des données qui ENTRENT et SORTENT de l'API des objectifs d'épargne.

export type StatutObjectifDto = "EN_COURS" | "ATTEINT" | "ABANDONNE";

export interface CreerObjectifDto {
  nom: string;
  montantCible: number;
  montantActuel?: number;
  dateEcheance?: string; // format YYYY-MM-DD
  compteId?: string;
}

export interface ObjectifDto {
  id: string;
  nom: string;
  montantCible: number;
  montantActuel: number;
  dateEcheance: string | null;
  compteId: string | null;
  statut: StatutObjectifDto;
}
