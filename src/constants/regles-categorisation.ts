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
  { motCle: "carrefour", nomCategorie: "Alimentation" },
  { motCle: "monoprix", nomCategorie: "Alimentation" },
  { motCle: "leclerc", nomCategorie: "Alimentation" },
  { motCle: "supermarché", nomCategorie: "Alimentation" },
  // Restaurants
  { motCle: "restaurant", nomCategorie: "Restaurants" },
  { motCle: "mcdonald", nomCategorie: "Restaurants" },
  { motCle: "deliveroo", nomCategorie: "Restaurants" },
  { motCle: "uber eats", nomCategorie: "Restaurants" },
  // Transport
  { motCle: "uber", nomCategorie: "Transport" },
  { motCle: "sncf", nomCategorie: "Transport" },
  { motCle: "essence", nomCategorie: "Transport" },
  { motCle: "station-service", nomCategorie: "Transport" },
  // Logement
  { motCle: "loyer", nomCategorie: "Logement" },
  { motCle: "edf", nomCategorie: "Logement" },
  { motCle: "électricité", nomCategorie: "Logement" },
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
