import app from "./app.js";
import { prisma } from "./config/prisma.js";
import { journal } from "./config/journal.js";
import { marquerIndisponible } from "./config/etat-service.js";

const port = Number(process.env.PORT ?? 5000);

/**
 * Délai entre la bascule en « indisponible » et la fermeture du serveur.
 *
 * Kubernetes envoie SIGTERM et retire le pod des Endpoints EN PARALLÈLE, et la
 * propagation aux nœuds prend quelques secondes. Fermer immédiatement couperait
 * les requêtes qui arrivent encore pendant cet intervalle. On laisse donc le
 * temps aux sondes readiness d'échouer et au routage de s'ajuster.
 */
const DELAI_DRAINAGE_MS = Number(process.env.DELAI_DRAINAGE_MS ?? 5000);

/**
 * Au-delà, on force la sortie. Une requête bloquée sur une requête SQL lente
 * ne doit pas retenir le pod indéfiniment : Kubernetes finirait de toute façon
 * par le tuer avec SIGKILL, sans laisser la moindre trace exploitable.
 */
const DELAI_ARRET_MAX_MS = Number(process.env.DELAI_ARRET_MAX_MS ?? 25000);

const serveur = app.listen(port, () => {
  journal.info({ port, env: process.env.NODE_ENV ?? "development" }, "API démarrée");
});

let arretEnCours = false;

async function arreterProprement(signal: string): Promise<void> {
  // Un second signal pendant l'arrêt (impatience, ou Kubernetes qui insiste)
  // ne doit pas relancer toute la séquence.
  if (arretEnCours) return;
  arretEnCours = true;

  journal.info({ signal }, "Arrêt demandé — début du drainage");

  // 1. Les sondes readiness commencent à échouer : plus de nouveau trafic.
  marquerIndisponible();

  const minuterieForce = setTimeout(() => {
    journal.error(
      { delaiMs: DELAI_ARRET_MAX_MS },
      "Des requêtes n'ont pas terminé à temps — sortie forcée",
    );
    process.exit(1);
  }, DELAI_ARRET_MAX_MS);
  // Cette minuterie ne doit pas, à elle seule, maintenir le process en vie.
  minuterieForce.unref();

  await new Promise((resoudre) => setTimeout(resoudre, DELAI_DRAINAGE_MS));

  // 2. On cesse d'accepter de nouvelles connexions ; celles en cours vont au
  //    bout. Le callback ne se déclenche qu'une fois la dernière terminée.
  await new Promise<void>((resoudre, rejeter) => {
    serveur.close((err) => (err ? rejeter(err) : resoudre()));
  });
  journal.info("Requêtes en cours terminées");

  // 3. Et seulement là, on libère le pool de connexions PostgreSQL.
  await prisma.$disconnect();
  journal.info("Connexion à la base fermée — arrêt terminé");

  clearTimeout(minuterieForce);
  process.exit(0);
}

// SIGTERM : Kubernetes à l'arrêt d'un pod (mise à l'échelle, rolling update,
// éviction d'un nœud). SIGINT : Ctrl+C en développement.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void arreterProprement(signal).catch((err) => {
      journal.error({ err }, "Échec de l'arrêt propre");
      process.exit(1);
    });
  });
}

// Un rejet non intercepté laisse le process dans un état inconnu. On le
// journalise AVANT de sortir : sans ça, le conteneur redémarre sans que rien
// n'explique pourquoi.
process.on("unhandledRejection", (raison) => {
  journal.fatal({ err: raison }, "Rejet de promesse non intercepté");
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  journal.fatal({ err }, "Exception non interceptée");
  process.exit(1);
});
