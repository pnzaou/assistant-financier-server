import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/prisma.js";
import app from "../../src/app.js";

const COMPTE_PERSONNE = {
  email: "bob@test.local",
  motDePasse: "Secret123",
  nom: "Martin",
  prenom: "Bob",
};

async function inscrireEtConnecter(): Promise<string> {
  const reponse = await request(app).post("/api/v1/auth/register").send(COMPTE_PERSONNE);
  return reponse.body.accessToken as string;
}

beforeEach(async () => {
  await prisma.personne.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/comptes", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).post("/api/v1/comptes").send({ nom: "Compte courant" });
    expect(reponse.status).toBe(401);
  });

  it("crée un compte et le renvoie avec un solde calculé", async () => {
    const token = await inscrireEtConnecter();
    const reponse = await request(app)
      .post("/api/v1/comptes")
      .set("Authorization", `Bearer ${token}`)
      .send({ nom: "Compte courant", soldeInitial: 100 });

    expect(reponse.status).toBe(201);
    expect(reponse.body.compte).toMatchObject({
      nom: "Compte courant",
      type: "COURANT",
      soldeInitial: 100,
      solde: 100,
      devise: "EUR",
    });
  });

  it("refuse un nom vide (422)", async () => {
    const token = await inscrireEtConnecter();
    const reponse = await request(app)
      .post("/api/v1/comptes")
      .set("Authorization", `Bearer ${token}`)
      .send({ nom: "" });
    expect(reponse.status).toBe(422);
  });
});

describe("GET /api/v1/comptes", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/comptes");
    expect(reponse.status).toBe(401);
  });

  it("ne liste que les comptes de l'utilisateur connecté, avec le solde recalculé depuis les transactions", async () => {
    const token = await inscrireEtConnecter();
    const creation = await request(app)
      .post("/api/v1/comptes")
      .set("Authorization", `Bearer ${token}`)
      .send({ nom: "Compte courant", soldeInitial: 100 });
    const compteId = creation.body.compte.id as string;

    // Insérées directement en base : le module Transactions (Task 4) n'existe
    // pas encore à ce stade du plan, mais la table existe (migration déjà appliquée).
    await prisma.transaction.create({
      data: {
        compteId,
        montant: 30,
        type: "DEPENSE",
        libelle: "Courses",
        dateOperation: new Date(),
      },
    });
    await prisma.transaction.create({
      data: {
        compteId,
        montant: 20,
        type: "REVENU",
        libelle: "Remboursement",
        dateOperation: new Date(),
      },
    });

    const reponse = await request(app)
      .get("/api/v1/comptes")
      .set("Authorization", `Bearer ${token}`);
    expect(reponse.status).toBe(200);
    expect(reponse.body.comptes).toHaveLength(1);
    expect(reponse.body.comptes[0].solde).toBe(90); // 100 - 30 + 20
  });
});
