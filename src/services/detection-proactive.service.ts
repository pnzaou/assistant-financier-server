import { prisma } from "../config/prisma.js";
import * as compteRepository from "../repositories/compte.repository.js";
import { genererConseilProactif } from "./chatbot.service.js";
import { envoyerNotificationPush } from "./notification.service.js";

// Garde-fou : un LLM ne respecte pas toujours à la lettre une consigne de
// longueur — une notification push doit rester courte quoi qu'il arrive.
const LONGUEUR_MAX_CONSEIL = 180;

// Tente de générer un conseil personnalisé via le chatbot ; retombe sur le
// message-modèle fourni par l'appelant si l'IA n'est pas configurée, échoue,
// ou renvoie un texte vide.
async function corpsNotification(
  personneId: string,
  descriptionEvenement: string,
  repli: string,
): Promise<string> {
  const conseil = await genererConseilProactif(personneId, descriptionEvenement);
  if (!conseil) {
    return repli;
  }
  return conseil.length > LONGUEUR_MAX_CONSEIL
    ? `${conseil.slice(0, LONGUEUR_MAX_CONSEIL - 1)}…`
    : conseil;
}

// ── Grosse dépense (déclenché à la création d'une transaction) ──────────

// Une dépense doit dépasser 2,5x la moyenne habituelle de l'utilisateur pour
// être signalée — relatif à chacun, pas de montant fixe qui n'aurait aucun
// sens selon les revenus de la personne.
const MULTIPLICATEUR_GROSSE_DEPENSE = 2.5;
// En dessous de ce nombre de dépenses récentes, la "moyenne" n'est pas
// fiable (ex. tout premier achat d'un nouveau compte) — on ne signale rien.
const NB_DEPENSES_MIN_BASELINE = 5;
// Fenêtre glissante utilisée pour calculer la dépense "habituelle" :
// assez large pour lisser le bruit, assez récente pour rester pertinente.
const NB_MOIS_BASELINE_GROSSE_DEPENSE = 3;

function formaterMontant(montant: number): string {
  return Math.round(montant).toLocaleString("fr-FR");
}

export async function verifierGrosseDepense(
  personneId: string,
  transaction: { id: string; montant: number; libelle: string },
): Promise<void> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  const compteIds = comptes.map((compte) => compte.id);
  if (compteIds.length === 0) {
    return;
  }

  const depuis = new Date();
  depuis.setUTCMonth(depuis.getUTCMonth() - NB_MOIS_BASELINE_GROSSE_DEPENSE);

  const agregat = await prisma.transaction.aggregate({
    where: {
      compteId: { in: compteIds },
      type: "DEPENSE",
      dateOperation: { gte: depuis },
      id: { not: transaction.id },
    },
    _avg: { montant: true },
    _count: true,
  });

  if (agregat._count < NB_DEPENSES_MIN_BASELINE) {
    return;
  }
  const moyenne = agregat._avg.montant?.toNumber() ?? 0;
  if (moyenne <= 0 || transaction.montant <= moyenne * MULTIPLICATEUR_GROSSE_DEPENSE) {
    return;
  }

  const repli = `Vous avez dépensé ${formaterMontant(transaction.montant)} XOF pour ${transaction.libelle}, bien au-dessus de vos dépenses habituelles.`;
  const corps = await corpsNotification(
    personneId,
    `Une dépense de ${formaterMontant(transaction.montant)} XOF vient d'être enregistrée pour "${transaction.libelle}", ` +
      `soit plus de ${MULTIPLICATEUR_GROSSE_DEPENSE}x la dépense moyenne habituelle de cet utilisateur (${formaterMontant(moyenne)} XOF).`,
    repli,
  );

  await envoyerNotificationPush(personneId, "Grosse dépense détectée", corps, {
    type: "grosse_depense",
    transactionId: transaction.id,
  });
}

// ── Anomalie de dépense par catégorie (job planifié quotidien) ──────────

// Le mois en cours doit dépasser 1,75x la moyenne historique (proratisée à
// la date du jour) pour être signalé.
const MULTIPLICATEUR_ANOMALIE_CATEGORIE = 1.75;
// Nombre de mois passés utilisés comme référence historique par catégorie.
const NB_MOIS_HISTORIQUE_CATEGORIE = 3;
// En dessous de ce nombre de mois avec de la dépense dans cette catégorie,
// l'historique n'est pas assez fourni pour servir de référence.
const NB_MOIS_MIN_CATEGORIE = 2;

function bornesDuMois(reference: Date, decalageMois: number): { debut: Date; fin: Date } {
  const debut = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + decalageMois, 1),
  );
  const fin = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth() + decalageMois + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );
  return { debut, fin };
}

async function totalDepenseCategorie(
  compteIds: string[],
  categorieId: string,
  bornes: { debut: Date; fin: Date },
): Promise<number> {
  const agregat = await prisma.transaction.aggregate({
    where: {
      compteId: { in: compteIds },
      type: "DEPENSE",
      categorieId,
      dateOperation: { gte: bornes.debut, lte: bornes.fin },
    },
    _sum: { montant: true },
  });
  return agregat._sum.montant?.toNumber() ?? 0;
}

// Exportée séparément du batch pour pouvoir être appelée à la demande sur
// UN utilisateur (endpoint de test manuel), sans attendre le cron.
export async function detecterAnomaliesCategoriePourPersonne(personneId: string): Promise<void> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  const compteIds = comptes.map((compte) => compte.id);
  if (compteIds.length === 0) {
    return;
  }

  const maintenant = new Date();
  const moisCourant = bornesDuMois(maintenant, 0);
  const jourDuMois = maintenant.getUTCDate();
  const joursDansLeMois = new Date(
    Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const fractionEcoulee = jourDuMois / joursDansLeMois;

  const depensesParCategorie = await prisma.transaction.groupBy({
    by: ["categorieId"],
    where: {
      compteId: { in: compteIds },
      type: "DEPENSE",
      categorieId: { not: null },
      dateOperation: { gte: moisCourant.debut, lte: moisCourant.fin },
    },
    _sum: { montant: true },
  });

  for (const ligne of depensesParCategorie) {
    const categorieId = ligne.categorieId;
    if (!categorieId) continue;

    const totalMoisCourant = ligne._sum.montant?.toNumber() ?? 0;
    if (totalMoisCourant <= 0) continue;

    const totauxHistoriques: number[] = [];
    for (let decalage = 1; decalage <= NB_MOIS_HISTORIQUE_CATEGORIE; decalage += 1) {
      const total = await totalDepenseCategorie(
        compteIds,
        categorieId,
        bornesDuMois(maintenant, -decalage),
      );
      if (total > 0) {
        totauxHistoriques.push(total);
      }
    }
    if (totauxHistoriques.length < NB_MOIS_MIN_CATEGORIE) continue;

    const moyenneHistorique =
      totauxHistoriques.reduce((total, valeur) => total + valeur, 0) / totauxHistoriques.length;
    const moyenneProratisee = moyenneHistorique * fractionEcoulee;
    if (
      moyenneProratisee <= 0 ||
      totalMoisCourant <= moyenneProratisee * MULTIPLICATEUR_ANOMALIE_CATEGORIE
    ) {
      continue;
    }

    const categorie = await prisma.categorie.findUnique({ where: { id: categorieId } });
    const nomCategorie = categorie?.nom ?? "une catégorie";

    const repli = `Vous avez déjà dépensé ${formaterMontant(totalMoisCourant)} XOF en ${nomCategorie} ce mois-ci, plus que d'habitude à cette période du mois.`;
    const corps = await corpsNotification(
      personneId,
      `Ce mois-ci (jour ${jourDuMois}/${joursDansLeMois}), l'utilisateur a déjà dépensé ${formaterMontant(totalMoisCourant)} XOF ` +
        `dans la catégorie "${nomCategorie}", contre une moyenne habituelle attendue à ce stade du mois de ${formaterMontant(moyenneProratisee)} XOF.`,
      repli,
    );

    await envoyerNotificationPush(personneId, `Dépenses en hausse : ${nomCategorie}`, corps, {
      type: "anomalie_categorie",
      categorieId,
    });
  }
}

// Point d'entrée du job planifié : une personne en erreur ne doit jamais
// empêcher les suivantes d'être traitées.
export async function detecterAnomaliesCategoriesToutesPersonnes(): Promise<void> {
  const personnes = await prisma.personne.findMany({
    where: { expoPushToken: { not: null }, statut: "ACTIF" },
    select: { id: true },
  });

  for (const personne of personnes) {
    try {
      await detecterAnomaliesCategoriePourPersonne(personne.id);
    } catch (error) {
      console.log("[detection-proactive] échec pour la personne", personne.id, error);
    }
  }
}
