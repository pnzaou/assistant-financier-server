export type TypeCategorieDto = "DEPENSE" | "REVENU";

export interface CategorieDto {
  id: string;
  nom: string;
  type: TypeCategorieDto;
  icone: string | null;
  couleur: string | null;
  parentId: string | null;
}
