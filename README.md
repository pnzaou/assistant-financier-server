# Assistant Financier — Serveur (API)

API de l'application **Assistant Financier intelligent**.
**Stack :** Node 24 · Express 5 · TypeScript · Prisma 7 · PostgreSQL 17 · Docker.

Tout tourne dans Docker : **pas besoin d'installer Node, npm ni PostgreSQL** sur ta machine.

> **Périmètre actuel :** infra (repo, Docker, CI/CD), **authentification**
> (inscription / connexion / vérification email / reset mot de passe) et le
> **schéma** du domaine financier (comptes, catégories, transactions, budgets,
> objectifs, transactions récurrentes). Les **couches applicatives** de ces
> entités (endpoints CRUD) et la partie « intelligente » (analyses, insights,
> alertes) viendront ensuite. App **mono-utilisateur** : pas de rôle ni d'admin.

## Démarrer (première fois)

Prérequis : [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé **et lancé**.

```bash
git clone <url-du-repo-server> server
cd server

# Windows :
copy .env.example .env
# macOS / Linux :
cp .env.example .env

# Génère tes clés JWT (RS256) puis colle les 2 lignes affichées dans ton .env :
docker compose run --rm --no-deps server node scripts/generer-cles.js

docker compose up --build
```

L'API est prête quand tu vois `API Assistant Financier démarrée sur http://localhost:5000`.
Test rapide : ouvre <http://localhost:5000/health> → `{"status":"ok","db":"ok","categories":17}`.

Les fois suivantes, un simple `docker compose up` suffit
(`--build` seulement si `package.json` ou le `Dockerfile` ont changé).

## Avec le front

Le front (React + Vite + TS) est un **repo séparé**, à cloner **à côté** de ce repo,
dans un dossier nommé exactement `client` :

```
assistant-financier/
├── server/   ← ce repo
└── client/   ← repo du front
```

Puis, depuis `server/` :

```bash
docker compose --profile client up --build
```

- Front : <http://localhost:5173>
- API : <http://localhost:5000>
- Le conteneur du front fait son `npm install` tout seul au premier démarrage.

## Commandes du quotidien

Toutes se lancent depuis le dossier `server/`.

| Besoin                                            | Commande                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Démarrer / arrêter                                | `docker compose up` / `Ctrl+C` puis `docker compose down`                                                    |
| Suivre les logs de l'API                          | `docker compose logs -f server`                                                                              |
| J'ai modifié `schema.prisma` → créer la migration | `docker compose exec server npx prisma migrate dev --name ma_modif`                                          |
| Ajouter un package npm                            | `docker compose exec server npm install <package>`                                                           |
| Vérifier les types                                | `docker compose exec server npm run typecheck`                                                               |
| Lancer les tests                                  | `docker compose exec server npm test` (mode veille : `npm run test:watch`)                                   |
| Explorer la BD (Prisma Studio)                    | `docker compose exec server npx prisma studio --port 5555 --browser none` puis ouvre <http://localhost:5555> |
| Repartir d'une BD vide                            | `docker compose down -v` puis `docker compose up`                                                            |

> Le code est monté dans le conteneur : chaque sauvegarde d'un fichier de `src/`
> redémarre l'API automatiquement (nodemon). Pas besoin de rebuild.

## Workflow d'équipe

1. `git pull`, puis `docker compose up` (ajoute `--build` si `package.json` a bougé).
2. Code. Le hot reload fait le reste.
3. Changement de modèle ? Édite `prisma/schema.prisma` puis
   `docker compose exec server npx prisma migrate dev --name <nom>` —
   **la migration générée doit être commitée** avec ton code.
4. Teste via Docker (au minimum <http://localhost:5000/health> et tes endpoints).
5. Push sur GitHub.

## Production

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Image compilée (tsc → `dist/`), dépendances de prod uniquement, migrations
appliquées automatiquement au démarrage (`prisma migrate deploy`).
Pense à définir un vrai mot de passe Postgres et un vrai `COOKIE_SECRET` dans `.env`.
Les clés JWT (`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`) doivent être **les mêmes à
chaque déploiement** — les régénérer invaliderait tous les tokens émis.

## Observabilité

| Endpoint       | Rôle                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /health`  | Sonde de vivacité et de disponibilité. Répond **503** pendant l'arrêt en douceur, ou si la base est injoignable. |
| `GET /metrics` | Métriques au format Prometheus. Non exposé publiquement : l'Ingress ne route que `/api` et `/health` vers l'API. |

**Journaux.** Une ligne JSON par requête sur stdout (`pino`), filtrable par
`requestId`, `statut` ou `responseTime`. Chaque réponse porte un en-tête
`X-Request-Id` : un utilisateur qui signale un bug peut le citer, et la requête
exacte se retrouve dans les journaux. Les en-têtes `Authorization` et `Cookie`,
ainsi que tout champ ressemblant à un mot de passe ou un jeton, sont masqués.

La sortie est du JSON brut par défaut. `LOG_PRETTY=true` active `pino-pretty`
pour une lecture confortable en local — le `docker-compose.yml` de dev le pose
déjà.

Ce drapeau est un opt-in **explicite**, et non une déduction depuis `NODE_ENV` :
`pino-pretty` est une dépendance de dev, absente de l'image de production, mais
rien n'oblige cette image à tourner avec `NODE_ENV=production`. La stack e2e la
démarre justement en `development` pour que les cookies fonctionnent en HTTP —
et le serveur plantait alors au démarrage sur « unable to determine transport
target ».

Les sondes (`/health`, `/metrics`) ne sont pas journalisées : à 10 s
d'intervalle par pod, elles noieraient le trafic réel.

**Arrêt en douceur.** Sur `SIGTERM`, le serveur bascule d'abord `/health` en
503, attend `DELAI_DRAINAGE_MS` (5 s par défaut) que Kubernetes cesse de
router, puis ferme le serveur et le pool PostgreSQL. Sans cette séquence,
chaque redéploiement couperait des requêtes en vol — Kubernetes envoie le
signal et retire le pod des Endpoints en parallèle, pas l'un après l'autre.

| Variable             | Défaut                        | Rôle                               |
| -------------------- | ----------------------------- | ---------------------------------- |
| `LOG_LEVEL`          | `info` en prod, `debug` sinon | Verbosité                          |
| `LOG_PRETTY`         | `false`                       | Sortie colorée via pino-pretty     |
| `DELAI_DRAINAGE_MS`  | `5000`                        | Attente avant fermeture du serveur |
| `DELAI_ARRET_MAX_MS` | `25000`                       | Au-delà, sortie forcée             |

## CI (GitHub Actions)

À chaque push et sur chaque pull request, GitHub exécute automatiquement
(`.github/workflows/ci.yml`) :

1. vérification des types (`tsc --noEmit`), lint (ESLint) et formatage (Prettier) ;
2. application des migrations sur une base PostgreSQL vierge ;
3. contrôle que `schema.prisma` et les migrations sont synchronisés
   (échoue si tu as modifié le schéma sans créer la migration) ;
4. suite de tests complète (Vitest + Supertest) ;
5. build de l'image Docker de production.

Résultat visible sur chaque commit (✅/❌) et dans l'onglet **Actions** du repo.
Conseil : dans les réglages GitHub du repo, protégez la branche `main` en
exigeant que le CI soit vert avant de merger.

## Tests (Vitest + Supertest)

- **Unitaires** (`tests/unitaires/`) : les fonctions pures, isolées (hash, jetons, DTOs).
- **API** (`tests/api/`) : Supertest appelle la vraie app par HTTP — routes,
  validators, controllers, services, repositories et Postgres traversés d'un coup.
- Les tests tournent sur une base **dédiée** (`assistant_financier_test`), créée,
  migrée et seedée automatiquement au premier lancement : ta base de dev n'est jamais touchée.
- `docker compose exec server npm test` — le CI les rejoue à chaque push.
- Convention : un fichier `*.test.ts` par module testé ; les emails sont simulés
  (mock) et les jetons extraits des emails capturés, comme un vrai utilisateur.

## Qualité de code (ESLint, Prettier, hooks git)

- **Lint** : `docker compose exec server npm run lint` — attrape notamment les
  `await` oubliés sur les requêtes Prisma (règles typées).
- **Formatage** : `docker compose exec server npm run format` (ou laisse le
  hook pré-commit s'en charger).
- **Hooks pré-commit (Husky + lint-staged)** : à chaque `git commit`, les
  fichiers modifiés sont automatiquement lintés et formatés. ⚠️ Les hooks
  s'exécutent sur **ta machine**, pas dans Docker : fais une fois
  `npm install` en local pour les activer (bonus : ça donne aussi
  l'autocomplétion à VS Code).
- Le CI vérifie lint + formatage de toute façon — les hooks servent juste à
  te le dire _avant_ de pousser.

## Les endpoints d'authentification

Tous préfixés par `/api/v1/auth` :

| Méthode + URL                      | Rôle                                                  |
| ---------------------------------- | ----------------------------------------------------- |
| `POST /register`                   | Inscription (crée le compte)                          |
| `POST /login`                      | Connexion                                             |
| `POST /refresh`                    | Renouvelle l'access token (rotation du refresh token) |
| `POST /logout`                     | Déconnexion (révoque la session)                      |
| `POST /verifier-email`             | Vérifie l'adresse via le jeton reçu par email         |
| `POST /mot-de-passe-oublie`        | Demande un email de réinitialisation                  |
| `POST /reinitialiser-mot-de-passe` | Choisit un nouveau mot de passe via le jeton          |
| `GET /moi`                         | Profil de l'utilisateur connecté (authentifié)        |
| `POST /renvoyer-verification`      | Renvoie l'email de vérification (authentifié)         |

## Les clients de l'API (web & mobile)

### Front React (repo `client`)

À créer et dockeriser (son Dockerfile vivra dans le repo `client`, et le compose
de ce repo l'orchestre — section « Avec le front » ci-dessus). Dans le code React,
toujours appeler l'API via la variable injectée par le compose :

```ts
const API = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
fetch(`${API}/health`, { credentials: "include" });
```

### App mobile

Rien à lancer de plus côté back : l'API est déjà exposée sur le port 5000 de la
machine, accessible depuis le réseau local. À savoir :

- **CORS : aucune configuration nécessaire pour une app mobile native.** Le CORS
  est une règle imposée par les navigateurs ; seule une éventuelle version
  **Web** devra être ajoutée dans `CLIENT_URLS` (`.env`, origines séparées par
  des virgules).
- **Authentification** : une app mobile envoie le token dans l'en-tête
  `Authorization: Bearer <token>` ; les apps web reçoivent un cookie httpOnly
  `accessToken` posé par le serveur au login — le middleware accepte les deux canaux.

## Notes

- **Avant ta première contribution, lis `CLAUDE.md`** (à la racine) : l'architecture
  en couches, les contrats de l'auth et les pièges connus y sont condensés.
  Bonus : Claude Code le charge automatiquement — ton assistant respectera les
  mêmes règles que toi.
- **`.env` n'est jamais commité.** Si tu ajoutes une variable, ajoute-la aussi
  (avec une valeur bidon) dans `.env.example`.
- **Autocomplétion dans VS Code :** comme `node_modules` n'existe pas sur ta machine,
  l'IDE ne connaît pas les types. Deux options : faire un `npm install` local
  (uniquement pour l'IDE, l'exécution reste dans Docker), ou utiliser l'extension
  **Dev Containers** et t'attacher au conteneur `server`.
- Le client Prisma est généré dans `generated/` (ignoré par git) ; il est régénéré
  automatiquement à chaque démarrage du conteneur.
- Les tokens JWT sont signés en **RS256** : la paire de clés vit dans le `.env`
  (`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`, PEM aplati avec des `\n`) — chaque dev
  génère la sienne avec `scripts/generer-cles.js` (une méthode openssl+awk
  équivalente est documentée dans le script). Ne committe jamais un fichier
  `.key` (le `.gitignore` les bloque déjà).
