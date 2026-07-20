# Sprint 1 — Backend restant (Comptes, Transactions, Catégorisation, Dashboard)

## Contexte

Sprint 1 (lundi 20 → jeudi 23 juillet 2026) de l'Assistant Financier Intelligent. L'infra, le CI/CD et l'authentification (US1) sont déjà livrés, ainsi que le schéma Prisma complet (`prisma/schema.prisma`) et le seed des catégories système (`prisma/seed.ts`). Ce spec couvre le reste du périmètre backend du Sprint Backlog :

- US2 — saisie manuelle des transactions
- US3 — catégorisation automatique des dépenses
- US4 — tableau de bord (partie backend : données agrégées, pas le rendu graphique)

Hors scope (Sprint 2+, priorité Moyenne/Basse dans le Product Backlog) : budgets & alertes (US5), chatbot (US6), recommandations IA (US7), export (US8). Un modèle Prisma existe déjà pour certains (`Budget`, `ObjectifEpargne`, `TransactionRecurrente`) mais aucune API n'est construite dessus dans ce sprint.

## Objectif

Exposer une API permettant à un utilisateur authentifié de :

1. gérer ses comptes financiers,
2. saisir des transactions (dépenses/revenus) qui se voient assigner automatiquement une catégorie si l'utilisateur n'en précise pas une,
3. consulter un tableau de bord (soldes + répartition des dépenses par catégorie).

## Conventions à respecter

Le projet suit déjà un pattern strict (voir `src/{controllers,services,repositories,dtos,validators}/auth.*`) : chaque nouveau domaine (comptes, transactions, dashboard) doit s'y conformer.

- **Route** : déclare le chemin + validators + middleware, appelle le controller. Montée dans `src/routes/index.ts`.
- **Validator** : `express-validator`, un fichier par domaine dans `src/validators/`.
- **Controller** : traduit HTTP ⇄ métier uniquement (lit `req`, appelle le service, choisit le code de statut). Aucune logique métier.
- **Service** : toute la logique métier, lève les exceptions typées de `src/exceptions/http.exception.ts` (`NonTrouveException`, `AccesRefuseException`, `RequeteInvalideException`, `ConflitException`).
- **Repository** : fonctions fines qui encapsulent Prisma, pas de logique.
- **DTO** : types + fonctions de mapping Prisma → réponse publique.

Toutes les routes de ces 4 modules passent par `middlewareJwt` existant (`src/middlewares/jwt.middleware.ts`) — aucune route publique. Ce middleware pose `req.utilisateur.id`, revérifié en base à chaque requête (statut du compte à jour en temps réel).

## Modules & endpoints

### 1. Comptes (`/comptes`)

- `POST /comptes` — crée un compte (`nom`, `type`, `soldeInitial`, `devise?`, `institution?`, `couleur?`). `personneId` = utilisateur connecté.
- `GET /comptes` — liste les comptes de l'utilisateur, chacun avec un `solde` calculé (`soldeInitial + somme signée des transactions non archivées`). Le solde n'est jamais stocké (cohérent avec le commentaire du schéma Prisma).

Pas de PATCH/DELETE dans ce sprint (pas d'US associée) — à ajouter plus tard si besoin (ex. archivage).

### 2. Catégories (`/categories`) — lecture seule

- `GET /categories?type=DEPENSE|REVENU` (query param optionnel) — renvoie les catégories système (`personneId: null`) déjà seedées par `prisma/seed.ts`. Pas de création de catégories personnelles dans ce sprint.

### 3. Catégorisation automatique (service interne, pas de route dédiée)

- `src/constants/regles-categorisation.ts` : table statique `{ motCle: string; nomCategorie: string }[]`, mots-clés en minuscule, mappés vers les noms de `CATEGORIES_PAR_DEFAUT` (ex. `uber`, `sncf`, `essence` → `Transport` ; `carrefour`, `monoprix`, `supermarché` → `Alimentation` ; `edf`, `loyer`, `électricité` → `Logement`).
- `src/services/categorisation.service.ts` : fonction pure `deviner(libelle: string, type: TypeTransaction): Promise<string>` (retourne un `categorieId`).
  - Cherche si un des mots-clés est contenu (insensible à la casse, `includes`) dans `libelle`.
  - Premier match trouvé → résout l'id de la catégorie système correspondante (par nom + type).
  - Aucun match → fallback : catégorie système `Divers` si `type === "DEPENSE"`, `Autres revenus` si `type === "REVENU"`.
- Appelée par `transactions.service.ts` **uniquement** si le DTO de création ne fournit pas de `categorieId`. Si l'utilisateur fournit un `categorieId`, il est utilisé tel quel (après vérification qu'il s'agit bien d'une catégorie système existante du bon `type`).

### 4. Transactions (`/transactions`)

- `POST /transactions` — `compteId`, `montant` (positif), `type` (`DEPENSE` | `REVENU` — `TRANSFERT` hors scope ce sprint), `libelle`, `note?`, `dateOperation`, `categorieId?`. Vérifie que `compteId` appartient à l'utilisateur connecté avant création.
- `GET /transactions?compteId&categorieId&du&au&page&limite` — liste paginée (offset), filtrée. Ne renvoie que les transactions des comptes appartenant à l'utilisateur connecté.
- `GET /transactions/:id`
- `PATCH /transactions/:id` — modification partielle (montant, libelle, note, dateOperation, categorieId, pointee). Pas de changement de `compteId` ni de `type` dans ce sprint (éviterait de la complexité de recalcul/migration entre comptes).
- `DELETE /transactions/:id`

Toutes ces opérations vérifient l'ownership (voir section Sécurité).

### 5. Dashboard (`/dashboard`)

- `GET /dashboard/soldes` — solde par compte (réutilise la même logique de calcul que `GET /comptes`) + un total global (somme convertie en devise unique **non gérée** ce sprint : on additionne tel quel en supposant une devise unique par utilisateur pour l'instant — pas de conversion multi-devises).
- `GET /dashboard/depenses-par-categorie?du&au` — `du`/`au` optionnels (format `YYYY-MM-DD`), défaut = mois calendaire en cours. Regroupe les transactions `DEPENSE` de l'utilisateur par `categorieId` sur la période, renvoie `{ categorieId, nomCategorie, montantTotal }[]`.

## Sécurité & ownership (IDOR)

Pas de RBAC dans ce projet (mono-rôle) : chaque utilisateur ne doit voir/modifier que ses propres données.

- `CompteFinancier` : les repositories filtrent systématiquement par `personneId`.
- `Transaction` n'a pas de `personneId` direct (rattachée via `compteId`) → le service vérifie `compte.personneId === utilisateur.id` avant toute lecture/écriture/suppression.
- Un `categorieId` fourni manuellement doit référencer une catégorie système existante (`personneId: null`) du bon `type` ; sinon `RequeteInvalideException`.
- Ressource introuvable OU appartenant à un autre utilisateur → **même** `NonTrouveException` (404) dans les deux cas, pour ne pas révéler l'existence de ressources d'autrui (cohérent avec le pattern anti-énumération déjà utilisé dans le module auth).

Aucun changement requis sur le système de tokens/JWT existant — il est réutilisé tel quel par les nouvelles routes.

## Tests

Même structure que l'existant (`tests/unitaires/`, `tests/api/`) :

- `tests/unitaires/categorisation.service.test.ts` — `deviner()` : un cas par mot-clé représentatif + cas de fallback (aucun match) pour DEPENSE et REVENU.
- `tests/api/comptes.api.test.ts` — création, liste, calcul de solde, rejet sans token (401).
- `tests/api/transactions.api.test.ts` — CRUD complet, catégorisation automatique à la création (avec et sans `categorieId` fourni), filtres/pagination de la liste, 404 sur un compte/transaction d'un autre utilisateur, 401 sans token.
- `tests/api/dashboard.api.test.ts` — soldes agrégés, dépenses par catégorie sur la période par défaut et sur une période custom via `du`/`au`.

## Ordre d'implémentation

1. **Comptes** — prérequis de tout le reste (une transaction a besoin d'un compte).
2. **Catégories** (lecture seule) — rapide, prérequis de la catégorisation.
3. **Catégorisation automatique** — service pur, testable isolément avant d'être branché.
4. **Transactions** — CRUD complet, utilise 1-3.
5. **Dashboard** — lit les transactions existantes, dernier maillon de la chaîne.

## Hors scope (explicitement exclu de ce sprint)

- Virements entre comptes (`TypeTransaction.TRANSFERT`, `transactionLieeId`).
- Création de catégories personnelles par l'utilisateur.
- Budgets & alertes de dépassement (US5).
- Chatbot conversationnel (US6).
- Recommandations générées par IA (US7) — y compris toute intégration d'API IA externe (ex. Grok), jugée pertinente pour le chatbot (US6) dans un sprint futur, pas pour la catégorisation.
- Export PDF/CSV (US8).
- Conversion multi-devises dans le total du dashboard.
- Import automatique de transactions (relevés bancaires, API bancaires) — l'US2 mentionne "saisir ou importer", ce sprint ne couvre que la saisie manuelle.
