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
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
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
    expect(reponse.body.comptes).toHaveLength(1);
    expect(reponse.body.comptes[0].solde).toBe(60);
    expect(reponse.body.totalGlobal).toBe(60);
  });
});

describe("GET /api/v1/dashboard/depenses-par-categorie", () => {
  it("regroupe les dépenses du mois courant par catégorie", async () => {
    const { token } = await creerUtilisateur("depenses@test.local");
    const compteId = await creerCompte(token, 0);
    const aujourdhui = new Date().toISOString().slice(0, 10);

    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ compteId, montant: 30, type: "DEPENSE", libelle: "Uber", dateOperation: aujourdhui });
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 20,
        type: "DEPENSE",
        libelle: "Uber encore",
        dateOperation: aujourdhui,
      });
    // Un revenu ne doit jamais apparaître dans les dépenses.
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
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
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 999,
        type: "DEPENSE",
        libelle: "Uber ancien",
        dateOperation: dateMoisPrecedent,
      });
    // Dépense datée d'aujourd'hui : doit être comptée.
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 15,
        type: "DEPENSE",
        libelle: "Uber recent",
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

    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 42,
        type: "DEPENSE",
        libelle: "Uber du mois dernier",
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
