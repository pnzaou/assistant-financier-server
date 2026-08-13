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
      json: () => ({
        choices: [{ message: { content: "Réponse de test" } }],
      }),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponseFictive));
  });

  it("isole les conversations par utilisateur et ne mélange jamais les données de deux comptes", async () => {
    listerParPersonneMock.mockResolvedValueOnce([
      { id: "compte-a", nom: "Compte courant", devise: "EUR" },
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
