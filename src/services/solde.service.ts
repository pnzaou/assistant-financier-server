import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";

// Le solde n'est jamais stocké : soldeInitial + somme signée des transactions
// (DEPENSE compte négativement, REVENU positivement). TRANSFERT est hors
// scope ce sprint : aucune transaction de ce type ne peut exister via l'API.
//
// `avant`, si fourni, ne compte que les transactions strictement antérieures
// à cette date — utilisé pour reconstituer un solde à une date passée (ex.
// fin du mois précédent, pour la variation affichée sur l'accueil) sans
// stocker d'historique de soldes.
export async function calculerSolde(
  compte: { id: string; soldeInitial: Prisma.Decimal },
  avant?: Date,
): Promise<number> {
  const filtreDate = avant ? { dateOperation: { lt: avant } } : {};
  const [depenses, revenus] = await Promise.all([
    prisma.transaction.aggregate({
      where: { compteId: compte.id, type: "DEPENSE", ...filtreDate },
      _sum: { montant: true },
    }),
    prisma.transaction.aggregate({
      where: { compteId: compte.id, type: "REVENU", ...filtreDate },
      _sum: { montant: true },
    }),
  ]);
  const totalDepenses = depenses._sum.montant?.toNumber() ?? 0;
  const totalRevenus = revenus._sum.montant?.toNumber() ?? 0;
  return compte.soldeInitial.toNumber() + totalRevenus - totalDepenses;
}
