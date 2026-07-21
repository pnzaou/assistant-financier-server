import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Categorie } from "../../generated/prisma/client.js";

vi.mock("../../src/repositories/categorie.repository.js", () => ({
  trouverSystemeParNomEtType: vi.fn(),
}));

import { trouverSystemeParNomEtType } from "../../src/repositories/categorie.repository.js";
import { deviner } from "../../src/services/categorisation.service.js";

function categorieAvecId(id: string): Categorie {
  return { id } as unknown as Categorie;
}

describe("deviner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("reconnaît un mot-clé de dépense (insensible à la casse)", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(categorieAvecId("cat-transport"));

    const resultat = await deviner("UBER *TRIP 12H30", "DEPENSE");

    expect(resultat).toBe("cat-transport");
    expect(trouverSystemeParNomEtType).toHaveBeenCalledWith("Transport", "DEPENSE");
  });

  it("reconnaît un mot-clé de revenu", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(categorieAvecId("cat-salaire"));

    const resultat = await deviner("Virement salaire juillet", "REVENU");

    expect(resultat).toBe("cat-salaire");
    expect(trouverSystemeParNomEtType).toHaveBeenCalledWith("Salaire", "REVENU");
  });

  it("retombe sur Divers si aucun mot-clé ne correspond (dépense)", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(categorieAvecId("cat-divers"));

    const resultat = await deviner("Achat imprévu chez un commerçant inconnu", "DEPENSE");

    expect(resultat).toBe("cat-divers");
    expect(trouverSystemeParNomEtType).toHaveBeenCalledWith("Divers", "DEPENSE");
  });

  it("retombe sur Autres revenus si aucun mot-clé ne correspond (revenu)", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(
      categorieAvecId("cat-autres-revenus"),
    );

    const resultat = await deviner("Encaissement divers", "REVENU");

    expect(resultat).toBe("cat-autres-revenus");
    expect(trouverSystemeParNomEtType).toHaveBeenCalledWith("Autres revenus", "REVENU");
  });

  it("retombe sur le défaut si le mot-clé correspond à une catégorie du mauvais type", async () => {
    // "salaire" matche la règle Salaire/REVENU, mais ici la transaction est une
    // DEPENSE ("avance sur salaire") : Salaire/DEPENSE n'existe pas -> fallback Divers.
    vi.mocked(trouverSystemeParNomEtType)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(categorieAvecId("cat-divers"));

    const resultat = await deviner("Avance sur salaire", "DEPENSE");

    expect(resultat).toBe("cat-divers");
    expect(trouverSystemeParNomEtType).toHaveBeenNthCalledWith(1, "Salaire", "DEPENSE");
    expect(trouverSystemeParNomEtType).toHaveBeenNthCalledWith(2, "Divers", "DEPENSE");
  });

  it("lève une erreur si même la catégorie par défaut est introuvable (seed manquant)", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(null);

    await expect(deviner("Dépense sans mot-clé connu", "DEPENSE")).rejects.toThrow(/Divers/);
  });
});
