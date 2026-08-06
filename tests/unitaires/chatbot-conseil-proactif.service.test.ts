import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockListerParPersonne, mockTransactionLister, mockCategorieFindMany } = vi.hoisted(() => ({
  mockListerParPersonne: vi.fn(),
  mockTransactionLister: vi.fn(),
  mockCategorieFindMany: vi.fn(),
}));

vi.mock("../../src/repositories/compte.repository.js", () => ({
  listerParPersonne: mockListerParPersonne,
}));

vi.mock("../../src/repositories/transaction.repository.js", () => ({
  lister: mockTransactionLister,
}));

vi.mock("../../src/config/prisma.js", () => ({
  prisma: {
    categorie: {
      findMany: mockCategorieFindMany,
    },
  },
}));

import { genererConseilProactif } from "../../src/services/chatbot.service.js";

describe("genererConseilProactif", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListerParPersonne.mockResolvedValue([]);
    mockTransactionLister.mockResolvedValue({ items: [] });
    mockCategorieFindMany.mockResolvedValue([]);
    delete process.env.GROK_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renvoie null sans appel réseau si la clé API n'est pas configurée", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resultat = await genererConseilProactif("p1", "Grosse dépense de test.");

    expect(resultat).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renvoie le texte généré quand l'appel réussit", async () => {
    process.env.GROK_API_KEY = "gsk_test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Attention à vos dépenses ce mois-ci." } }] }),
      }),
    );

    const resultat = await genererConseilProactif("p1", "Grosse dépense de test.");

    expect(resultat).toBe("Attention à vos dépenses ce mois-ci.");
  });

  it("renvoie null si la réponse HTTP n'est pas ok", async () => {
    process.env.GROK_API_KEY = "gsk_test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const resultat = await genererConseilProactif("p1", "Grosse dépense de test.");

    expect(resultat).toBeNull();
  });

  it("renvoie null si l'appel réseau échoue", async () => {
    process.env.GROK_API_KEY = "gsk_test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const resultat = await genererConseilProactif("p1", "Grosse dépense de test.");

    expect(resultat).toBeNull();
  });
});
