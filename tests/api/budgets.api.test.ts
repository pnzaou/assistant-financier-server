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

async function trouverCategorieDepense(token: string): Promise<string> {
  const reponse = await request(app)
    .get("/api/v1/categories")
    .query({ type: "DEPENSE" })
    .set("Authorization", `Bearer ${token}`);
  return reponse.body.categories[0].id as string;
}

async function trouverCategorieRevenu(token: string): Promise<string> {
  const reponse = await request(app)
    .get("/api/v1/categories")
    .query({ type: "REVENU" })
    .set("Authorization", `Bearer ${token}`);
  return reponse.body.categories[0].id as string;
}

beforeEach(async () => {
  await prisma.personne.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/budgets", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).post("/api/v1/budgets").send({ categorieId: "x", montantPlafond: 100 });
    expect(reponse.status).toBe(401);
  });

  it("crée un budget mensuel pour une catégorie de dépense", async () => {
    const { token } = await creerUtilisateur("budget-creer@test.local");
    const categorieId = await trouverCategorieDepense(token);

    const reponse = await request(app)
      .post("/api/v1/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ categorieId, montantPlafond: 100000 });

    expect(reponse.status).toBe(201);
    expect(reponse.body.budget).toMatchObject({
      categorieId,
      montantPlafond: 100000,
      periode: "MENSUEL",
      actif: true,
    });
  });

  it("refuse un montantPlafond manquant (422)", async () => {
    const { token } = await creerUtilisateur("budget-invalide@test.local");
    const categorieId = await trouverCategorieDepense(token);

    const reponse = await request(app)
      .post("/api/v1/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ categorieId });

    expect(reponse.status).toBe(422);
  });

  it("refuse une catégorie de type REVENU (400)", async () => {
    const { token } = await creerUtilisateur("budget-revenu@test.local");
    const categorieId = await trouverCategorieRevenu(token);

    const reponse = await request(app)
      .post("/api/v1/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ categorieId, montantPlafond: 100000 });

    expect(reponse.status).toBe(400);
  });

  it("refuse un doublon catégorie+période (409)", async () => {
    const { token } = await creerUtilisateur("budget-doublon@test.local");
    const categorieId = await trouverCategorieDepense(token);

    await request(app)
      .post("/api/v1/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ categorieId, montantPlafond: 100000 });

    const reponse = await request(app)
      .post("/api/v1/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ categorieId, montantPlafond: 50000 });

    expect(reponse.status).toBe(409);
  });
});

describe("GET /api/v1/budgets", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/budgets");
    expect(reponse.status).toBe(401);
  });

  it("ne liste que les budgets de l'utilisateur connecté", async () => {
    const { token } = await creerUtilisateur("budget-lister@test.local");
    const categorieId = await trouverCategorieDepense(token);
    await request(app)
      .post("/api/v1/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({ categorieId, montantPlafond: 75000 });

    const reponse = await request(app).get("/api/v1/budgets").set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.budgets).toHaveLength(1);
    expect(reponse.body.budgets[0]).toMatchObject({ categorieId, montantPlafond: 75000 });
  });
});
