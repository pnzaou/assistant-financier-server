export type TypeTransactionDto = "DEPENSE" | "REVENU";

export interface CreerTransactionDto {
  compteId: string;
  montant: number;
  type: TypeTransactionDto;
  libelle: string;
  note?: string;
  dateOperation: string; // "AAAA-MM-JJ"
  categorieId?: string;
}

export interface ModifierTransactionDto {
  montant?: number;
  libelle?: string;
  note?: string;
  dateOperation?: string;
  categorieId?: string;
  pointee?: boolean;
}

export interface ListerTransactionsFiltresDto {
  compteId?: string;
  categorieId?: string;
  du?: string;
  au?: string;
  page: number;
  limite: number;
}

export interface TransactionDto {
  id: string;
  compteId: string;
  categorieId: string | null;
  montant: number;
  type: TypeTransactionDto;
  libelle: string;
  note: string | null;
  dateOperation: string;
  pointee: boolean;
}

export interface PageDto<T> {
  items: T[];
  page: number;
  limite: number;
  total: number;
}
