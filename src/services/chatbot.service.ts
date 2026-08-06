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
  return process.env.GROK_MODEL?.trim() || "llama-3.1-8b-instant";
}

function lireUrlApiGrok(): string {
  const url = process.env.GROK_BASE_URL?.trim();
  if (url && url.length > 0) return url;

  return "https://api.groq.com/openai/v1/chat/completions";
}

function construirePayloadGrok(
  messages: Array<{ role: string; content: string }>,
): Record<string, unknown> {
  const modele = lireModeleGrok();
  const url = lireUrlApiGrok();
  const estGroq = /groq/i.test(url) || /api\.groq\.com/i.test(url);

  if (estGroq) {
    return {
      model: modele,
      messages,
      temperature: 0.2,
    };
  }

  return {
    model: modele,
    messages,
    temperature: 0.2,
  };
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

  const deviseParCompte = new Map(comptes.map((compte) => [compte.id, compte.devise]));

  const lignesTransactions = transactions.items
    .map((transaction) => {
      const devise = deviseParCompte.get(transaction.compteId) ?? "XOF";
      return `- ${formaterDate(transaction.dateOperation)} | ${transaction.type} | ${transaction.libelle} | ${formaterMontant(Number(transaction.montant), devise)}`;
    })
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
        "Utilise strictement le solde actuel fourni dans le contexte financier de l'utilisateur : ne recalcule pas un nouveau solde à partir d'une seule transaction si le contexte donne déjà un solde actuel.",
        "Quand on te demande le solde actuel, réponds à partir du solde fourni dans les comptes et non à partir d'une déduction arbitraire de la dernière transaction.",
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

  const url = lireUrlApiGrok();
  const modele = lireModeleGrok();

  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cleApi}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(construirePayloadGrok(messages)),
    });

    const details = await reponse.text();
    if (!reponse.ok) {
      console.error("Erreur Grok chatbot", { status: reponse.status, url, modele, details });
      throw new Error(`Grok a répondu avec un statut ${reponse.status}: ${details}`);
    }

    const payload = JSON.parse(details) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return (
      payload.choices?.[0]?.message?.content?.trim() ||
      "Je n'ai pas pu produire une réponse exploitable."
    );
  } catch (erreur) {
    console.error("Erreur Grok chatbot", {
      erreur,
      url: lireUrlApiGrok(),
      modele: lireModeleGrok(),
    });

    const resume = messages
      .filter((m) => m.role !== "system")
      .slice(-3)
      .map((m) => `${m.role}: ${m.content}`)
      .join(" | ");

    return [
      "Je n'ai pas pu contacter le service d'IA pour le moment.",
      "Voici une réponse de secours basée sur la conversation :",
      `- ${resume || "Aucun contexte disponible."}`,
      "Vous pouvez aussi reformuler votre question ou réessayer plus tard.",
    ].join("\n");
  }
}

// Contrairement à `repondreAuMessage`, ne renvoie JAMAIS de texte de secours
// façon chat ("Je n'ai pas pu contacter le service...") — un `null` laisse
// l'appelant (détection proactive) retomber sur son propre message-modèle
// court, adapté à une notification push plutôt qu'à une réponse de chat.
export async function genererConseilProactif(
  personneId: string,
  descriptionEvenement: string,
): Promise<string | null> {
  const cleApi = lireCleApiGrok();
  if (!cleApi) {
    return null;
  }

  const contexte = await construireContexteFinancier(personneId);
  const messages = [
    {
      role: "system",
      content: [
        "Tu es un assistant financier proactif qui rédige de courtes notifications push personnalisées.",
        "Réponds en UNE seule phrase courte (120 caractères maximum), ton chaleureux et direct, sans emoji ni markdown.",
        "Donne un conseil concret et actionnable lié à l'événement décrit, en t'appuyant sur le contexte financier fourni.",
        "Ne mentionne jamais un autre utilisateur ni des données d'un autre compte.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Contexte financier :\n${contexte}`,
        `Événement à commenter : ${descriptionEvenement}`,
      ].join("\n"),
    },
  ];

  const url = lireUrlApiGrok();
  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cleApi}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(construirePayloadGrok(messages)),
    });
    if (!reponse.ok) {
      console.log("[chatbot] genererConseilProactif : réponse non ok", reponse.status);
      return null;
    }
    const payload = (await reponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() || null;
  } catch (erreur) {
    console.log("[chatbot] genererConseilProactif a échoué", erreur);
    return null;
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
