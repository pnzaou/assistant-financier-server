# Contribuer — Assistant Financier (serveur)

Ce document décrit la stratégie de branching Git de l'équipe et les règles que la
CI/CD applique automatiquement. Le repo client suit exactement les mêmes règles.

## Stratégie de branching : GitFlow allégé

Deux branches permanentes, trois familles de branches temporaires.

```
main      ─────●──────────────────●───────────────●────►   production
               ▲                  ▲               ▲
               │ release/1.1.0    │ hotfix/1.1.1  │ release/1.2.0
               │                  │               │
develop   ──●──┴──●────●──────●───┴───●─────●─────┴───►    intégration
            ▲     ▲    ▲      ▲       ▲     ▲
            │     │    │      │       │     │
         feat/  fix/ feat/  feat/   fix/  feat/
```

| Branche         | Rôle                                                                                     | Déployée sur | Qui peut y pousser                 |
| --------------- | ---------------------------------------------------------------------------------------- | ------------ | ---------------------------------- |
| `main`          | État de production. Toujours déployable.                                                 | prod         | Personne en direct — PR uniquement |
| `develop`       | Intégration continue des fonctionnalités terminées.                                      | staging      | Personne en direct — PR uniquement |
| `feat/*`        | Une fonctionnalité. Part de `develop`, y retourne.                                       | —            | Son auteur                         |
| `fix/*`         | Une correction non urgente. Part de `develop`.                                           | —            | Son auteur                         |
| `release/x.y.z` | Stabilisation avant mise en prod. Part de `develop`, merge dans `main` **et** `develop`. | staging      | L'équipe                           |
| `hotfix/x.y.z`  | Correction urgente en prod. Part de `main`, merge dans `main` **et** `develop`.          | prod         | L'équipe                           |

### Pourquoi pas des branches nominatives

Le repo utilisait jusqu'ici des branches au nom de leur auteur (`styve`, `epishine`).
Ça fonctionne à deux, mais ça empêche trois choses dont le pipeline a besoin :

- savoir **ce que contient** une branche sans lire son historique ;
- déduire **où déployer** à partir du nom de la branche ;
- avoir plusieurs travaux en parallèle par personne sans les mélanger.

Les branches nominatives existantes restent en place le temps d'être mergées ; les
nouvelles suivent la convention ci-dessous.

### Nommer une branche

```
feat/gestion-budgets
fix/montant-negatif-transfert
release/1.2.0
hotfix/1.1.1
```

Minuscules, tirets, pas d'accents, et un sujet — pas un nom de personne.

### Messages de commit

[Conventional Commits](https://www.conventionalcommits.org/fr/), déjà utilisés dans
l'historique (`feat(comptes): ...`). C'est ce qui permettra de dériver
automatiquement le numéro de version des releases.

```
feat(transactions): filtrage par plage de dates
fix(auth): le refresh token expirait une heure trop tôt
chore(ci): passage du build Docker sur buildx
```

Types acceptés : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`.

## Cycle de vie d'une contribution

```bash
git switch develop && git pull
git switch -c feat/gestion-budgets

# ... commits ...

git push -u origin feat/gestion-budgets
gh pr create --base develop
```

La PR est mergeable quand :

1. la CI est verte (lint, types, format, migrations, tests, image Docker) ;
2. le Quality Gate SonarCloud passe ;
3. une personne de l'équipe a approuvé ;
4. la branche est à jour avec `develop`.

Merge en **squash** vers `develop` (un commit lisible par fonctionnalité), en
**merge commit** de `release/*` et `hotfix/*` vers `main` (l'historique des
releases doit rester distinct).

## Publier une version

```bash
git switch -c release/1.2.0 develop
# corrections de stabilisation uniquement, pas de nouvelle fonctionnalité
gh pr create --base main
# après merge :
git tag -a v1.2.0 -m "1.2.0" && git push origin v1.2.0
git switch develop && git merge --no-ff main   # récupérer les correctifs
```

Le tag `v*` déclenche la publication de l'image de production et le déploiement.

## Protections de branche à activer sur GitHub

À faire une fois, dans **Settings → Branches → Add rule**, pour `main` **et**
`develop` (`Settings → Rules → Rulesets` fonctionne aussi) :

- [ ] Require a pull request before merging — **1 approbation**
- [ ] Dismiss stale pull request approvals when new commits are pushed
- [ ] Require status checks to pass — cocher `Lint, types & tests`, `Image Docker`,
      `SonarCloud`, `CodeQL`
- [ ] Require branches to be up to date before merging
- [ ] Require conversation resolution before merging
- [ ] Block force pushes
- [ ] Restrict deletions

Sans ces règles la stratégie n'est qu'une convention : la CI signale les problèmes
mais n'empêche personne de merger du rouge.

## Ce que la CI vérifie

| Étape                            | Commande locale équivalente                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Types                            | `npm run typecheck`                                                                             |
| Lint                             | `npm run lint`                                                                                  |
| Formatage                        | `npm run format:check`                                                                          |
| Migrations sur base vierge       | `npx prisma migrate deploy`                                                                     |
| Schéma ↔ migrations synchronisés | `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` |
| Tests + couverture               | `npm run test:coverage`                                                                         |
| Image de production              | `docker build --target prod .`                                                                  |

Le hook `pre-commit` (Husky + lint-staged) applique déjà ESLint et Prettier sur les
fichiers modifiés : la CI ne devrait jamais échouer sur du formatage.

### Sous Windows : `format:check` échoue sur tout le repo ?

C'est un problème de fins de ligne, pas de formatage. Git for Windows checkout
en CRLF par défaut alors que Prettier attend du LF — la CI, elle, tourne sous
Linux et ne voit rien. Le `.gitattributes` du repo corrige le comportement pour
les prochains clones ; sur un clone existant, une seule commande suffit :

```bash
git add --renormalize .
```
