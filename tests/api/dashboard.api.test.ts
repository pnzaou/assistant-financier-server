import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/prisma.js";
import app from "../../src/app.js";

async function creerUtilisateur(email: string): Promise<{ token: string }> {
  const reponse = await request(app).post("/api/v1/auth/register").send({
    email,
    motDePasse: "Secret123",
    nom: "Test",
    prenom: "Utilisateur",
  });
  return { token: reponse.body.accessToken as string };
}

async function creerCompte(token: string, soldeInitial = 0): Promise<string> {
  const reponse = await request(app)
    .post("/api/v1/comptes")
    .set("Authorization", `Bearer ${token}`)
    .send({ nom: "Compte courant", soldeInitial });
  return reponse.body.compte.id as string;
}

async function trouverCategorieDepense(token: string): Promise<string> {
  const reponse = await request(app)
    .get("/api/v1/categories")
    .query({ type: "DEPENSE" })
    .set("Authorization", `Bearer ${token}`);
  return reponse.body.categories[0].id as string;
}

// Le jour 15 du mois précédent, calé sur le jour 1 pour éviter tout
// débordement de date (ex : le 31 mars - 1 mois ne doit pas retomber en mars).
function dateMoisPrecedent(): string {
  const maintenant = new Date();
  const premierJourMoisPrecedent = new Date(
    Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1),
  );
  return new Date(
    Date.UTC(premierJourMoisPrecedent.getUTCFullYear(), premierJourMoisPrecedent.getUTCMonth(), 15),
  )
    .toISOString()
    .slice(0, 10);
}

beforeEach(async () => {
  await prisma.personne.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/dashboard/soldes", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/dashboard/soldes");
    expect(reponse.status).toBe(401);
  });

  it("renvoie le solde de chaque compte et le total global", async () => {
    const { token } = await creerUtilisateur("dashboard@test.local");
    const compteId = await creerCompte(token, 100);
    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 40,
      type: "DEPENSE",
      libelle: "Courses",
      dateOperation: "2026-07-20",
    });

    const reponse = await request(app)
      .get("/api/v1/dashboard/soldes")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.soldes.comptes).toHaveLength(1);
    expect(reponse.body.soldes.comptes[0].solde).toBe(60);
    expect(reponse.body.soldes.totalGlobal).toBe(60);
  });
});

describe("GET /api/v1/dashboard/depenses-par-categorie", () => {
  it("regroupe les dépenses du mois courant par catégorie", async () => {
    const { token } = await creerUtilisateur("depenses@test.local");
    const compteId = await creerCompte(token, 0);
    const aujourdhui = new Date().toISOString().slice(0, 10);

    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 30,
      type: "DEPENSE",
      libelle: "Yango",
      dateOperation: aujourdhui,
    });
    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 20,
      type: "DEPENSE",
      libelle: "Yango encore",
      dateOperation: aujourdhui,
    });
    // Un revenu ne doit jamais apparaître dans les dépenses.
    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 500,
      type: "REVENU",
      libelle: "Salaire",
      dateOperation: aujourdhui,
    });

    const reponse = await request(app)
      .get("/api/v1/dashboard/depenses-par-categorie")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    const corps = reponse.body as {
      depenses: Array<{ categorieId: string; nomCategorie: string; montantTotal: number }>;
    };
    const transport = corps.depenses.find((d) => d.nomCategorie === "Transport");
    expect(transport).toBeTruthy();
    expect(transport?.montantTotal).toBe(50);
  });

  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/dashboard/depenses-par-categorie");
    expect(reponse.status).toBe(401);
  });

  it("exclut les dépenses en dehors du mois calendaire courant (par défaut)", async () => {
    const { token } = await creerUtilisateur("depenses-hors-mois@test.local");
    const compteId = await creerCompte(token, 0);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const maintenant = new Date();
    // On se cale toujours sur le jour 1 du mois précédent avant de faire
    // de l'arithmétique de mois, pour éviter tout débordement de date
    // (ex: le 31 mars - 1 mois ne doit jamais retomber en mars).
    const premierJourMoisPrecedent = new Date(
      Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1),
    );
    // Le jour 15 existe dans tous les mois, quelle que soit sa longueur.
    const dateMoisPrecedent = new Date(
      Date.UTC(
        premierJourMoisPrecedent.getUTCFullYear(),
        premierJourMoisPrecedent.getUTCMonth(),
        15,
      ),
    )
      .toISOString()
      .slice(0, 10);

    // Dépense datée du mois précédent : ne doit pas être comptée par défaut.
    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 999,
      type: "DEPENSE",
      libelle: "Yango ancien",
      dateOperation: dateMoisPrecedent,
    });
    // Dépense datée d'aujourd'hui : doit être comptée.
    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 15,
      type: "DEPENSE",
      libelle: "Yango recent",
      dateOperation: aujourdhui,
    });

    const reponse = await request(app)
      .get("/api/v1/dashboard/depenses-par-categorie")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    const corps = reponse.body as {
      depenses: Array<{ categorieId: string; nomCategorie: string; montantTotal: number }>;
    };
    const transport = corps.depenses.find((d) => d.nomCategorie === "Transport");
    expect(transport).toBeTruthy();
    expect(transport?.montantTotal).toBe(15);
  });

  it("les paramètres du/au remplacent la période par défaut du mois courant", async () => {
    const { token } = await creerUtilisateur("depenses-du-au@test.local");
    const compteId = await creerCompte(token, 0);
    const maintenant = new Date();
    // On se cale toujours sur le jour 1 du mois précédent avant de faire
    // de l'arithmétique de mois, pour éviter tout débordement de date
    // (ex: le 31 mars - 1 mois ne doit jamais retomber en mars).
    const premierJourMoisPrecedent = new Date(
      Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1),
    );
    // Le jour 15 existe dans tous les mois, quelle que soit sa longueur.
    const dateMoisPrecedent = new Date(
      Date.UTC(
        premierJourMoisPrecedent.getUTCFullYear(),
        premierJourMoisPrecedent.getUTCMonth(),
        15,
      ),
    )
      .toISOString()
      .slice(0, 10);

    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 42,
      type: "DEPENSE",
      libelle: "Yango du mois dernier",
      dateOperation: dateMoisPrecedent,
    });

    // On réutilise premierJourMoisPrecedent (déjà calé sur le jour 1) pour
    // dériver le début et la fin du mois précédent, sans recalculer
    // "mois courant - 1" séparément.
    const du = premierJourMoisPrecedent.toISOString().slice(0, 10);
    const au = new Date(
      Date.UTC(
        premierJourMoisPrecedent.getUTCFullYear(),
        premierJourMoisPrecedent.getUTCMonth() + 1,
        0,
      ),
    )
      .toISOString()
      .slice(0, 10);

    const reponse = await request(app)
      .get("/api/v1/dashboard/depenses-par-categorie")
      .query({ du, au })
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    const corps = reponse.body as {
      depenses: Array<{ categorieId: string; nomCategorie: string; montantTotal: number }>;
    };
    const transport = corps.depenses.find((d) => d.nomCategorie === "Transport");
    expect(transport).toBeTruthy();
    expect(transport?.montantTotal).toBe(42);
  });
});

describe("GET /api/v1/dashboard/vue-ensemble", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/dashboard/vue-ensemble");
    expect(reponse.status).toBe(401);
  });

  it("calcule revenus, dépenses et épargne du mois courant", async () => {
    const { token } = await creerUtilisateur("vue-ensemble@test.local");
    const compteId = await creerCompte(token, 0);
    const aujourdhui = new Date().toISOString().slice(0, 10);

    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 500,
      type: "REVENU",
      libelle: "Salaire",
      dateOperation: aujourdhui,
    });
    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 200,
      type: "DEPENSE",
      libelle: "Courses",
      dateOperation: aujourdhui,
    });

    const reponse = await request(app)
      .get("/api/v1/dashboard/vue-ensemble")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.vueEnsemble).toMatchObject({ revenus: 500, depenses: 200, epargne: 300, budgetPourcentage: null });
  });

  it("exclut les transactions du mois précédent du calcul revenus/dépenses", async () => {
    const { token } = await creerUtilisateur("vue-ensemble-mois-precedent@test.local");
    const compteId = await creerCompte(token, 0);

    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 999,
      type: "DEPENSE",
      libelle: "Ancienne dépense",
      dateOperation: dateMoisPrecedent(),
    });

    const reponse = await request(app)
      .get("/api/v1/dashboard/vue-ensemble")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.vueEnsemble.depenses).toBe(0);
  });

  it("renvoie budgetPourcentage=null sans budget actif, et calculé sinon", async () => {
    const { token } = await creerUtilisateur("vue-ensemble-budget@test.local");
    const compteId = await creerCompte(token, 0);
    const categorieId = await trouverCategorieDepense(token);
    const aujourdhui = new Date().toISOString().slice(0, 10);

    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 250,
      type: "DEPENSE",
      libelle: "Dépense catégorisée",
      dateOperation: aujourdhui,
      categorieId,
    });

    const sansBudget = await request(app)
      .get("/api/v1/dashboard/vue-ensemble")
      .set("Authorization", `Bearer ${token}`);
    expect(sansBudget.body.vueEnsemble.budgetPourcentage).toBeNull();

    await request(app)
      .post("/api/v1/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ categorieId, montantPlafond: 1000 });

    const avecBudget = await request(app)
      .get("/api/v1/dashboard/vue-ensemble")
      .set("Authorization", `Bearer ${token}`);
    expect(avecBudget.body.vueEnsemble.budgetPourcentage).toBe(25);
  });

  it("calcule la variation du solde total vs la fin du mois précédent", async () => {
    const { token } = await creerUtilisateur("vue-ensemble-variation@test.local");
    const compteId = await creerCompte(token, 1000);
    const aujourdhui = new Date().toISOString().slice(0, 10);

    // Solde au début du mois courant : 1000 - 200 = 800.
    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 200,
      type: "DEPENSE",
      libelle: "Dépense du mois dernier",
      dateOperation: dateMoisPrecedent(),
    });
    // Solde actuel : 800 + 100 = 900.
    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 100,
      type: "REVENU",
      libelle: "Revenu du mois",
      dateOperation: aujourdhui,
    });

    const reponse = await request(app)
      .get("/api/v1/dashboard/vue-ensemble")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.vueEnsemble.variationSoldePourcentage).toBeCloseTo(12.5, 5);
  });

  it("renvoie variationSoldePourcentage=null quand le solde de référence est nul", async () => {
    const { token } = await creerUtilisateur("vue-ensemble-variation-nulle@test.local");
    const compteId = await creerCompte(token, 0);
    const aujourdhui = new Date().toISOString().slice(0, 10);

    await request(app).post("/api/v1/transactions").set("Authorization", `Bearer ${token}`).send({
      compteId,
      montant: 500,
      type: "REVENU",
      libelle: "Salaire",
      dateOperation: aujourdhui,
    });

    const reponse = await request(app)
      .get("/api/v1/dashboard/vue-ensemble")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.vueEnsemble.variationSoldePourcentage).toBeNull();
  });
});
