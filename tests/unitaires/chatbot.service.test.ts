import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` est indispensable ici, et pas seulement stylistique.
//
// Vitest remonte les appels à `vi.mock` tout en haut du fichier, et les
// déclarations `import` d'ESM le sont aussi. Le module testé était donc chargé
// — donc les factories de mock exécutées — AVANT que de simples `const` en
// haut de fichier ne soient initialisées : les mocks se trouvaient encore dans
// leur zone morte temporelle, et la suite échouait au chargement sur
// « Cannot access 'categorieFindManyMock' before initialization ».
//
// `vi.hoisted` fait évaluer ce bloc avant tout le reste, mocks compris.
const {
  listerParPersonneMock,
  listerTransactionsMock,
  categorieFindManyMock,
  transactionAggregateMock,
} = vi.hoisted(() => ({
  listerParPersonneMock: vi.fn(),
  listerTransactionsMock: vi.fn(),
  categorieFindManyMock: vi.fn(),
  transactionAggregateMock: vi.fn(),
}));

/**
 * Prisma renvoie des `Decimal`, pas des nombres : `calculerSolde` appelle
 * `.toNumber()` sur `soldeInitial`. Un simple littéral numérique dans une
 * fixture ferait échouer le service sur « toNumber is not a function ».
 */
const decimal = (valeur: number) => ({ toNumber: () => valeur });

vi.mock("../../src/repositories/compte.repository.js", () => ({
  listerParPersonne: listerParPersonneMock,
}));

vi.mock("../../src/repositories/transaction.repository.js", () => ({
  lister: listerTransactionsMock,
}));

vi.mock("../../src/config/prisma.js", () => ({
  prisma: {
    categorie: {
      findMany: categorieFindManyMock,
    },
    // `chatbot.service` appelle `calculerSolde`, qui agrège les transactions.
    // Sans cette entrée, le service échoue sur « Cannot read properties of
    // undefined (reading 'aggregate') » — le mock doit couvrir tout ce que la
    // chaîne d'appels touche, pas seulement ce que le service appelle
    // directement.
    transaction: {
      aggregate: transactionAggregateMock,
    },
  },
}));

import { repondreAuMessage, resetConversations } from "../../src/services/chatbot.service.js";

describe("repondreAuMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConversations();

    // Valeurs par défaut, indispensables au SECOND appel du test : rien n'est
    // mis en file pour « personne-b », qui doit donc obtenir un contexte vide
    // — c'est précisément ce que le test vérifie. Sans ces défauts, les mocks
    // renverraient `undefined` et le service planterait sur `comptes.length`.
    // Les `mockResolvedValueOnce` du test priment pour le premier appel.
    listerParPersonneMock.mockResolvedValue([]);
    listerTransactionsMock.mockResolvedValue({ items: [], total: 0 });
    categorieFindManyMock.mockResolvedValue([]);
    // Forme exacte renvoyée par Prisma : { _sum: { montant: Decimal | null } }.
    transactionAggregateMock.mockResolvedValue({ _sum: { montant: null } });

    // Sans clé, le service court-circuite et renvoie « Le service Grok n'est
    // pas encore configuré » au lieu d'appeler fetch. La CI n'a évidemment pas
    // de vraie clé : on en stubbe une, l'appel réseau étant de toute façon
    // remplacé par le mock de fetch ci-dessous.
    vi.stubEnv("GROK_API_KEY", "cle-factice-pour-les-tests");

    // `text` n'est pas `async` : la méthode ne contient aucun `await`, et la
    // règle require-await d'ESLint le refuse. `await res.text()` fonctionne
    // tout aussi bien sur une valeur non-promesse.
    const reponseFictive = {
      ok: true,
      text: () =>
        JSON.stringify({
          choices: [{ message: { content: "Réponse de test" } }],
        }),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponseFictive));
  });

  afterEach(() => {
    // Sans ça, la clé et le fetch factices fuiteraient dans les fichiers de
    // test suivants.
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("utilise l'endpoint Groq quand la clé commence par gsk_", async () => {
    // `vi.stubEnv` plutôt qu'une affectation directe à process.env :
    // `vi.unstubAllEnvs` ne sait restaurer que ce qu'il a lui-même stubbé, une
    // affectation brute fuiterait dans les fichiers de test suivants.
    vi.stubEnv("GROK_API_KEY", "gsk_test-cle");
    vi.stubEnv("GROK_BASE_URL", "");

    listerParPersonneMock.mockResolvedValueOnce([
      { id: "compte-a", nom: "Compte courant", devise: "EUR", soldeInitial: decimal(0) },
    ]);
    listerTransactionsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
    });
    categorieFindManyMock.mockResolvedValueOnce([]);

    await repondreAuMessage("personne-a", "Bonjour");

    const [url] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("utilise le solde actuel fourni dans le contexte sans le recalculer à partir d'une seule transaction", async () => {
    listerParPersonneMock.mockResolvedValueOnce([
      { id: "compte-a", nom: "Compte courant", devise: "XOF", soldeInitial: decimal(500000) },
    ]);
    listerTransactionsMock.mockResolvedValueOnce({
      items: [
        {
          id: "txn-a",
          compteId: "compte-a",
          montant: 20000,
          type: "DEPENSE",
          libelle: "Hôtel",
          dateOperation: new Date("2026-07-20"),
        },
      ],
      total: 1,
    });
    categorieFindManyMock.mockResolvedValueOnce([]);

    await repondreAuMessage("personne-a", "Quel est mon solde actuel ?");

    const payloads = vi.mocked(fetch).mock.calls.map(([, options]) => {
      const body = options?.body;
      if (typeof body !== "string") {
        return { messages: [] as Array<{ content?: string }> };
      }

      return JSON.parse(body) as { messages?: Array<{ content?: string }> };
    });
    const prompt = payloads[0]?.messages?.[1]?.content ?? "";

    expect(prompt).toContain("solde actuel fourni");
    expect(prompt).toContain("ne recalcule pas un nouveau solde");
  });

  it("isole les conversations par utilisateur et ne mélange jamais les données de deux comptes", async () => {
    listerParPersonneMock.mockResolvedValueOnce([
      { id: "compte-a", nom: "Compte courant", devise: "EUR", soldeInitial: decimal(150000) },
    ]);
    listerTransactionsMock.mockResolvedValueOnce({
      items: [
        {
          id: "txn-a",
          compteId: "compte-a",
          montant: 42,
          type: "DEPENSE",
          libelle: "Courses",
          dateOperation: new Date("2026-07-20"),
        },
      ],
      total: 1,
    });
    categorieFindManyMock.mockResolvedValueOnce([{ id: "cat-1", nom: "Courses" }]);

    const premiereReponse = await repondreAuMessage("personne-a", "Bonjour");
    const deuxiemeReponse = await repondreAuMessage("personne-b", "Bonjour");

    expect(premiereReponse).toBe("Réponse de test");
    expect(deuxiemeReponse).toBe("Réponse de test");
    expect(listerParPersonneMock).toHaveBeenNthCalledWith(1, "personne-a");
    expect(listerParPersonneMock).toHaveBeenNthCalledWith(2, "personne-b");

    const payloads = vi.mocked(fetch).mock.calls.map(([, options]) => {
      const body = options?.body;
      if (typeof body !== "string") {
        return { messages: [] as Array<{ content?: string }> };
      }

      const parsed = JSON.parse(body) as { messages?: Array<{ content?: string }> };
      return parsed;
    });
    const premierPayload = payloads[0] ?? { messages: [] as Array<{ content?: string }> };
    const deuxiemePayload = payloads[1] ?? { messages: [] as Array<{ content?: string }> };
    const premierPrompt = premierPayload.messages?.[1]?.content ?? "";
    const deuxiemePrompt = deuxiemePayload.messages?.[1]?.content ?? "";

    expect(premierPrompt).toContain("personne-a");
    expect(deuxiemePrompt).toContain("personne-b");
    expect(deuxiemePrompt).not.toContain("Courses");
  });
});
