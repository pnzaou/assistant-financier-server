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

async function creerCompte(token: string): Promise<string> {
  const reponse = await request(app)
    .post("/api/v1/comptes")
    .set("Authorization", `Bearer ${token}`)
    .send({ nom: "Compte épargne", soldeInitial: 0 });
  return reponse.body.compte.id as string;
}

beforeEach(async () => {
  await prisma.personne.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/objectifs", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).post("/api/v1/objectifs").send({ nom: "Vacances", montantCible: 100 });
    expect(reponse.status).toBe(401);
  });

  it("crée un objectif d'épargne", async () => {
    const { token } = await creerUtilisateur("objectif-creer@test.local");

    const reponse = await request(app)
      .post("/api/v1/objectifs")
      .set("Authorization", `Bearer ${token}`)
      .send({ nom: "Voyage à Bali", montantCible: 1500000, montantActuel: 750000 });

    expect(reponse.status).toBe(201);
    expect(reponse.body.objectif).toMatchObject({
      nom: "Voyage à Bali",
      montantCible: 1500000,
      montantActuel: 750000,
      statut: "EN_COURS",
      compteId: null,
    });
  });

  it("refuse un montantCible manquant (422)", async () => {
    const { token } = await creerUtilisateur("objectif-invalide@test.local");

    const reponse = await request(app)
      .post("/api/v1/objectifs")
      .set("Authorization", `Bearer ${token}`)
      .send({ nom: "Vacances" });

    expect(reponse.status).toBe(422);
  });

  it("refuse un compteId qui n'appartient pas à l'utilisateur (404)", async () => {
    const { token: tokenA } = await creerUtilisateur("objectif-compte-a@test.local");
    const { token: tokenB } = await creerUtilisateur("objectif-compte-b@test.local");
    const compteDeB = await creerCompte(tokenB);

    const reponse = await request(app)
      .post("/api/v1/objectifs")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nom: "Vacances", montantCible: 100000, compteId: compteDeB });

    expect(reponse.status).toBe(404);
  });

  it("accepte un compteId appartenant à l'utilisateur", async () => {
    const { token } = await creerUtilisateur("objectif-compte-ok@test.local");
    const compteId = await creerCompte(token);

    const reponse = await request(app)
      .post("/api/v1/objectifs")
      .set("Authorization", `Bearer ${token}`)
      .send({ nom: "Fonds d'urgence", montantCible: 200000, compteId });

    expect(reponse.status).toBe(201);
    expect(reponse.body.objectif.compteId).toBe(compteId);
  });
});

describe("GET /api/v1/objectifs", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/objectifs");
    expect(reponse.status).toBe(401);
  });

  it("ne liste que les objectifs de l'utilisateur connecté", async () => {
    const { token } = await creerUtilisateur("objectif-lister@test.local");
    await request(app)
      .post("/api/v1/objectifs")
      .set("Authorization", `Bearer ${token}`)
      .send({ nom: "Voyage à Bali", montantCible: 1500000, montantActuel: 750000 });

    const reponse = await request(app).get("/api/v1/objectifs").set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.objectifs).toHaveLength(1);
    expect(reponse.body.objectifs[0]).toMatchObject({ nom: "Voyage à Bali", montantCible: 1500000 });
  });
});
