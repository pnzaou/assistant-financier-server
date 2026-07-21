import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/prisma.js";
import app from "../../src/app.js";

const COMPTE_PERSONNE = {
  email: "chloe@test.local",
  motDePasse: "Secret123",
  nom: "Petit",
  prenom: "Chloe",
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

describe("GET /api/v1/categories", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/categories");
    expect(reponse.status).toBe(401);
  });

  it("liste les catégories système seedées", async () => {
    const token = await inscrireEtConnecter();
    const reponse = await request(app)
      .get("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`);
    expect(reponse.status).toBe(200);
    expect(reponse.body.categories.length).toBeGreaterThan(0);
  });

  it("filtre par type", async () => {
    const token = await inscrireEtConnecter();
    const reponse = await request(app)
      .get("/api/v1/categories?type=REVENU")
      .set("Authorization", `Bearer ${token}`);
    expect(reponse.status).toBe(200);
    expect(
      (reponse.body as { categories: Array<{ type: string; nom: string }> }).categories.every(
        (c) => c.type === "REVENU",
      ),
    ).toBe(true);
    expect(
      (reponse.body as { categories: Array<{ type: string; nom: string }> }).categories.some(
        (c) => c.nom === "Salaire",
      ),
    ).toBe(true);
  });
});
