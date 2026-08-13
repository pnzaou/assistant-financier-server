import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/config/prisma.js";
import app from "../../src/app.js";

async function creerUtilisateur(email: string): Promise<{ token: string; personneId: string }> {
  const reponse = await request(app).post("/api/v1/auth/register").send({
    email,
    motDePasse: "Secret123",
    nom: "Test",
    prenom: "Utilisateur",
  });
  return {
    token: reponse.body.accessToken as string,
    personneId: reponse.body.utilisateur.id as string,
  };
}

beforeEach(async () => {
  await prisma.personne.deleteMany({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/notifications/test", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).post("/api/v1/notifications/test");
    expect(reponse.status).toBe(401);
  });

  it("renvoie envoye=false si l'utilisateur n'a pas de token push enregistré", async () => {
    const { token } = await creerUtilisateur("notif-sans-token@test.local");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reponse = await request(app)
      .post("/api/v1/notifications/test")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ envoye: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envoie via l'API Expo Push quand un token est enregistré", async () => {
    const { token, personneId } = await creerUtilisateur("notif-avec-token@test.local");
    await prisma.personne.update({
      where: { id: personneId },
      data: { expoPushToken: "ExponentPushToken[test]" },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => JSON.stringify({ data: { status: "ok" } }),
      json: () => ({ data: { status: "ok" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const reponse = await request(app)
      .post("/api/v1/notifications/test")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ envoye: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
