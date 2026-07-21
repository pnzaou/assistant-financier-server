// Règles de catégorisation automatique (US3) : mots-clés cherchés dans le
// libellé d'une transaction (insensible à la casse), mappés vers le NOM
// d'une catégorie SYSTÈME (voir constants/categories.ts). Le premier match
// gagne : ordonner du plus spécifique au plus générique.
export interface RegleCategorisation {
  motCle: string;
  nomCategorie: string;
}

export const REGLES_CATEGORISATION: RegleCategorisation[] = [
  // Alimentation
  { motCle: "auchan", nomCategorie: "Alimentation" },
  { motCle: "hypermaché", nomCategorie: "Alimentation" },
  { motCle: "marche castor", nomCategorie: "Alimentation" },
  { motCle: "supermarché", nomCategorie: "Alimentation" },
  // Restaurants
  { motCle: "restaurant", nomCategorie: "Restaurants" },
  { motCle: "kfc", nomCategorie: "Restaurants" },
  { motCle: "pizza", nomCategorie: "Restaurants" },
  { motCle: "grill time", nomCategorie: "Restaurants" },
  // Transport
  { motCle: "yango", nomCategorie: "Transport" },
  { motCle: "yassir", nomCategorie: "Transport" },
  { motCle: "essence", nomCategorie: "Transport" },
  { motCle: "dem dikk", nomCategorie: "Transport" },
  // Logement
  { motCle: "loyer", nomCategorie: "Logement" },
  { motCle: "woyofal", nomCategorie: "Logement" },
  { motCle: "sonatel", nomCategorie: "Logement" },
  // Factures & abonnements
  { motCle: "netflix", nomCategorie: "Factures & abonnements" },
  { motCle: "spotify", nomCategorie: "Factures & abonnements" },
  { motCle: "abonnement", nomCategorie: "Factures & abonnements" },
  // Santé
  { motCle: "pharmacie", nomCategorie: "Santé" },
  { motCle: "médecin", nomCategorie: "Santé" },
  // Revenus
  { motCle: "salaire", nomCategorie: "Salaire" },
  { motCle: "freelance", nomCategorie: "Freelance" },
  { motCle: "remboursement", nomCategorie: "Remboursements" },
];
