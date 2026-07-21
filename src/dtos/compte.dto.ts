// Les formes des données qui ENTRENT et SORTENT de l'API des comptes financiers.
// Le solde n'est jamais stocké : il est toujours recalculé (voir solde.service.ts).

export type TypeCompteDto =
  "COURANT" | "EPARGNE" | "CARTE_CREDIT" | "ESPECES" | "INVESTISSEMENT" | "AUTRE";

export interface CreerCompteDto {
  nom: string;
  type?: TypeCompteDto;
  soldeInitial?: number;
  devise?: string;
  institution?: string;
  couleur?: string;
}

export interface CompteAvecSoldeDto {
  id: string;
  nom: string;
  type: TypeCompteDto;
  soldeInitial: number;
  solde: number;
  devise: string;
  institution: string | null;
  couleur: string | null;
}
