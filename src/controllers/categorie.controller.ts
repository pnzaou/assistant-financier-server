import type { Request, Response } from "express";
import type { TypeCategorieDto } from "../dtos/categorie.dto.js";
import * as categorieService from "../services/categorie.service.js";

const TYPES_VALIDES: TypeCategorieDto[] = ["DEPENSE", "REVENU"];

function typeDepuisQuery(valeur: unknown): TypeCategorieDto | undefined {
  return typeof valeur === "string" && (TYPES_VALIDES as string[]).includes(valeur)
    ? (valeur as TypeCategorieDto)
    : undefined;
}

export async function lister(req: Request, res: Response): Promise<void> {
  const categories = await categorieService.listerCategoriesSysteme(
    typeDepuisQuery(req.query.type),
  );
  res.json({ categories });
}
