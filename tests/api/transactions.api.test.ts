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

async function idCategorieSysteme(nom: string, type: "DEPENSE" | "REVENU"): Promise<string> {
  const categorie = await prisma.categorie.findFirstOrThrow({
    where: { nom, type, personneId: null },
  });
  return categorie.id;
}

beforeEach(async () => {
  await prisma.personne.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/transactions", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).post("/api/v1/transactions").send({});
    expect(reponse.status).toBe(401);
  });

  it("catégorise automatiquement une dépense sans categorieId fourni", async () => {
    const { token } = await creerUtilisateur("dep@test.local");
    const compteId = await creerCompte(token);
    const categorieTransport = await idCategorieSysteme("Transport", "DEPENSE");

    const reponse = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 15.5,
        type: "DEPENSE",
        libelle: "Uber vers l'aéroport",
        dateOperation: "2026-07-20",
      });

    expect(reponse.status).toBe(201);
    expect(reponse.body.transaction.categorieId).toBe(categorieTransport);
    expect(reponse.body.transaction.montant).toBe(15.5);
  });

  it("retombe sur 'Divers' quand aucun mot-clé ne correspond", async () => {
    const { token } = await creerUtilisateur("div@test.local");
    const compteId = await creerCompte(token);
    const categorieDivers = await idCategorieSysteme("Divers", "DEPENSE");

    const reponse = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 10,
        type: "DEPENSE",
        libelle: "Achat inconnu chez XYZ",
        dateOperation: "2026-07-20",
      });

    expect(reponse.status).toBe(201);
    expect(reponse.body.transaction.categorieId).toBe(categorieDivers);
  });

  it("accepte un categorieId fourni explicitement", async () => {
    const { token } = await creerUtilisateur("cat@test.local");
    const compteId = await creerCompte(token);
    const categorieSante = await idCategorieSysteme("Santé", "DEPENSE");

    const reponse = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 20,
        type: "DEPENSE",
        libelle: "Pharmacie du centre",
        dateOperation: "2026-07-20",
        categorieId: categorieSante,
      });

    expect(reponse.status).toBe(201);
    expect(reponse.body.transaction.categorieId).toBe(categorieSante);
  });

  it("refuse un categorieId dont le type ne correspond pas (400)", async () => {
    const { token } = await creerUtilisateur("mauvaistype@test.local");
    const compteId = await creerCompte(token);
    const categorieRevenu = await idCategorieSysteme("Salaire", "REVENU");

    const reponse = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 20,
        type: "DEPENSE",
        libelle: "Test",
        dateOperation: "2026-07-20",
        categorieId: categorieRevenu,
      });

    expect(reponse.status).toBe(400);
  });

  it("refuse un compte appartenant à un autre utilisateur (404)", async () => {
    const proprietaire = await creerUtilisateur("proprio@test.local");
    const compteId = await creerCompte(proprietaire.token);
    const intrus = await creerUtilisateur("intrus@test.local");

    const reponse = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${intrus.token}`)
      .send({
        compteId,
        montant: 20,
        type: "DEPENSE",
        libelle: "Test",
        dateOperation: "2026-07-20",
      });

    expect(reponse.status).toBe(404);
  });

  it("refuse une entrée mal formée (422)", async () => {
    const { token } = await creerUtilisateur("invalide@test.local");
    const reponse = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ montant: -5 });
    expect(reponse.status).toBe(422);
  });
});

describe("GET /api/v1/transactions", () => {
  it("liste, filtre par compte et pagine — uniquement les transactions de l'utilisateur connecté", async () => {
    const { token } = await creerUtilisateur("liste@test.local");
    const compteId = await creerCompte(token);
    const autre = await creerUtilisateur("autre@test.local");
    const autreCompteId = await creerCompte(autre.token);

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post("/api/v1/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          compteId,
          montant: 10 + i,
          type: "DEPENSE",
          libelle: `Dépense ${i}`,
          dateOperation: "2026-07-20",
        });
    }
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${autre.token}`)
      .send({
        compteId: autreCompteId,
        montant: 99,
        type: "DEPENSE",
        libelle: "Dépense d'un autre utilisateur",
        dateOperation: "2026-07-20",
      });

    const reponse = await request(app)
      .get(`/api/v1/transactions?compteId=${compteId}&page=1&limite=2`)
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.total).toBe(3);
    expect(reponse.body.items).toHaveLength(2);
  });

  it("refuse un compteId appartenant à un autre utilisateur (404)", async () => {
    const { token } = await creerUtilisateur("filtreautre@test.local");
    const autre = await creerUtilisateur("proprioautre@test.local");
    const autreCompteId = await creerCompte(autre.token);

    const reponse = await request(app)
      .get(`/api/v1/transactions?compteId=${autreCompteId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(reponse.status).toBe(404);
  });
});

describe("GET /:id, PATCH /:id, DELETE /:id", () => {
  it("modifie une transaction (montant + recatégorisation)", async () => {
    const { token } = await creerUtilisateur("patch@test.local");
    const compteId = await creerCompte(token);
    const categorieLoisirs = await idCategorieSysteme("Loisirs", "DEPENSE");

    const creation = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 10,
        type: "DEPENSE",
        libelle: "Achat divers",
        dateOperation: "2026-07-20",
      });
    const transactionId = creation.body.transaction.id as string;

    const modification = await request(app)
      .patch(`/api/v1/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ montant: 25, categorieId: categorieLoisirs });

    expect(modification.status).toBe(200);
    expect(modification.body.transaction.montant).toBe(25);
    expect(modification.body.transaction.categorieId).toBe(categorieLoisirs);
  });

  it("renvoie 404 pour la transaction d'un autre utilisateur", async () => {
    const proprietaire = await creerUtilisateur("proprioTx@test.local");
    const compteId = await creerCompte(proprietaire.token);
    const creation = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${proprietaire.token}`)
      .send({
        compteId,
        montant: 10,
        type: "DEPENSE",
        libelle: "Test",
        dateOperation: "2026-07-20",
      });
    const transactionId = creation.body.transaction.id as string;

    const intrus = await creerUtilisateur("intrusTx@test.local");
    const reponse = await request(app)
      .get(`/api/v1/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${intrus.token}`);
    expect(reponse.status).toBe(404);
  });

  it("supprime une transaction : elle n'est plus accessible ensuite", async () => {
    const { token } = await creerUtilisateur("delete@test.local");
    const compteId = await creerCompte(token);
    const creation = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 10,
        type: "DEPENSE",
        libelle: "Test",
        dateOperation: "2026-07-20",
      });
    const transactionId = creation.body.transaction.id as string;

    const suppression = await request(app)
      .delete(`/api/v1/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(suppression.status).toBe(204);

    const apres = await request(app)
      .get(`/api/v1/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(apres.status).toBe(404);
  });
});
