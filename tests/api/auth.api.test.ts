import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// L'envoi d'email est simulé : on capture les emails "envoyés" pour en
// extraire les jetons (vérification, réinitialisation) — comme un vrai
// utilisateur qui clique sur le lien reçu.
vi.mock("../../src/utils/email.util.js", () => ({
  envoyerEmail: vi.fn().mockResolvedValue(undefined),
  urlFront: () => "http://front.test",
}));

import { prisma } from "../../src/config/prisma.js";
import { envoyerEmail } from "../../src/utils/email.util.js";
import app from "../../src/app.js";

const COMPTE = {
  email: "alice@test.local",
  motDePasse: "Secret123",
  nom: "Durand",
  prenom: "Alice",
};

function dernierEmailHtml(): string {
  const appels = vi.mocked(envoyerEmail).mock.calls;
  const dernier = appels[appels.length - 1];
  if (!dernier) {
    throw new Error("Aucun email n'a été envoyé.");
  }
  return dernier[0].html;
}

function extraireJeton(html: string): string {
  const correspondance = /jeton=([0-9a-f]{64})/.exec(html);
  if (!correspondance?.[1]) {
    throw new Error(`Aucun jeton trouvé dans l'email : ${html}`);
  }
  return correspondance[1];
}

function cookiesDe(reponse: request.Response): string[] {
  return (reponse.headers["set-cookie"] ?? []) as unknown as string[];
}

async function inscrire(): Promise<request.Response> {
  return request(app).post("/api/v1/auth/register").send(COMPTE);
}

beforeEach(async () => {
  // Base de TEST (jamais celle de dev) : on repart de zéro à chaque test.
  // Les catégories système seedées restent, les personnes sont effacées
  // (comptes, sessions, jetons suivent en cascade).
  await prisma.personne.deleteMany({});
  vi.mocked(envoyerEmail).mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/auth/register", () => {
  it("crée un compte utilisateur, renvoie les tokens et pose les cookies", async () => {
    const reponse = await inscrire();

    expect(reponse.status).toBe(201);
    expect(reponse.body.utilisateur).toMatchObject({
      email: COMPTE.email,
      emailVerifie: false,
    });
    expect(reponse.body.accessToken).toBeTruthy();
    expect(reponse.body.refreshToken).toBeTruthy();

    const cookies = cookiesDe(reponse).join(" ; ");
    expect(cookies).toContain("accessToken=");
    expect(cookies).toContain("refreshToken=");
    expect(cookies).toContain("HttpOnly");

    // Un email de vérification est parti vers la bonne adresse.
    expect(vi.mocked(envoyerEmail)).toHaveBeenCalledOnce();
    expect(vi.mocked(envoyerEmail).mock.calls[0]?.[0].destinataire).toBe(COMPTE.email);
  });

  it("ne fuite JAMAIS le passwordHash", async () => {
    const reponse = await inscrire();
    expect(JSON.stringify(reponse.body)).not.toContain("passwordHash");
    expect(JSON.stringify(reponse.body)).not.toContain("$2");
  });

  it("refuse un email déjà utilisé (409)", async () => {
    await inscrire();
    const doublon = await inscrire();
    expect(doublon.status).toBe(409);
  });

  it("refuse un mot de passe faible (422) avec le détail des erreurs", async () => {
    const reponse = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...COMPTE, motDePasse: "abc" });
    expect(reponse.status).toBe(422);
    expect(reponse.body.erreurs.length).toBeGreaterThan(0);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("connecte avec les bons identifiants", async () => {
    await inscrire();
    const reponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: COMPTE.email, motDePasse: COMPTE.motDePasse });
    expect(reponse.status).toBe(200);
    expect(reponse.body.utilisateur.email).toBe(COMPTE.email);
  });

  it("répond EXACTEMENT pareil pour un email inconnu et un mauvais mot de passe (anti-énumération)", async () => {
    await inscrire();
    const emailInconnu = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inconnu@test.local", motDePasse: "Secret123" });
    const mauvaisMdp = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: COMPTE.email, motDePasse: "Mauvais123" });

    expect(emailInconnu.status).toBe(401);
    expect(mauvaisMdp.status).toBe(401);
    expect(emailInconnu.body).toEqual(mauvaisMdp.body);
  });

  it("refuse un compte banni (403), même avec le bon mot de passe", async () => {
    const inscription = await inscrire();
    await prisma.personne.update({
      where: { id: inscription.body.utilisateur.id as string },
      data: { statut: "BANNI" },
    });
    const reponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: COMPTE.email, motDePasse: COMPTE.motDePasse });
    expect(reponse.status).toBe(403);
  });
});

describe("GET /api/v1/auth/moi", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/auth/moi");
    expect(reponse.status).toBe(401);
  });

  it("répond via l'en-tête Bearer (canal mobile)", async () => {
    const inscription = await inscrire();
    const reponse = await request(app)
      .get("/api/v1/auth/moi")
      .set("Authorization", `Bearer ${inscription.body.accessToken as string}`);
    expect(reponse.status).toBe(200);
    expect(reponse.body.utilisateur.email).toBe(COMPTE.email);
  });

  it("répond via les cookies (canal web)", async () => {
    const inscription = await inscrire();
    const reponse = await request(app)
      .get("/api/v1/auth/moi")
      .set("Cookie", cookiesDe(inscription));
    expect(reponse.status).toBe(200);
    expect(reponse.body.utilisateur.email).toBe(COMPTE.email);
  });
});

describe("POST /api/v1/auth/refresh — rotation", () => {
  it("échange un refresh token valide, puis refuse sa réutilisation", async () => {
    const inscription = await inscrire();
    const ancienRefresh = inscription.body.refreshToken as string;

    const premier = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: ancienRefresh });
    expect(premier.status).toBe(200);
    expect(premier.body.refreshToken).not.toBe(ancienRefresh);

    // Rotation : l'ancien token est mort dès qu'il a servi.
    const rejeu = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: ancienRefresh });
    expect(rejeu.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("révoque la session : le refresh token ne fonctionne plus", async () => {
    const inscription = await inscrire();
    const refreshToken = inscription.body.refreshToken as string;

    const deconnexion = await request(app).post("/api/v1/auth/logout").send({ refreshToken });
    expect(deconnexion.status).toBe(204);

    const apres = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(apres.status).toBe(401);
  });
});

describe("vérification d'email", () => {
  it("le lien reçu par email vérifie le compte, et ne sert qu'une fois", async () => {
    const inscription = await inscrire();
    const jeton = extraireJeton(dernierEmailHtml());

    const verification = await request(app).post("/api/v1/auth/verifier-email").send({ jeton });
    expect(verification.status).toBe(200);

    const moi = await request(app)
      .get("/api/v1/auth/moi")
      .set("Authorization", `Bearer ${inscription.body.accessToken as string}`);
    expect(moi.body.utilisateur.emailVerifie).toBe(true);

    // Usage unique : rejouer le même jeton échoue.
    const rejeu = await request(app).post("/api/v1/auth/verifier-email").send({ jeton });
    expect(rejeu.status).toBe(400);
  });
});

describe("mot de passe oublié / réinitialisation", () => {
  it("répond pareil que l'email existe ou non (anti-énumération)", async () => {
    await inscrire();
    const connu = await request(app)
      .post("/api/v1/auth/mot-de-passe-oublie")
      .send({ email: COMPTE.email });
    const inconnu = await request(app)
      .post("/api/v1/auth/mot-de-passe-oublie")
      .send({ email: "inconnu@test.local" });
    expect(connu.status).toBe(200);
    expect(inconnu.status).toBe(200);
    expect(connu.body).toEqual(inconnu.body);
  });

  it("réinitialise le mot de passe et révoque toutes les sessions", async () => {
    const inscription = await inscrire();
    const vieuxRefresh = inscription.body.refreshToken as string;

    await request(app).post("/api/v1/auth/mot-de-passe-oublie").send({ email: COMPTE.email });
    const jeton = extraireJeton(dernierEmailHtml());

    const reinitialisation = await request(app)
      .post("/api/v1/auth/reinitialiser-mot-de-passe")
      .send({ jeton, nouveauMotDePasse: "Nouveau456" });
    expect(reinitialisation.status).toBe(200);

    // Ancien mot de passe refusé, nouveau accepté.
    const ancienLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: COMPTE.email, motDePasse: COMPTE.motDePasse });
    expect(ancienLogin.status).toBe(401);
    const nouveauLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: COMPTE.email, motDePasse: "Nouveau456" });
    expect(nouveauLogin.status).toBe(200);

    // Toutes les sessions d'avant le reset sont mortes.
    const vieuxRefreshApres = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: vieuxRefresh });
    expect(vieuxRefreshApres.status).toBe(401);
  });
});

describe("divers", () => {
  it("renvoie un 404 JSON pour une route inconnue", async () => {
    const reponse = await request(app).get("/api/v1/nexiste-pas");
    expect(reponse.status).toBe(404);
    expect(reponse.body.message).toBeTruthy();
  });
});

describe("PUT /api/v1/auth/push-token", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app)
      .put("/api/v1/auth/push-token")
      .send({ token: "ExponentPushToken[xxx]" });
    expect(reponse.status).toBe(401);
  });

  it("enregistre le token Expo Push de l'utilisateur connecté", async () => {
    const inscription = await inscrire();
    const accessToken = inscription.body.accessToken as string;

    const reponse = await request(app)
      .put("/api/v1/auth/push-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "ExponentPushToken[xxx]" });

    expect(reponse.status).toBe(204);
    const personne = await prisma.personne.findUnique({ where: { email: COMPTE.email } });
    expect(personne?.expoPushToken).toBe("ExponentPushToken[xxx]");
    expect(personne?.expoPushTokenMisAJourLe).toBeInstanceOf(Date);
  });

  it("accepte token: null pour désinscrire l'appareil", async () => {
    const inscription = await inscrire();
    const accessToken = inscription.body.accessToken as string;

    await request(app)
      .put("/api/v1/auth/push-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "ExponentPushToken[xxx]" });

    const reponse = await request(app)
      .put("/api/v1/auth/push-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: null });

    expect(reponse.status).toBe(204);
    const personne = await prisma.personne.findUnique({ where: { email: COMPTE.email } });
    expect(personne?.expoPushToken).toBeNull();
  });

  it("refuse un token qui n'est ni une chaîne ni null (422)", async () => {
    const inscription = await inscrire();
    const accessToken = inscription.body.accessToken as string;

    const reponse = await request(app)
      .put("/api/v1/auth/push-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: 12345 });

    expect(reponse.status).toBe(422);
  });
});
