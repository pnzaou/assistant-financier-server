import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListerParPersonne,
  mockEnvoyerNotificationPush,
  mockGenererConseilProactif,
  mockTransactionAggregate,
  mockTransactionGroupBy,
  mockPersonneFindMany,
  mockCategorieFindUnique,
} = vi.hoisted(() => ({
  mockListerParPersonne: vi.fn(),
  mockEnvoyerNotificationPush: vi.fn(),
  mockGenererConseilProactif: vi.fn(),
  mockTransactionAggregate: vi.fn(),
  mockTransactionGroupBy: vi.fn(),
  mockPersonneFindMany: vi.fn(),
  mockCategorieFindUnique: vi.fn(),
}));

vi.mock("../../src/repositories/compte.repository.js", () => ({
  listerParPersonne: mockListerParPersonne,
}));

vi.mock("../../src/services/notification.service.js", () => ({
  envoyerNotificationPush: mockEnvoyerNotificationPush,
}));

vi.mock("../../src/services/chatbot.service.js", () => ({
  genererConseilProactif: mockGenererConseilProactif,
}));

vi.mock("../../src/config/prisma.js", () => ({
  prisma: {
    transaction: {
      aggregate: mockTransactionAggregate,
      groupBy: mockTransactionGroupBy,
    },
    personne: {
      findMany: mockPersonneFindMany,
    },
    categorie: {
      findUnique: mockCategorieFindUnique,
    },
  },
}));

import {
  detecterAnomaliesCategoriePourPersonne,
  detecterAnomaliesCategoriesToutesPersonnes,
  verifierGrosseDepense,
} from "../../src/services/detection-proactive.service.js";

function decimalFictif(valeur: number) {
  return { toNumber: () => valeur };
}

describe("verifierGrosseDepense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListerParPersonne.mockResolvedValue([{ id: "compte1" }]);
    mockGenererConseilProactif.mockResolvedValue(null);
  });

  it("ne notifie pas sans historique suffisant", async () => {
    mockTransactionAggregate.mockResolvedValue({
      _avg: { montant: decimalFictif(1000) },
      _count: 2,
    });

    await verifierGrosseDepense("p1", { id: "t1", montant: 100000, libelle: "Achat" });

    expect(mockEnvoyerNotificationPush).not.toHaveBeenCalled();
  });

  it("ne notifie pas si le montant reste sous le multiplicateur", async () => {
    mockTransactionAggregate.mockResolvedValue({
      _avg: { montant: decimalFictif(1000) },
      _count: 10,
    });

    await verifierGrosseDepense("p1", { id: "t1", montant: 2000, libelle: "Achat" });

    expect(mockEnvoyerNotificationPush).not.toHaveBeenCalled();
  });

  it("notifie quand le montant dépasse 2,5x la moyenne habituelle", async () => {
    mockTransactionAggregate.mockResolvedValue({
      _avg: { montant: decimalFictif(1000) },
      _count: 10,
    });

    await verifierGrosseDepense("p1", { id: "t1", montant: 5000, libelle: "Grosse dépense" });

    expect(mockEnvoyerNotificationPush).toHaveBeenCalledWith(
      "p1",
      expect.any(String),
      // Séparateur de milliers "fr-FR" = espace fine insécable (pas un espace normal).
      expect.stringMatching(/5\D000/),
      expect.objectContaining({ type: "grosse_depense", transactionId: "t1" }),
    );
  });

  it("ne fait rien si l'utilisateur n'a aucun compte", async () => {
    mockListerParPersonne.mockResolvedValue([]);

    await verifierGrosseDepense("p1", { id: "t1", montant: 999999, libelle: "Achat" });

    expect(mockTransactionAggregate).not.toHaveBeenCalled();
    expect(mockEnvoyerNotificationPush).not.toHaveBeenCalled();
  });

  it("utilise le conseil généré par le chatbot quand il est disponible", async () => {
    mockTransactionAggregate.mockResolvedValue({
      _avg: { montant: decimalFictif(1000) },
      _count: 10,
    });
    mockGenererConseilProactif.mockResolvedValue("Conseil personnalisé du chatbot.");

    await verifierGrosseDepense("p1", { id: "t1", montant: 5000, libelle: "Grosse dépense" });

    expect(mockEnvoyerNotificationPush).toHaveBeenCalledWith(
      "p1",
      expect.any(String),
      "Conseil personnalisé du chatbot.",
      expect.objectContaining({ type: "grosse_depense" }),
    );
  });

  it("tronque un conseil du chatbot trop long", async () => {
    mockTransactionAggregate.mockResolvedValue({
      _avg: { montant: decimalFictif(1000) },
      _count: 10,
    });
    mockGenererConseilProactif.mockResolvedValue("x".repeat(300));

    await verifierGrosseDepense("p1", { id: "t1", montant: 5000, libelle: "Grosse dépense" });

    const corps = mockEnvoyerNotificationPush.mock.calls[0]![2] as string;
    expect(corps.length).toBe(180);
    expect(corps.endsWith("…")).toBe(true);
  });
});

describe("detecterAnomaliesCategoriePourPersonne", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListerParPersonne.mockResolvedValue([{ id: "compte1" }]);
    mockCategorieFindUnique.mockResolvedValue({ id: "cat1", nom: "Restaurants" });
    mockGenererConseilProactif.mockResolvedValue(null);
  });

  it("ignore une catégorie sans historique suffisant", async () => {
    mockTransactionGroupBy.mockResolvedValue([
      { categorieId: "cat1", _sum: { montant: decimalFictif(50000) } },
    ]);
    // Un seul mois avec de la dépense dans l'historique (< NB_MOIS_MIN_CATEGORIE).
    mockTransactionAggregate
      .mockResolvedValueOnce({ _sum: { montant: decimalFictif(10000) } })
      .mockResolvedValueOnce({ _sum: { montant: decimalFictif(0) } })
      .mockResolvedValueOnce({ _sum: { montant: decimalFictif(0) } });

    await detecterAnomaliesCategoriePourPersonne("p1");

    expect(mockEnvoyerNotificationPush).not.toHaveBeenCalled();
  });

  it("notifie quand la dépense du mois dépasse largement la moyenne historique proratisée", async () => {
    mockTransactionGroupBy.mockResolvedValue([
      { categorieId: "cat1", _sum: { montant: decimalFictif(100000) } },
    ]);
    // 3 mois d'historique avec une moyenne de 10 000 — même proratisée sur
    // un mois complet, 100 000 dépasse largement 1,75x cette moyenne.
    mockTransactionAggregate
      .mockResolvedValueOnce({ _sum: { montant: decimalFictif(10000) } })
      .mockResolvedValueOnce({ _sum: { montant: decimalFictif(10000) } })
      .mockResolvedValueOnce({ _sum: { montant: decimalFictif(10000) } });

    await detecterAnomaliesCategoriePourPersonne("p1");

    expect(mockEnvoyerNotificationPush).toHaveBeenCalledWith(
      "p1",
      expect.stringContaining("Restaurants"),
      expect.stringMatching(/100\D000/),
      expect.objectContaining({ type: "anomalie_categorie", categorieId: "cat1" }),
    );
  });
});

describe("detecterAnomaliesCategoriesToutesPersonnes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continue sur les autres personnes si l'une échoue", async () => {
    mockPersonneFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    mockListerParPersonne.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce([]);

    await expect(detecterAnomaliesCategoriesToutesPersonnes()).resolves.toBeUndefined();

    expect(mockListerParPersonne).toHaveBeenCalledTimes(2);
  });
});
