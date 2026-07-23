import { prisma } from "../config/prisma.js";
import * as compteRepository from "../repositories/compte.repository.js";
import * as transactionRepository from "../repositories/transaction.repository.js";
import { calculerSolde } from "./solde.service.js";

interface MessageConversation {
  role: "user" | "assistant";
  content: string;
}

const conversationsParPersonne = new Map<string, MessageConversation[]>();

function lireCleApiGrok(): string | undefined {
  const cle = process.env.GROK_API_KEY?.trim();
  return cle && cle.length > 0 ? cle : undefined;
}

function lireModeleGrok(): string {
  return process.env.GROK_MODEL?.trim() || "grok-2-latest";
}

function lireUrlApiGrok(): string {
  return process.env.GROK_BASE_URL?.trim() || "https://api.x.ai/v1/chat/completions";
}

function formaterMontant(valeur: number, devise: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: devise || "EUR",
  }).format(valeur);
}

function formaterDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function construireContexteFinancier(personneId: string): Promise<string> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  if (comptes.length === 0) {
    return "L'utilisateur n'a encore aucun compte financier configuré.";
  }

  const soldes = await Promise.all(
    comptes.map(async (compte) => ({
      compte,
      solde: await calculerSolde(compte),
    })),
  );

  const compteIds = comptes.map((compte) => compte.id);
  const transactions = await transactionRepository.lister({
    compteIds,
    page: 1,
    limite: 8,
  });

  const categories = await prisma.categorie.findMany({
    where: { personneId: personneId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const lignesSoldes = soldes
    .map((ligne) => `- ${ligne.compte.nom}: ${formaterMontant(ligne.solde, ligne.compte.devise)}`)
    .join("\n");

  const lignesTransactions = transactions.items
    .map(
      (transaction) =>
        `- ${formaterDate(transaction.dateOperation)} | ${transaction.type} | ${transaction.libelle} | ${formaterMontant(Number(transaction.montant), "EUR")}`,
    )
    .join("\n");

  const lignesCategories = categories.length
    ? categories.map((categorie) => `- ${categorie.nom} (${categorie.type})`).join("\n")
    : "- Aucune catégorie personnelle enregistrée.";

  return [
    "Contexte financier de l'utilisateur connecté :",
    `- Comptes :\n${lignesSoldes}`,
    `- Transactions récentes :\n${lignesTransactions || "- Aucune transaction récente."}`,
    `- Catégories personnelles :\n${lignesCategories}`,
  ].join("\n");
}

function construireMessages(
  personneId: string,
  messageUtilisateur: string,
  contexte: string,
): Array<{ role: string; content: string }> {
  const historique = conversationsParPersonne.get(personneId) ?? [];
  const messagesRecents = historique.slice(-6);

  const historiqueTexte = messagesRecents.length
    ? messagesRecents
        .map(
          (message) =>
            `${message.role === "user" ? "Utilisateur" : "Assistant"}: ${message.content}`,
        )
        .join("\n")
    : "Aucun historique récent.";

  return [
    {
      role: "system",
      content: [
        "Tu es un assistant financier spécialisé dans cette application.",
        "Tu ne dois répondre qu'aux questions liées aux transactions, comptes, soldes, habitudes de dépenses, budgets, objectifs ou catégories de cet utilisateur.",
        "Si l'utilisateur pose une question hors sujet, indique poliment que tu peux aider uniquement sur les données financières de cette application.",
        "Ne mentionne jamais un autre utilisateur ni des données d'un autre compte.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Identifiant utilisateur : ${personneId}`,
        `Contexte financier :\n${contexte}`,
        `Historique récent :\n${historiqueTexte}`,
        `Dernier message utilisateur : ${messageUtilisateur}`,
      ].join("\n"),
    },
  ];
}

async function appelerGrok(messages: Array<{ role: string; content: string }>): Promise<string> {
  const cleApi = lireCleApiGrok();
  if (!cleApi) {
    return "Le service Grok n'est pas encore configuré. Ajoutez GROK_API_KEY dans votre fichier .env pour activer le chatbot.";
  }

  try {
    const reponse = await fetch(lireUrlApiGrok(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cleApi}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: lireModeleGrok(),
        messages,
        temperature: 0.2,
      }),
    });

    if (!reponse.ok) {
      const details = await reponse.text();
      throw new Error(`Grok a répondu avec un statut ${reponse.status}: ${details}`);
    }

    const payload = (await reponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return (
      payload.choices?.[0]?.message?.content?.trim() ||
      "Je n'ai pas pu produire une réponse exploitable."
    );
  } catch (erreur) {
    console.error("Erreur Grok chatbot", erreur);
    return "Le service Grok n'a pas pu répondre. Vérifiez la configuration de GROK_API_KEY et l'accès réseau.";
  }
}

export async function repondreAuMessage(personneId: string, message: string): Promise<string> {
  const contexte = await construireContexteFinancier(personneId);
  const messages = construireMessages(personneId, message, contexte);
  const reponse = await appelerGrok(messages);

  const historique = conversationsParPersonne.get(personneId) ?? [];
  const prochainHistorique: MessageConversation[] = [
    ...historique,
    { role: "user", content: message },
    { role: "assistant", content: reponse },
  ].slice(-12) as MessageConversation[];
  conversationsParPersonne.set(personneId, prochainHistorique);

  return reponse;
}

export function resetConversations(): void {
  conversationsParPersonne.clear();
}
