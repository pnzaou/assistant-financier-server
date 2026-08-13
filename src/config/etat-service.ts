/**
 * État de disponibilité du service, partagé entre le point d'entrée (qui
 * intercepte SIGTERM) et la sonde /health.
 *
 * Pourquoi ce drapeau existe : à l'arrêt d'un pod, Kubernetes envoie SIGTERM
 * ET retire le pod des Endpoints du Service — mais les deux se produisent en
 * parallèle, et la propagation aux nœuds prend quelques secondes. Fermer le
 * serveur dès réception du signal couperait donc les requêtes qui arrivent
 * encore pendant cet intervalle.
 *
 * La séquence correcte : on bascule d'abord en « indisponible », la sonde
 * readiness échoue, Kubernetes cesse de router — ET SEULEMENT ENSUITE on
 * ferme le serveur.
 */
let disponible = true;

export function serviceDisponible(): boolean {
  return disponible;
}

export function marquerIndisponible(): void {
  disponible = false;
}
