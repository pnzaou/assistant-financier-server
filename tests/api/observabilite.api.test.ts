import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/prisma.js";
import app from "../../src/app.js";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /metrics", () => {
  it("expose les métriques au format Prometheus", async () => {
    const reponse = await request(app).get("/metrics");

    expect(reponse.status).toBe(200);
    expect(reponse.headers["content-type"]).toContain("text/plain");
    // Format d'exposition Prometheus : chaque métrique est précédée de sa
    // ligne HELP.
    expect(reponse.text).toContain("# HELP");
  });

  it("publie les métriques du process Node", async () => {
    const reponse = await request(app).get("/metrics");

    // Ce sont elles qui répondent à « le service sature-t-il ? ».
    expect(reponse.text).toContain("process_cpu_seconds_total");
    expect(reponse.text).toContain("nodejs_eventloop_lag_seconds");
  });

  it("publie les métriques HTTP applicatives", async () => {
    await request(app).get("/health");
    const reponse = await request(app).get("/metrics");

    expect(reponse.text).toContain("http_requetes_duree_secondes");
    expect(reponse.text).toContain("http_requetes_total");
  });

  it("ne se compte pas lui-même", async () => {
    await request(app).get("/metrics");
    const reponse = await request(app).get("/metrics");

    // Une métrique sur la collecte des métriques n'apprendrait rien et
    // grossirait à chaque scrutation de Prometheus.
    expect(reponse.text).not.toContain('route="/metrics"');
  });
});

describe("étiquetage des routes", () => {
  it("utilise le motif de route, jamais l'identifiant réel", async () => {
    const idFactice = "0193f2a1-1111-7000-8000-000000000001";
    await request(app).get(`/api/v1/transactions/${idFactice}`);

    const reponse = await request(app).get("/metrics");

    // LE point critique de ces métriques : avec l'URL brute, chaque
    // transaction consultée créerait une série temporelle de plus et ferait
    // gonfler la mémoire de Prometheus sans limite.
    expect(reponse.text).not.toContain(idFactice);
  });

  it("retombe sur le point de montage quand un middleware rejette avant la route", async () => {
    // Les routeurs protégés déclarent `router.use(middlewareJwt)` : sur un 401,
    // aucune route n'est appariée. L'étiquette doit rester exploitable.
    await request(app).get("/api/v1/comptes");

    const reponse = await request(app).get("/metrics");
    expect(reponse.text).toContain('route="/api/v1/comptes"');
  });

  it("regroupe les URLs inconnues sous une étiquette unique", async () => {
    await request(app).get("/wp-admin/setup-config.php");
    await request(app).get("/.env.backup");

    const reponse = await request(app).get("/metrics");

    // Sans ce regroupement, un scanner suffirait à saturer Prometheus.
    expect(reponse.text).toContain('route="__inconnu"');
    expect(reponse.text).not.toContain("wp-admin");
  });
});

describe("GET /health", () => {
  it("répond ok quand la base est joignable", async () => {
    const reponse = await request(app).get("/health");

    expect(reponse.status).toBe(200);
    expect(reponse.body.status).toBe("ok");
    expect(reponse.body.db).toBe("ok");
  });

  it("renvoie un identifiant de corrélation", async () => {
    const reponse = await request(app).get("/health");

    // Renvoyé au client pour qu'il puisse le citer dans un rapport de bug.
    expect(reponse.headers["x-request-id"]).toBeTruthy();
  });

  it("réutilise l'identifiant fourni par le client", async () => {
    const identifiant = "trace-de-test-12345";
    const reponse = await request(app).get("/health").set("X-Request-Id", identifiant);

    expect(reponse.headers["x-request-id"]).toBe(identifiant);
  });
});

// EN DERNIER, délibérément : `marquerIndisponible` bascule un drapeau au
// niveau du module, sans retour en arrière possible. Tout test placé après
// celui-ci verrait /health répondre 503.
describe("arrêt en douceur", () => {
  it("fait échouer la sonde dès que l'arrêt est amorcé", async () => {
    const { marquerIndisponible } = await import("../../src/config/etat-service.js");
    marquerIndisponible();

    const reponse = await request(app).get("/health");

    // C'est ce 503 qui indique à Kubernetes de retirer le pod des Endpoints
    // AVANT que le serveur ne ferme ses connexions — sans quoi les requêtes en
    // vol seraient coupées.
    expect(reponse.status).toBe(503);
    expect(reponse.body.status).toBe("arret_en_cours");
  });
});
