import type { Categorie } from "../../generated/prisma/client.js";
import type { CategorieDto, TypeCategorieDto } from "../dtos/categorie.dto.js";
import * as categorieRepository from "../repositories/categorie.repository.js";

function versDto(categorie: Categorie): CategorieDto {
  return {
    id: categorie.id,
    nom: categorie.nom,
    type: categorie.type,
    icone: categorie.icone,
    couleur: categorie.couleur,
    parentId: categorie.parentId,
  };
}

export async function listerCategoriesSysteme(type?: TypeCategorieDto): Promise<CategorieDto[]> {
  const categories = await categorieRepository.listerSysteme(type);
  return categories.map(versDto);
}
