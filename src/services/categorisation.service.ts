import { REGLES_CATEGORISATION } from "../constants/regles-categorisation.js";
import { NonTrouveException } from "../exceptions/http.exception.js";
import * as categorieRepository from "../repositories/categorie.repository.js";

type TypeTransactionCategorisable = "DEPENSE" | "REVENU";

const CATEGORIE_PAR_DEFAUT: Record<TypeTransactionCategorisable, string> = {
  DEPENSE: "Divers",
  REVENU: "Autres revenus",
};

// Cherche le premier mot-clé contenu dans le libellé (insensible à la casse),
// résout vers la catégorie système du même nom ET du bon type ; si le mot-clé
// ne correspond à aucune catégorie de ce type (ou si aucun mot-clé ne
// correspond), retombe sur "Divers" / "Autres revenus".
export async function deviner(
  libelle: string,
  type: TypeTransactionCategorisable,
): Promise<string> {
  const libelleNormalise = libelle.toLowerCase();
  const regleTrouvee = REGLES_CATEGORISATION.find((regle) =>
    libelleNormalise.includes(regle.motCle.toLowerCase()),
  );

  if (regleTrouvee) {
    const categorie = await categorieRepository.trouverSystemeParNomEtType(
      regleTrouvee.nomCategorie,
      type,
    );
    if (categorie) {
      return categorie.id;
    }
  }

  const nomParDefaut = CATEGORIE_PAR_DEFAUT[type];
  const categorieParDefaut = await categorieRepository.trouverSystemeParNomEtType(
    nomParDefaut,
    type,
  );
  if (!categorieParDefaut) {
    throw new NonTrouveException(
      `Catégorie système "${nomParDefaut}" introuvable — vérifier le seed.`,
    );
  }
  return categorieParDefaut.id;
}
