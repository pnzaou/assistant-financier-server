# Sprint 1 Backend (Comptes, Transactions, Catégorisation, Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining backend scope of Sprint 1 — comptes financiers, saisie de transactions avec catégorisation automatique, et tableau de bord — on top of the existing auth + Prisma schema.

**Architecture:** Five vertical slices (comptes, catégories, catégorisation, transactions, dashboard), each following the existing layered pattern (route → validator → controller → service → repository → DTO) already used by the auth module. No schema changes: `prisma/schema.prisma` already models every entity needed.

**Tech Stack:** Express 5, Prisma 7 (`@prisma/adapter-pg`), TypeScript (ESM, `.js` import extensions), express-validator, Vitest + Supertest, PostgreSQL.

## Global Constraints

- Every route in these 4 modules is authenticated — mount `middlewareJwt` (`src/middlewares/jwt.middleware.ts`) on the router; no public endpoints.
- No RBAC: every read/write must verify the resource belongs to `req.utilisateur.id`. A resource that doesn't exist and a resource owned by someone else return the **same** `NonTrouveException` (404) — never leak existence of another user's data.
- Services throw typed exceptions from `src/exceptions/http.exception.ts` (`NonTrouveException`, `RequeteInvalideException`, etc.) — never touch `res` directly. Controllers only translate HTTP ⇄ service calls.
- DTOs map Prisma models to public response shapes; `Decimal` fields (`montant`, `soldeInitial`) are converted with `.toNumber()` before being returned as JSON.
- Repositories are thin Prisma wrappers — no business logic. Business logic and exceptions live in services.
- All imports use the `.js` extension (ESM), matching every existing file.
- `TypeTransaction.TRANSFERT` is out of scope this sprint — only `DEPENSE` / `REVENU` are accepted by validators.
- No currency conversion: dashboard totals are summed as-is.
- Test DB is reset between tests with `await prisma.personne.deleteMany({})` in `beforeEach` (cascades to comptes/transactions), exactly as in `tests/api/auth.api.test.ts`.

---

## Task 1: Comptes financiers

**Files:**

- Create: `src/dtos/compte.dto.ts`
- Create: `src/repositories/compte.repository.ts`
- Create: `src/services/solde.service.ts`
- Create: `src/services/compte.service.ts`
- Create: `src/validators/compte.validator.ts`
- Create: `src/controllers/compte.controller.ts`
- Create: `src/routes/compte.routes.ts`
- Modify: `src/routes/index.ts`
- Test: `tests/api/comptes.api.test.ts`

**Interfaces:**

- Consumes: `middlewareJwt` (`src/middlewares/jwt.middleware.ts`, sets `req.utilisateur.id`), `prisma` (`src/config/prisma.ts`), exception classes (`src/exceptions/http.exception.ts`).
- Produces (used by later tasks):
  - `compteRepository.trouverParId(id: string): Promise<CompteFinancier | null>` (Task 4, 5)
  - `compteRepository.listerParPersonne(personneId: string): Promise<CompteFinancier[]>` (Task 4, 5)
  - `compteService.trouverCompteDeLaPersonne(compteId: string, personneId: string): Promise<CompteFinancier>` — throws `NonTrouveException` if not owned (Task 4)
  - `calculerSolde(compte: { id: string; soldeInitial: Prisma.Decimal }): Promise<number>` from `src/services/solde.service.ts` (Task 5)

- [ ] **Step 1: Write the failing API test**

Create `tests/api/comptes.api.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/comptes.api.test.ts`
Expected: FAIL — `/api/v1/comptes` doesn't exist yet (404 from the app's catch-all instead of the expected statuses).

- [ ] **Step 3: Write the DTO**

Create `src/dtos/compte.dto.ts`:

```ts
// Les formes des données qui ENTRENT et SORTENT de l'API des comptes financiers.
// Le solde n'est jamais stocké : il est toujours recalculé (voir solde.service.ts).

export type TypeCompteDto =
  "COURANT" | "EPARGNE" | "CARTE_CREDIT" | "ESPECES" | "INVESTISSEMENT" | "AUTRE";

export interface CreerCompteDto {
  nom: string;
  type?: TypeCompteDto;
  soldeInitial?: number;
  devise?: string;
  institution?: string;
  couleur?: string;
}

export interface CompteAvecSoldeDto {
  id: string;
  nom: string;
  type: TypeCompteDto;
  soldeInitial: number;
  solde: number;
  devise: string;
  institution: string | null;
  couleur: string | null;
}
```

- [ ] **Step 4: Write the repository**

Create `src/repositories/compte.repository.ts`:

```ts
import { prisma } from "../config/prisma.js";
import type { CreerCompteDto } from "../dtos/compte.dto.js";

export function creer(personneId: string, donnees: CreerCompteDto) {
  return prisma.compteFinancier.create({
    data: {
      personneId,
      nom: donnees.nom,
      type: donnees.type,
      soldeInitial: donnees.soldeInitial,
      devise: donnees.devise,
      institution: donnees.institution,
      couleur: donnees.couleur,
    },
  });
}

export function listerParPersonne(personneId: string) {
  return prisma.compteFinancier.findMany({
    where: { personneId, archiveLe: null },
    orderBy: { createdAt: "asc" },
  });
}

export function trouverParId(id: string) {
  return prisma.compteFinancier.findUnique({ where: { id } });
}
```

- [ ] **Step 5: Write the solde service**

Create `src/services/solde.service.ts`:

```ts
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";

// Le solde n'est jamais stocké : soldeInitial + somme signée des transactions
// (DEPENSE compte négativement, REVENU positivement). TRANSFERT est hors
// scope ce sprint : aucune transaction de ce type ne peut exister via l'API.
export async function calculerSolde(compte: {
  id: string;
  soldeInitial: Prisma.Decimal;
}): Promise<number> {
  const [depenses, revenus] = await Promise.all([
    prisma.transaction.aggregate({
      where: { compteId: compte.id, type: "DEPENSE" },
      _sum: { montant: true },
    }),
    prisma.transaction.aggregate({
      where: { compteId: compte.id, type: "REVENU" },
      _sum: { montant: true },
    }),
  ]);
  const totalDepenses = depenses._sum.montant?.toNumber() ?? 0;
  const totalRevenus = revenus._sum.montant?.toNumber() ?? 0;
  return compte.soldeInitial.toNumber() + totalRevenus - totalDepenses;
}
```

- [ ] **Step 6: Write the compte service**

Create `src/services/compte.service.ts`:

```ts
import type { CompteFinancier } from "../../generated/prisma/client.js";
import type { CompteAvecSoldeDto, CreerCompteDto } from "../dtos/compte.dto.js";
import { NonTrouveException } from "../exceptions/http.exception.js";
import * as compteRepository from "../repositories/compte.repository.js";
import { calculerSolde } from "./solde.service.js";

function versDto(compte: CompteFinancier, solde: number): CompteAvecSoldeDto {
  return {
    id: compte.id,
    nom: compte.nom,
    type: compte.type,
    soldeInitial: compte.soldeInitial.toNumber(),
    solde,
    devise: compte.devise,
    institution: compte.institution,
    couleur: compte.couleur,
  };
}

export async function creerCompte(
  personneId: string,
  dto: CreerCompteDto,
): Promise<CompteAvecSoldeDto> {
  const compte = await compteRepository.creer(personneId, dto);
  return versDto(compte, await calculerSolde(compte));
}

export async function listerComptes(personneId: string): Promise<CompteAvecSoldeDto[]> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  return Promise.all(comptes.map(async (compte) => versDto(compte, await calculerSolde(compte))));
}

// Utilisé par les modules Transactions et Dashboard pour vérifier qu'un
// compte appartient bien à l'utilisateur connecté avant d'agir dessus.
export async function trouverCompteDeLaPersonne(
  compteId: string,
  personneId: string,
): Promise<CompteFinancier> {
  const compte = await compteRepository.trouverParId(compteId);
  if (!compte || compte.personneId !== personneId) {
    throw new NonTrouveException("Compte introuvable.");
  }
  return compte;
}
```

- [ ] **Step 7: Write the validator**

Create `src/validators/compte.validator.ts`:

```ts
import { body } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

const TYPES_COMPTE = ["COURANT", "EPARGNE", "CARTE_CREDIT", "ESPECES", "INVESTISSEMENT", "AUTRE"];

export const validerCreationCompte = [
  body("nom").trim().notEmpty().withMessage("Le nom du compte est requis.").isLength({ max: 100 }),
  body("type").optional().isIn(TYPES_COMPTE).withMessage("Type de compte invalide."),
  body("soldeInitial").optional().isFloat().withMessage("Le solde initial doit être un nombre."),
  body("devise")
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage("La devise doit être un code ISO 4217 à 3 lettres."),
  body("institution").optional().isString().isLength({ max: 100 }),
  body("couleur").optional().isString().isLength({ max: 20 }),
  gererValidation,
];
```

- [ ] **Step 8: Write the controller**

Create `src/controllers/compte.controller.ts`:

```ts
import type { Request, Response } from "express";
import type { CreerCompteDto } from "../dtos/compte.dto.js";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as compteService from "../services/compte.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

export async function creer(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const compte = await compteService.creerCompte(utilisateur.id, req.body as CreerCompteDto);
  res.status(201).json({ compte });
}

export async function lister(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const comptes = await compteService.listerComptes(utilisateur.id);
  res.json({ comptes });
}
```

- [ ] **Step 9: Write the route and wire it up**

Create `src/routes/compte.routes.ts`:

```ts
import { Router } from "express";
import * as compteController from "../controllers/compte.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import { validerCreationCompte } from "../validators/compte.validator.js";

const compteRouter = Router();

compteRouter.use(middlewareJwt);
compteRouter.post("/", validerCreationCompte, compteController.creer);
compteRouter.get("/", compteController.lister);

export default compteRouter;
```

Modify `src/routes/index.ts`:

```ts
import { Router } from "express";
import authRouter from "./auth.routes.js";
import compteRouter from "./compte.routes.js";

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/comptes", compteRouter);

export default appRouter;
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run tests/api/comptes.api.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 11: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 12: Commit**

```bash
git add src/dtos/compte.dto.ts src/repositories/compte.repository.ts src/services/solde.service.ts src/services/compte.service.ts src/validators/compte.validator.ts src/controllers/compte.controller.ts src/routes/compte.routes.ts src/routes/index.ts tests/api/comptes.api.test.ts
git commit -m "feat: ajoute le module Comptes financiers (creation, liste, solde calcule)"
```

---

## Task 2: Catégories (lecture seule)

**Files:**

- Create: `src/dtos/categorie.dto.ts`
- Create: `src/repositories/categorie.repository.ts`
- Create: `src/services/categorie.service.ts`
- Create: `src/controllers/categorie.controller.ts`
- Create: `src/routes/categorie.routes.ts`
- Modify: `src/routes/index.ts`
- Test: `tests/api/categories.api.test.ts`

**Interfaces:**

- Consumes: `middlewareJwt`, `prisma`.
- Produces (used by later tasks):
  - `categorieRepository.trouverSystemeParNomEtType(nom: string, type: TypeCategorieDto): Promise<Categorie | null>` (Task 3)
  - `categorieRepository.trouverSystemeParId(id: string): Promise<Categorie | null>` (Task 4)

- [ ] **Step 1: Write the failing API test**

Create `tests/api/categories.api.test.ts`:

```ts
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
    expect(reponse.body.categories.every((c: { type: string }) => c.type === "REVENU")).toBe(true);
    expect(reponse.body.categories.some((c: { nom: string }) => c.nom === "Salaire")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/categories.api.test.ts`
Expected: FAIL — `/api/v1/categories` doesn't exist yet.

- [ ] **Step 3: Write the DTO**

Create `src/dtos/categorie.dto.ts`:

```ts
export type TypeCategorieDto = "DEPENSE" | "REVENU";

export interface CategorieDto {
  id: string;
  nom: string;
  type: TypeCategorieDto;
  icone: string | null;
  couleur: string | null;
  parentId: string | null;
}
```

- [ ] **Step 4: Write the repository**

Create `src/repositories/categorie.repository.ts`:

```ts
import { prisma } from "../config/prisma.js";
import type { TypeCategorieDto } from "../dtos/categorie.dto.js";

export function listerSysteme(type?: TypeCategorieDto) {
  return prisma.categorie.findMany({
    where: { personneId: null, ...(type ? { type } : {}) },
    orderBy: { nom: "asc" },
  });
}

export function trouverSystemeParNomEtType(nom: string, type: TypeCategorieDto) {
  return prisma.categorie.findFirst({ where: { personneId: null, nom, type } });
}

export function trouverSystemeParId(id: string) {
  return prisma.categorie.findFirst({ where: { id, personneId: null } });
}
```

- [ ] **Step 5: Write the service**

Create `src/services/categorie.service.ts`:

```ts
import type { Categorie } from "../../generated/prisma/client.js";
import type { CategorieDto, TypeCategorieDto } from "../dtos/categorie.dto.js";
import * as categorieRepository from "../repositories/categorie.repository.js";

function versDto(categorie: Categorie): CategorieDto {
  return {
    id: categorie.id,
    nom: categorie.nom,
    type: categorie.type as TypeCategorieDto,
    icone: categorie.icone,
    couleur: categorie.couleur,
    parentId: categorie.parentId,
  };
}

export async function listerCategoriesSysteme(type?: TypeCategorieDto): Promise<CategorieDto[]> {
  const categories = await categorieRepository.listerSysteme(type);
  return categories.map(versDto);
}
```

- [ ] **Step 6: Write the controller**

Create `src/controllers/categorie.controller.ts`:

```ts
import type { Request, Response } from "express";
import type { TypeCategorieDto } from "../dtos/categorie.dto.js";
import * as categorieService from "../services/categorie.service.js";

const TYPES_VALIDES: TypeCategorieDto[] = ["DEPENSE", "REVENU"];

function typeDepuisQuery(valeur: unknown): TypeCategorieDto | undefined {
  return typeof valeur === "string" && (TYPES_VALIDES as string[]).includes(valeur)
    ? (valeur as TypeCategorieDto)
    : undefined;
}

export async function lister(req: Request, res: Response): Promise<void> {
  const categories = await categorieService.listerCategoriesSysteme(
    typeDepuisQuery(req.query.type),
  );
  res.json({ categories });
}
```

- [ ] **Step 7: Write the route and wire it up**

Create `src/routes/categorie.routes.ts`:

```ts
import { Router } from "express";
import * as categorieController from "../controllers/categorie.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";

const categorieRouter = Router();

categorieRouter.use(middlewareJwt);
categorieRouter.get("/", categorieController.lister);

export default categorieRouter;
```

Modify `src/routes/index.ts` (add to the existing file from Task 1):

```ts
import { Router } from "express";
import authRouter from "./auth.routes.js";
import categorieRouter from "./categorie.routes.js";
import compteRouter from "./compte.routes.js";

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/comptes", compteRouter);
appRouter.use("/categories", categorieRouter);

export default appRouter;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/api/categories.api.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/dtos/categorie.dto.ts src/repositories/categorie.repository.ts src/services/categorie.service.ts src/controllers/categorie.controller.ts src/routes/categorie.routes.ts src/routes/index.ts tests/api/categories.api.test.ts
git commit -m "feat: ajoute la lecture des categories systeme (GET /categories)"
```

---

## Task 3: Catégorisation automatique

**Files:**

- Create: `src/constants/regles-categorisation.ts`
- Create: `src/services/categorisation.service.ts`
- Test: `tests/unitaires/categorisation.service.test.ts`

**Interfaces:**

- Consumes: `categorieRepository.trouverSystemeParNomEtType` (Task 2).
- Produces (used by Task 4): `deviner(libelle: string, type: "DEPENSE" | "REVENU"): Promise<string>` from `src/services/categorisation.service.ts` — resolves to a `categorieId`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unitaires/categorisation.service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Categorie } from "../../generated/prisma/client.js";

vi.mock("../../src/repositories/categorie.repository.js", () => ({
  trouverSystemeParNomEtType: vi.fn(),
}));

import { trouverSystemeParNomEtType } from "../../src/repositories/categorie.repository.js";
import { deviner } from "../../src/services/categorisation.service.js";

function categorieAvecId(id: string): Categorie {
  return { id } as unknown as Categorie;
}

describe("deviner", () => {
  it("reconnaît un mot-clé de dépense (insensible à la casse)", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(categorieAvecId("cat-transport"));

    const resultat = await deviner("UBER *TRIP 12H30", "DEPENSE");

    expect(resultat).toBe("cat-transport");
    expect(trouverSystemeParNomEtType).toHaveBeenCalledWith("Transport", "DEPENSE");
  });

  it("reconnaît un mot-clé de revenu", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(categorieAvecId("cat-salaire"));

    const resultat = await deviner("Virement salaire juillet", "REVENU");

    expect(resultat).toBe("cat-salaire");
    expect(trouverSystemeParNomEtType).toHaveBeenCalledWith("Salaire", "REVENU");
  });

  it("retombe sur Divers si aucun mot-clé ne correspond (dépense)", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(categorieAvecId("cat-divers"));

    const resultat = await deviner("Achat imprévu chez un commerçant inconnu", "DEPENSE");

    expect(resultat).toBe("cat-divers");
    expect(trouverSystemeParNomEtType).toHaveBeenCalledWith("Divers", "DEPENSE");
  });

  it("retombe sur Autres revenus si aucun mot-clé ne correspond (revenu)", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(
      categorieAvecId("cat-autres-revenus"),
    );

    const resultat = await deviner("Encaissement divers", "REVENU");

    expect(resultat).toBe("cat-autres-revenus");
    expect(trouverSystemeParNomEtType).toHaveBeenCalledWith("Autres revenus", "REVENU");
  });

  it("retombe sur le défaut si le mot-clé correspond à une catégorie du mauvais type", async () => {
    // "salaire" matche la règle Salaire/REVENU, mais ici la transaction est une
    // DEPENSE ("avance sur salaire") : Salaire/DEPENSE n'existe pas -> fallback Divers.
    vi.mocked(trouverSystemeParNomEtType)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(categorieAvecId("cat-divers"));

    const resultat = await deviner("Avance sur salaire", "DEPENSE");

    expect(resultat).toBe("cat-divers");
    expect(trouverSystemeParNomEtType).toHaveBeenNthCalledWith(1, "Salaire", "DEPENSE");
    expect(trouverSystemeParNomEtType).toHaveBeenNthCalledWith(2, "Divers", "DEPENSE");
  });

  it("lève une erreur si même la catégorie par défaut est introuvable (seed manquant)", async () => {
    vi.mocked(trouverSystemeParNomEtType).mockResolvedValueOnce(null);

    await expect(deviner("Dépense sans mot-clé connu", "DEPENSE")).rejects.toThrow(/Divers/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unitaires/categorisation.service.test.ts`
Expected: FAIL — `src/services/categorisation.service.ts` doesn't exist yet.

- [ ] **Step 3: Write the keyword rules**

Create `src/constants/regles-categorisation.ts`:

```ts
// Règles de catégorisation automatique (US3) : mots-clés cherchés dans le
// libellé d'une transaction (insensible à la casse), mappés vers le NOM
// d'une catégorie SYSTÈME (voir constants/categories.ts). Le premier match
// gagne : ordonner du plus spécifique au plus générique.
export interface RegleCategorisation {
  motCle: string;
  nomCategorie: string;
}

export const REGLES_CATEGORISATION: RegleCategorisation[] = [
  // Alimentation
  { motCle: "carrefour", nomCategorie: "Alimentation" },
  { motCle: "monoprix", nomCategorie: "Alimentation" },
  { motCle: "leclerc", nomCategorie: "Alimentation" },
  { motCle: "supermarché", nomCategorie: "Alimentation" },
  // Restaurants
  { motCle: "restaurant", nomCategorie: "Restaurants" },
  { motCle: "mcdonald", nomCategorie: "Restaurants" },
  { motCle: "deliveroo", nomCategorie: "Restaurants" },
  { motCle: "uber eats", nomCategorie: "Restaurants" },
  // Transport
  { motCle: "uber", nomCategorie: "Transport" },
  { motCle: "sncf", nomCategorie: "Transport" },
  { motCle: "essence", nomCategorie: "Transport" },
  { motCle: "station-service", nomCategorie: "Transport" },
  // Logement
  { motCle: "loyer", nomCategorie: "Logement" },
  { motCle: "edf", nomCategorie: "Logement" },
  { motCle: "électricité", nomCategorie: "Logement" },
  // Factures & abonnements
  { motCle: "netflix", nomCategorie: "Factures & abonnements" },
  { motCle: "spotify", nomCategorie: "Factures & abonnements" },
  { motCle: "abonnement", nomCategorie: "Factures & abonnements" },
  // Santé
  { motCle: "pharmacie", nomCategorie: "Santé" },
  { motCle: "médecin", nomCategorie: "Santé" },
  // Revenus
  { motCle: "salaire", nomCategorie: "Salaire" },
  { motCle: "freelance", nomCategorie: "Freelance" },
  { motCle: "remboursement", nomCategorie: "Remboursements" },
];
```

- [ ] **Step 4: Write the categorisation service**

Create `src/services/categorisation.service.ts`:

```ts
import { REGLES_CATEGORISATION } from "../constants/regles-categorisation.js";
import { NonTrouveException } from "../exceptions/http.exception.js";
import * as categorieRepository from "../repositories/categorie.repository.js";

type TypeTransactionCategorisable = "DEPENSE" | "REVENU";

const CATEGORIE_PAR_DEFAUT: Record<TypeTransactionCategorisable, string> = {
  DEPENSE: "Divers",
  REVENU: "Autres revenus",
};

// Cherche le premier mot-clé contenu dans le libellé (insensible à la casse),
// résout vers la catégorie système du même nom ET du bon type ; si le mot-clé
// ne correspond à aucune catégorie de ce type (ou si aucun mot-clé ne
// correspond), retombe sur "Divers" / "Autres revenus".
export async function deviner(
  libelle: string,
  type: TypeTransactionCategorisable,
): Promise<string> {
  const libelleNormalise = libelle.toLowerCase();
  const regleTrouvee = REGLES_CATEGORISATION.find((regle) =>
    libelleNormalise.includes(regle.motCle.toLowerCase()),
  );

  if (regleTrouvee) {
    const categorie = await categorieRepository.trouverSystemeParNomEtType(
      regleTrouvee.nomCategorie,
      type,
    );
    if (categorie) {
      return categorie.id;
    }
  }

  const nomParDefaut = CATEGORIE_PAR_DEFAUT[type];
  const categorieParDefaut = await categorieRepository.trouverSystemeParNomEtType(
    nomParDefaut,
    type,
  );
  if (!categorieParDefaut) {
    throw new NonTrouveException(
      `Catégorie système "${nomParDefaut}" introuvable — vérifier le seed.`,
    );
  }
  return categorieParDefaut.id;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unitaires/categorisation.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/constants/regles-categorisation.ts src/services/categorisation.service.ts tests/unitaires/categorisation.service.test.ts
git commit -m "feat: ajoute la categorisation automatique par mots-cles (US3)"
```

---

## Task 4: Transactions

**Files:**

- Create: `src/dtos/transaction.dto.ts`
- Create: `src/repositories/transaction.repository.ts`
- Create: `src/services/transaction.service.ts`
- Create: `src/validators/transaction.validator.ts`
- Create: `src/controllers/transaction.controller.ts`
- Create: `src/routes/transaction.routes.ts`
- Modify: `src/routes/index.ts`
- Test: `tests/api/transactions.api.test.ts`

**Interfaces:**

- Consumes:
  - `compteRepository.listerParPersonne`, `compteRepository.trouverParId` (Task 1)
  - `compteService.trouverCompteDeLaPersonne` (Task 1)
  - `categorieRepository.trouverSystemeParId` (Task 2)
  - `categorisationService.deviner` (Task 3)
- Produces (used by Task 5): `transactionRepository` is queried directly by the dashboard aggregation (`prisma.transaction.groupBy`), no shared function needed beyond the Prisma model itself.

- [ ] **Step 1: Write the failing API test**

Create `tests/api/transactions.api.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/transactions.api.test.ts`
Expected: FAIL — `/api/v1/transactions` doesn't exist yet.

- [ ] **Step 3: Write the DTO**

Create `src/dtos/transaction.dto.ts`:

```ts
export type TypeTransactionDto = "DEPENSE" | "REVENU";

export interface CreerTransactionDto {
  compteId: string;
  montant: number;
  type: TypeTransactionDto;
  libelle: string;
  note?: string;
  dateOperation: string; // "AAAA-MM-JJ"
  categorieId?: string;
}

export interface ModifierTransactionDto {
  montant?: number;
  libelle?: string;
  note?: string;
  dateOperation?: string;
  categorieId?: string;
  pointee?: boolean;
}

export interface ListerTransactionsFiltresDto {
  compteId?: string;
  categorieId?: string;
  du?: string;
  au?: string;
  page: number;
  limite: number;
}

export interface TransactionDto {
  id: string;
  compteId: string;
  categorieId: string | null;
  montant: number;
  type: TypeTransactionDto;
  libelle: string;
  note: string | null;
  dateOperation: string;
  pointee: boolean;
}

export interface PageDto<T> {
  items: T[];
  page: number;
  limite: number;
  total: number;
}
```

- [ ] **Step 4: Write the repository**

Create `src/repositories/transaction.repository.ts`:

```ts
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";

interface DonneesCreationTransaction {
  compteId: string;
  categorieId: string;
  montant: number;
  type: "DEPENSE" | "REVENU";
  libelle: string;
  note?: string;
  dateOperation: Date;
}

export function creer(donnees: DonneesCreationTransaction) {
  return prisma.transaction.create({ data: donnees });
}

export function trouverParId(id: string) {
  return prisma.transaction.findUnique({ where: { id } });
}

interface FiltresListe {
  compteIds: string[];
  categorieId?: string;
  du?: Date;
  au?: Date;
  page: number;
  limite: number;
}

function clauseOu(filtres: FiltresListe): Prisma.TransactionWhereInput {
  return {
    compteId: { in: filtres.compteIds },
    ...(filtres.categorieId ? { categorieId: filtres.categorieId } : {}),
    ...(filtres.du || filtres.au
      ? {
          dateOperation: {
            ...(filtres.du ? { gte: filtres.du } : {}),
            ...(filtres.au ? { lte: filtres.au } : {}),
          },
        }
      : {}),
  };
}

export async function lister(filtres: FiltresListe) {
  const where = clauseOu(filtres);
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { dateOperation: "desc" },
      skip: (filtres.page - 1) * filtres.limite,
      take: filtres.limite,
    }),
    prisma.transaction.count({ where }),
  ]);
  return { items, total };
}

export function modifier(id: string, donnees: Prisma.TransactionUpdateInput) {
  return prisma.transaction.update({ where: { id }, data: donnees });
}

export function supprimer(id: string) {
  return prisma.transaction.delete({ where: { id } });
}
```

- [ ] **Step 5: Write the service**

Create `src/services/transaction.service.ts`:

```ts
import type { Transaction } from "../../generated/prisma/client.js";
import type {
  CreerTransactionDto,
  ListerTransactionsFiltresDto,
  ModifierTransactionDto,
  PageDto,
  TransactionDto,
} from "../dtos/transaction.dto.js";
import { NonTrouveException, RequeteInvalideException } from "../exceptions/http.exception.js";
import * as categorieRepository from "../repositories/categorie.repository.js";
import * as compteRepository from "../repositories/compte.repository.js";
import * as transactionRepository from "../repositories/transaction.repository.js";
import { deviner } from "./categorisation.service.js";
import { trouverCompteDeLaPersonne } from "./compte.service.js";

function versDto(transaction: Transaction): TransactionDto {
  return {
    id: transaction.id,
    compteId: transaction.compteId,
    categorieId: transaction.categorieId,
    montant: transaction.montant.toNumber(),
    type: transaction.type as "DEPENSE" | "REVENU",
    libelle: transaction.libelle,
    note: transaction.note,
    dateOperation: transaction.dateOperation.toISOString().slice(0, 10),
    pointee: transaction.pointee,
  };
}

// Un categorieId fourni par l'utilisateur doit être une catégorie SYSTÈME
// existante, du même type que la transaction — sinon RequeteInvalideException.
async function validerCategorie(categorieId: string, type: "DEPENSE" | "REVENU"): Promise<void> {
  const categorie = await categorieRepository.trouverSystemeParId(categorieId);
  if (!categorie || categorie.type !== type) {
    throw new RequeteInvalideException("Catégorie invalide pour ce type de transaction.");
  }
}

// Vérifie que la transaction existe ET que son compte appartient bien à
// l'utilisateur connecté — même exception (404) dans les deux cas.
async function trouverTransactionDeLaPersonne(
  id: string,
  personneId: string,
): Promise<Transaction> {
  const transaction = await transactionRepository.trouverParId(id);
  if (!transaction) {
    throw new NonTrouveException("Transaction introuvable.");
  }
  const compte = await compteRepository.trouverParId(transaction.compteId);
  if (!compte || compte.personneId !== personneId) {
    throw new NonTrouveException("Transaction introuvable.");
  }
  return transaction;
}

export async function creerTransaction(
  personneId: string,
  dto: CreerTransactionDto,
): Promise<TransactionDto> {
  await trouverCompteDeLaPersonne(dto.compteId, personneId);

  let categorieId: string;
  if (dto.categorieId) {
    await validerCategorie(dto.categorieId, dto.type);
    categorieId = dto.categorieId;
  } else {
    categorieId = await deviner(dto.libelle, dto.type);
  }

  const transaction = await transactionRepository.creer({
    compteId: dto.compteId,
    categorieId,
    montant: dto.montant,
    type: dto.type,
    libelle: dto.libelle,
    note: dto.note,
    dateOperation: new Date(dto.dateOperation),
  });
  return versDto(transaction);
}

export async function listerTransactions(
  personneId: string,
  filtres: ListerTransactionsFiltresDto,
): Promise<PageDto<TransactionDto>> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  const compteIds = comptes.map((compte) => compte.id);

  if (filtres.compteId && !compteIds.includes(filtres.compteId)) {
    throw new NonTrouveException("Compte introuvable.");
  }

  const { items, total } = await transactionRepository.lister({
    compteIds: filtres.compteId ? [filtres.compteId] : compteIds,
    categorieId: filtres.categorieId,
    du: filtres.du ? new Date(filtres.du) : undefined,
    au: filtres.au ? new Date(filtres.au) : undefined,
    page: filtres.page,
    limite: filtres.limite,
  });

  return { items: items.map(versDto), page: filtres.page, limite: filtres.limite, total };
}

export async function obtenirTransaction(id: string, personneId: string): Promise<TransactionDto> {
  const transaction = await trouverTransactionDeLaPersonne(id, personneId);
  return versDto(transaction);
}

export async function modifierTransaction(
  id: string,
  personneId: string,
  dto: ModifierTransactionDto,
): Promise<TransactionDto> {
  const transaction = await trouverTransactionDeLaPersonne(id, personneId);

  if (dto.categorieId) {
    await validerCategorie(dto.categorieId, transaction.type as "DEPENSE" | "REVENU");
  }

  const misAJour = await transactionRepository.modifier(id, {
    ...(dto.montant !== undefined ? { montant: dto.montant } : {}),
    ...(dto.libelle !== undefined ? { libelle: dto.libelle } : {}),
    ...(dto.note !== undefined ? { note: dto.note } : {}),
    ...(dto.dateOperation !== undefined ? { dateOperation: new Date(dto.dateOperation) } : {}),
    ...(dto.categorieId !== undefined ? { categorieId: dto.categorieId } : {}),
    ...(dto.pointee !== undefined ? { pointee: dto.pointee } : {}),
  });
  return versDto(misAJour);
}

export async function supprimerTransaction(id: string, personneId: string): Promise<void> {
  await trouverTransactionDeLaPersonne(id, personneId);
  await transactionRepository.supprimer(id);
}
```

- [ ] **Step 6: Write the validator**

Create `src/validators/transaction.validator.ts`:

```ts
import { body, param, query } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

const TYPES_TRANSACTION = ["DEPENSE", "REVENU"];

export const validerCreationTransaction = [
  body("compteId").isUUID().withMessage("compteId invalide."),
  body("montant").isFloat({ gt: 0 }).withMessage("Le montant doit être un nombre positif."),
  body("type").isIn(TYPES_TRANSACTION).withMessage("Type de transaction invalide."),
  body("libelle").trim().notEmpty().withMessage("Le libellé est requis.").isLength({ max: 200 }),
  body("note").optional().isString().isLength({ max: 500 }),
  body("dateOperation").isISO8601().withMessage("Date d'opération invalide (format AAAA-MM-JJ)."),
  body("categorieId").optional().isUUID().withMessage("categorieId invalide."),
  gererValidation,
];

export const validerModificationTransaction = [
  param("id").isUUID().withMessage("Identifiant de transaction invalide."),
  body("montant")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Le montant doit être un nombre positif."),
  body("libelle").optional().trim().notEmpty().isLength({ max: 200 }),
  body("note").optional().isString().isLength({ max: 500 }),
  body("dateOperation").optional().isISO8601().withMessage("Date d'opération invalide."),
  body("categorieId").optional().isUUID().withMessage("categorieId invalide."),
  body("pointee").optional().isBoolean(),
  gererValidation,
];

export const validerIdTransaction = [
  param("id").isUUID().withMessage("Identifiant de transaction invalide."),
  gererValidation,
];

export const validerListeTransactions = [
  query("compteId").optional().isUUID().withMessage("compteId invalide."),
  query("categorieId").optional().isUUID().withMessage("categorieId invalide."),
  query("du").optional().isISO8601().withMessage("Date 'du' invalide."),
  query("au").optional().isISO8601().withMessage("Date 'au' invalide."),
  query("page").optional().isInt({ min: 1 }).withMessage("page doit être un entier >= 1."),
  query("limite")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limite doit être entre 1 et 100."),
  gererValidation,
];
```

- [ ] **Step 7: Write the controller**

Create `src/controllers/transaction.controller.ts`:

```ts
import type { Request, Response } from "express";
import type {
  CreerTransactionDto,
  ListerTransactionsFiltresDto,
  ModifierTransactionDto,
} from "../dtos/transaction.dto.js";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as transactionService from "../services/transaction.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

export async function creer(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const transaction = await transactionService.creerTransaction(
    utilisateur.id,
    req.body as CreerTransactionDto,
  );
  res.status(201).json({ transaction });
}

export async function lister(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const filtres: ListerTransactionsFiltresDto = {
    compteId: req.query.compteId as string | undefined,
    categorieId: req.query.categorieId as string | undefined,
    du: req.query.du as string | undefined,
    au: req.query.au as string | undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    limite: req.query.limite ? Number(req.query.limite) : 20,
  };
  const resultat = await transactionService.listerTransactions(utilisateur.id, filtres);
  res.json(resultat);
}

export async function obtenir(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const transaction = await transactionService.obtenirTransaction(req.params.id, utilisateur.id);
  res.json({ transaction });
}

export async function modifier(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const transaction = await transactionService.modifierTransaction(
    req.params.id,
    utilisateur.id,
    req.body as ModifierTransactionDto,
  );
  res.json({ transaction });
}

export async function supprimer(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  await transactionService.supprimerTransaction(req.params.id, utilisateur.id);
  res.status(204).send();
}
```

- [ ] **Step 8: Write the route and wire it up**

Create `src/routes/transaction.routes.ts`:

```ts
import { Router } from "express";
import * as transactionController from "../controllers/transaction.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import {
  validerCreationTransaction,
  validerIdTransaction,
  validerListeTransactions,
  validerModificationTransaction,
} from "../validators/transaction.validator.js";

const transactionRouter = Router();

transactionRouter.use(middlewareJwt);
transactionRouter.post("/", validerCreationTransaction, transactionController.creer);
transactionRouter.get("/", validerListeTransactions, transactionController.lister);
transactionRouter.get("/:id", validerIdTransaction, transactionController.obtenir);
transactionRouter.patch("/:id", validerModificationTransaction, transactionController.modifier);
transactionRouter.delete("/:id", validerIdTransaction, transactionController.supprimer);

export default transactionRouter;
```

Modify `src/routes/index.ts`:

```ts
import { Router } from "express";
import authRouter from "./auth.routes.js";
import categorieRouter from "./categorie.routes.js";
import compteRouter from "./compte.routes.js";
import transactionRouter from "./transaction.routes.js";

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/comptes", compteRouter);
appRouter.use("/categories", categorieRouter);
appRouter.use("/transactions", transactionRouter);

export default appRouter;
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run tests/api/transactions.api.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 10: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 11: Commit**

```bash
git add src/dtos/transaction.dto.ts src/repositories/transaction.repository.ts src/services/transaction.service.ts src/validators/transaction.validator.ts src/controllers/transaction.controller.ts src/routes/transaction.routes.ts src/routes/index.ts tests/api/transactions.api.test.ts
git commit -m "feat: ajoute le CRUD Transactions avec categorisation automatique (US2)"
```

---

## Task 5: Dashboard

**Files:**

- Create: `src/services/dashboard.service.ts`
- Create: `src/validators/dashboard.validator.ts`
- Create: `src/controllers/dashboard.controller.ts`
- Create: `src/routes/dashboard.routes.ts`
- Modify: `src/routes/index.ts`
- Test: `tests/api/dashboard.api.test.ts`

**Interfaces:**

- Consumes: `compteRepository.listerParPersonne` (Task 1), `calculerSolde` (Task 1), `prisma` directly for the categorie aggregation (Task 2's `Categorie` model, Task 4's `Transaction` rows).

- [ ] **Step 1: Write the failing API test**

Create `tests/api/dashboard.api.test.ts`:

```ts
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

beforeEach(async () => {
  await prisma.personne.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/dashboard/soldes", () => {
  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/dashboard/soldes");
    expect(reponse.status).toBe(401);
  });

  it("renvoie le solde de chaque compte et le total global", async () => {
    const { token } = await creerUtilisateur("dashboard@test.local");
    const compteId = await creerCompte(token, 100);
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 40,
        type: "DEPENSE",
        libelle: "Courses",
        dateOperation: "2026-07-20",
      });

    const reponse = await request(app)
      .get("/api/v1/dashboard/soldes")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.comptes).toHaveLength(1);
    expect(reponse.body.comptes[0].solde).toBe(60);
    expect(reponse.body.totalGlobal).toBe(60);
  });
});

describe("GET /api/v1/dashboard/depenses-par-categorie", () => {
  it("regroupe les dépenses du mois courant par catégorie", async () => {
    const { token } = await creerUtilisateur("depenses@test.local");
    const compteId = await creerCompte(token, 0);
    const aujourdhui = new Date().toISOString().slice(0, 10);

    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ compteId, montant: 30, type: "DEPENSE", libelle: "Uber", dateOperation: aujourdhui });
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 20,
        type: "DEPENSE",
        libelle: "Uber encore",
        dateOperation: aujourdhui,
      });
    // Un revenu ne doit jamais apparaître dans les dépenses.
    await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        compteId,
        montant: 500,
        type: "REVENU",
        libelle: "Salaire",
        dateOperation: aujourdhui,
      });

    const reponse = await request(app)
      .get("/api/v1/dashboard/depenses-par-categorie")
      .set("Authorization", `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    const transport = reponse.body.depenses.find(
      (d: { nomCategorie: string }) => d.nomCategorie === "Transport",
    );
    expect(transport).toBeTruthy();
    expect(transport.montantTotal).toBe(50);
  });

  it("refuse sans token (401)", async () => {
    const reponse = await request(app).get("/api/v1/dashboard/depenses-par-categorie");
    expect(reponse.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/dashboard.api.test.ts`
Expected: FAIL — `/api/v1/dashboard/*` doesn't exist yet.

- [ ] **Step 3: Write the service**

Create `src/services/dashboard.service.ts`:

```ts
import { prisma } from "../config/prisma.js";
import * as compteRepository from "../repositories/compte.repository.js";
import { calculerSolde } from "./solde.service.js";

export interface SoldeCompteDto {
  compteId: string;
  nom: string;
  solde: number;
  devise: string;
}

export interface SoldesDto {
  comptes: SoldeCompteDto[];
  totalGlobal: number;
}

export interface DepenseParCategorieDto {
  categorieId: string;
  nomCategorie: string;
  montantTotal: number;
}

export async function obtenirSoldes(personneId: string): Promise<SoldesDto> {
  const comptes = await compteRepository.listerParPersonne(personneId);
  const soldes = await Promise.all(
    comptes.map(async (compte) => ({
      compteId: compte.id,
      nom: compte.nom,
      solde: await calculerSolde(compte),
      devise: compte.devise,
    })),
  );
  return {
    comptes: soldes,
    totalGlobal: soldes.reduce((total, compte) => total + compte.solde, 0),
  };
}

function premierEtDernierJourDuMois(reference: Date): { debut: Date; fin: Date } {
  const debut = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0));
  return { debut, fin };
}

export async function obtenirDepensesParCategorie(
  personneId: string,
  du?: string,
  au?: string,
): Promise<DepenseParCategorieDto[]> {
  const { debut, fin } = premierEtDernierJourDuMois(new Date());
  const periode = { debut: du ? new Date(du) : debut, fin: au ? new Date(au) : fin };

  const comptes = await compteRepository.listerParPersonne(personneId);
  const compteIds = comptes.map((compte) => compte.id);

  const regroupement = await prisma.transaction.groupBy({
    by: ["categorieId"],
    where: {
      compteId: { in: compteIds },
      type: "DEPENSE",
      categorieId: { not: null },
      dateOperation: { gte: periode.debut, lte: periode.fin },
    },
    _sum: { montant: true },
  });

  const idsCategories = regroupement
    .map((ligne) => ligne.categorieId)
    .filter((id): id is string => id !== null);
  const categories = await prisma.categorie.findMany({ where: { id: { in: idsCategories } } });
  const nomParId = new Map(categories.map((categorie) => [categorie.id, categorie.nom]));

  return regroupement
    .filter((ligne): ligne is typeof ligne & { categorieId: string } => ligne.categorieId !== null)
    .map((ligne) => ({
      categorieId: ligne.categorieId,
      nomCategorie: nomParId.get(ligne.categorieId) ?? "Inconnue",
      montantTotal: ligne._sum.montant?.toNumber() ?? 0,
    }));
}
```

- [ ] **Step 4: Write the validator**

Create `src/validators/dashboard.validator.ts`:

```ts
import { query } from "express-validator";
import { gererValidation } from "../middlewares/validation.middleware.js";

export const validerPeriode = [
  query("du").optional().isISO8601().withMessage("Date 'du' invalide."),
  query("au").optional().isISO8601().withMessage("Date 'au' invalide."),
  gererValidation,
];
```

- [ ] **Step 5: Write the controller**

Create `src/controllers/dashboard.controller.ts`:

```ts
import type { Request, Response } from "express";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as dashboardService from "../services/dashboard.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

export async function soldes(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const resultat = await dashboardService.obtenirSoldes(utilisateur.id);
  res.json(resultat);
}

export async function depensesParCategorie(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const resultat = await dashboardService.obtenirDepensesParCategorie(
    utilisateur.id,
    req.query.du as string | undefined,
    req.query.au as string | undefined,
  );
  res.json({ depenses: resultat });
}
```

- [ ] **Step 6: Write the route and wire it up**

Create `src/routes/dashboard.routes.ts`:

```ts
import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller.js";
import { middlewareJwt } from "../middlewares/jwt.middleware.js";
import { validerPeriode } from "../validators/dashboard.validator.js";

const dashboardRouter = Router();

dashboardRouter.use(middlewareJwt);
dashboardRouter.get("/soldes", dashboardController.soldes);
dashboardRouter.get(
  "/depenses-par-categorie",
  validerPeriode,
  dashboardController.depensesParCategorie,
);

export default dashboardRouter;
```

Modify `src/routes/index.ts`:

```ts
import { Router } from "express";
import authRouter from "./auth.routes.js";
import categorieRouter from "./categorie.routes.js";
import compteRouter from "./compte.routes.js";
import dashboardRouter from "./dashboard.routes.js";
import transactionRouter from "./transaction.routes.js";

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/comptes", compteRouter);
appRouter.use("/categories", categorieRouter);
appRouter.use("/transactions", transactionRouter);
appRouter.use("/dashboard", dashboardRouter);

export default appRouter;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/api/dashboard.api.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file (auth, comptes, categories, categorisation, transactions, dashboard)

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/services/dashboard.service.ts src/validators/dashboard.validator.ts src/controllers/dashboard.controller.ts src/routes/dashboard.routes.ts src/routes/index.ts tests/api/dashboard.api.test.ts
git commit -m "feat: ajoute le tableau de bord (soldes + depenses par categorie) (US4)"
```
