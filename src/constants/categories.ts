// Catégories SYSTÈME proposées par défaut à tous les utilisateurs
// (personneId = null en base). Chacun peut ensuite créer les siennes.
// Le seed (prisma/seed.ts) les insère de façon idempotente.

export type TypeCategorie = "DEPENSE" | "REVENU";

export interface CategorieParDefaut {
  nom: string;
  type: TypeCategorie;
  icone: string;
}

export const CATEGORIES_PAR_DEFAUT: CategorieParDefaut[] = [
  // Dépenses
  { nom: "Alimentation", type: "DEPENSE", icone: "🛒" },
  { nom: "Restaurants", type: "DEPENSE", icone: "🍽️" },
  { nom: "Transport", type: "DEPENSE", icone: "🚗" },
  { nom: "Logement", type: "DEPENSE", icone: "🏠" },
  { nom: "Factures & abonnements", type: "DEPENSE", icone: "🧾" },
  { nom: "Santé", type: "DEPENSE", icone: "⚕️" },
  { nom: "Loisirs", type: "DEPENSE", icone: "🎮" },
  { nom: "Shopping", type: "DEPENSE", icone: "🛍️" },
  { nom: "Voyages", type: "DEPENSE", icone: "✈️" },
  { nom: "Éducation", type: "DEPENSE", icone: "📚" },
  { nom: "Divers", type: "DEPENSE", icone: "📦" },
  // Revenus
  { nom: "Salaire", type: "REVENU", icone: "💼" },
  { nom: "Freelance", type: "REVENU", icone: "💻" },
  { nom: "Remboursements", type: "REVENU", icone: "↩️" },
  { nom: "Investissements", type: "REVENU", icone: "📈" },
  { nom: "Cadeaux", type: "REVENU", icone: "🎁" },
  { nom: "Autres revenus", type: "REVENU", icone: "➕" },
];
