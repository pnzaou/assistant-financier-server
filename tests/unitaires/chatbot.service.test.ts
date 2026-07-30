import { beforeEach, describe, expect, it, vi } from "vitest";

const listerParPersonneMock = vi.fn();
const listerTransactionsMock = vi.fn();
const categorieFindManyMock = vi.fn();

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
  },
}));

import { repondreAuMessage, resetConversations } from "../../src/services/chatbot.service.js";

describe("repondreAuMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConversations();
    const reponseFictive = {
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "Réponse de test" } }],
      }),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponseFictive));
  });

  it("utilise l'endpoint Groq quand la clé commence par gsk_", async () => {
    process.env.GROK_API_KEY = "gsk_test-cle";
    delete process.env.GROK_BASE_URL;

    listerParPersonneMock.mockResolvedValueOnce([
      { id: "compte-a", nom: "Compte courant", devise: "EUR" },
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
      { id: "compte-a", nom: "Compte courant", devise: "XOF" },
    ]);
    listerTransactionsMock.mockResolvedValueOnce({
      items: [{ id: "txn-a", compteId: "compte-a", montant: 20000, type: "DEPENSE", libelle: "Hôtel", dateOperation: new Date("2026-07-20") }],
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
      { id: "compte-a", nom: "Compte courant", devise: "EUR" },
    ]);
    listerTransactionsMock.mockResolvedValueOnce({
      items: [{ id: "txn-a", compteId: "compte-a", montant: 42, type: "DEPENSE", libelle: "Courses", dateOperation: new Date("2026-07-20") }],
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
