import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";

// Le solde n'est jamais stocké : soldeInitial + somme signée des transactions
// (DEPENSE compte négativement, REVENU positivement). TRANSFERT est hors
// scope ce sprint : aucune transaction de ce type ne peut exister via l'API.
export async function calculerSolde(compte: {
  id: string;
  soldeInitial: Prisma.Decimal;
}): Promise<number> {
  const [depenses, revenus] = await Promise.all([
    prisma.transaction.aggregate({
      where: { compteId: compte.id, type: "DEPENSE" },
      _sum: { montant: true },
    }),
    prisma.transaction.aggregate({
      where: { compteId: compte.id, type: "REVENU" },
      _sum: { montant: true },
    }),
  ]);
  const totalDepenses = depenses._sum.montant?.toNumber() ?? 0;
  const totalRevenus = revenus._sum.montant?.toNumber() ?? 0;
  return compte.soldeInitial.toNumber() + totalRevenus - totalDepenses;
}
