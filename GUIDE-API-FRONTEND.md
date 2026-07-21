# Guide d'intégration Frontend — Assistant Financier

Ce document explique comment le front (React) doit dialoguer avec l'API pour
couvrir le parcours complet : inscription/connexion, comptes financiers,
catégories, saisie des transactions (avec catégorisation automatique), et
tableau de bord.

Pour l'installation/lancement du serveur (Docker, `.env`...), voir le
[README](./README.md). Ce guide ne couvre que **l'utilisation de l'API**.

## 1. Conventions générales

- **Base URL** : `http://localhost:5000` en dev (via `VITE_API_URL`), toutes
  les routes sont préfixées par `/api/v1`.
- **Toutes les routes ci-dessous (sauf `/auth/*` publiques) exigent d'être
  authentifié.** Voir section 2.
- **Format des réponses** : chaque réponse JSON enveloppe sa charge utile sous
  une clé nommée (jamais un objet nu à la racine) :
  - `{ compte: {...} }`, `{ comptes: [...] }`
  - `{ categories: [...] }`
  - `{ transaction: {...} }`, `{ transactions: { items, page, limite, total } }`
  - `{ soldes: { comptes, totalGlobal } }`, `{ depenses: [...] }`
- **Erreurs** : toujours `{ message: string }` avec le code HTTP approprié
  (400/401/403/404/409). Les erreurs de validation de formulaire (422)
  ajoutent le détail champ par champ :
  ```json
  {
    "message": "Données invalides.",
    "erreurs": [{ "champ": "email", "message": "Adresse email invalide." }]
  }
  ```
- **Montants** : toujours des `number` JSON (jamais de string ni de type
  `Decimal`) — `soldeInitial`, `solde`, `montant`, `montantTotal`.
- **Dates** : format `AAAA-MM-JJ` (ex. `"2026-07-21"`), en entrée comme en
  sortie, pour `dateOperation`, `du`, `au`.
- **Ownership** : chaque utilisateur ne voit que ses propres données. Une
  ressource inexistante et une ressource appartenant à quelqu'un d'autre
  renvoient **exactement la même réponse 404** — ne pas s'appuyer sur une
  distinction entre les deux côté front.

## 2. Authentification

Détail complet des routes dans le [README](./README.md#les-endpoints-dauthentification).
Ce qu'il faut savoir pour intégrer le reste de l'API :

- `POST /api/v1/auth/register` et `POST /api/v1/auth/login` renvoient
  `{ utilisateur, accessToken, refreshToken }` **et** posent des cookies
  httpOnly (`accessToken`, `refreshToken`).
- **Deux façons d'envoyer le token, au choix** (le serveur accepte les deux) :
  1. **Web (recommandé pour le front React)** : ne rien faire de spécial,
     juste toujours appeler `fetch`/`axios` avec `credentials: "include"`
     (ou `withCredentials: true`) — le cookie `accessToken` httpOnly est
     envoyé automatiquement par le navigateur.
  2. **Mobile / autre client** : envoyer l'en-tête
     `Authorization: Bearer <accessToken>` manuellement.
- L'access token expire au bout de 15 minutes. Quand une requête renvoie
  `401`, appeler `POST /api/v1/auth/refresh` (avec le refresh token, via
  cookie ou `{ refreshToken }` dans le corps) pour obtenir une nouvelle paire
  de tokens, puis rejouer la requête initiale.
- `GET /api/v1/auth/moi` renvoie `{ utilisateur }` — utile au chargement de
  l'app pour savoir si la session est valide.

```ts
// Exemple minimal (web, cookies)
async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) {
    const erreur = await res.json();
    throw new Error(erreur.message);
  }
  return res.json();
}
```

## 3. Comptes financiers (`/comptes`)

Un utilisateur peut avoir plusieurs comptes (courant, épargne, carte de
crédit...). **Il n'y a pas de compte créé automatiquement à l'inscription** —
le front doit proposer un écran de création de compte avant la première
saisie de transaction.

Le `solde` n'est **jamais stocké** : il est recalculé à chaque appel
(`soldeInitial` + somme des transactions). Toujours utiliser `solde` pour
l'affichage, pas `soldeInitial`.

### `POST /api/v1/comptes` — créer un compte

```json
// Requête
{
  "nom": "Compte courant",
  "type": "COURANT", // optionnel, défaut "COURANT" — voir valeurs ci-dessous
  "soldeInitial": 100, // optionnel, défaut 0
  "devise": "EUR", // optionnel, défaut "EUR" (code ISO 4217, 3 lettres)
  "institution": "Ecobank", // optionnel
  "couleur": "#3B82F6" // optionnel
}
```

Valeurs possibles pour `type` : `COURANT`, `EPARGNE`, `CARTE_CREDIT`,
`ESPECES`, `INVESTISSEMENT`, `AUTRE`.

Réponse `201` :

```json
{
  "compte": {
    "id": "uuid",
    "nom": "Compte courant",
    "type": "COURANT",
    "soldeInitial": 100,
    "solde": 100,
    "devise": "EUR",
    "institution": null,
    "couleur": null
  }
}
```

### `GET /api/v1/comptes` — lister mes comptes

Réponse `200` : `{ "comptes": [ /* même forme que ci-dessus */ ] }`

## 4. Catégories (`/categories`)

Lecture seule — liste les catégories **système**, déjà pré-remplies (17
catégories : Alimentation, Transport, Logement, Salaire, etc.). Il n'y a pas
encore de création de catégorie personnalisée.

### `GET /api/v1/categories?type=DEPENSE|REVENU`

Le paramètre `type` est optionnel (sans lui : toutes les catégories).

Réponse `200` :

```json
{
  "categories": [
    {
      "id": "uuid",
      "nom": "Transport",
      "type": "DEPENSE",
      "icone": "🚗",
      "couleur": null,
      "parentId": null
    }
  ]
}
```

Utile pour peupler un `<select>` de catégorie dans le formulaire de saisie
manuelle (voir section suivante) et dans les filtres.

## 5. Transactions (`/transactions`)

CRUD complet. **`type` ne peut être que `DEPENSE` ou `REVENU`** (les
virements entre comptes ne sont pas encore supportés).

### `POST /api/v1/transactions` — saisie manuelle (avec catégorisation auto)

```json
{
  "compteId": "uuid",
  "montant": 15.5, // toujours positif
  "type": "DEPENSE", // "DEPENSE" | "REVENU"
  "libelle": "Yango vers l'aéroport",
  "note": "optionnel",
  "dateOperation": "2026-07-21",
  "categorieId": "uuid" // OPTIONNEL — voir ci-dessous
}
```

**Point clé pour l'UX** : `categorieId` est optionnel. Si le formulaire de
saisie ne fournit pas de catégorie, le serveur en devine une automatiquement
à partir du `libelle` (mots-clés : "yango"/"essence" → Transport,
"restaurant"/"kfc" → Restaurants, "loyer"/"woyofal" → Logement, "salaire" →
Salaire, etc. — liste complète dans `src/constants/regles-categorisation.ts`,
personnalisable). Si rien ne correspond, la transaction part en "Divers" (ou
"Autres revenus" pour un revenu). **Recommandation UX** : laisser le champ
catégorie vide/optionnel dans le formulaire, afficher la catégorie devinée
dans la réponse, et permettre à l'utilisateur de la corriger ensuite via
`PATCH`.

Réponse `201` : `{ "transaction": { "id", "compteId", "categorieId", "montant", "type", "libelle", "note", "dateOperation", "pointee" } }`

Erreurs notables : `404` si `compteId` n'appartient pas à l'utilisateur ;
`400` si `categorieId` fourni ne correspond pas à une catégorie système du
bon `type` (ex. donner une catégorie "Salaire" (REVENU) pour une DEPENSE).

### `GET /api/v1/transactions` — historique, avec filtres et pagination

Query params, tous optionnels : `compteId`, `categorieId`, `du`, `au` (dates
`AAAA-MM-JJ`), `page` (défaut 1), `limite` (défaut 20, max 100).

Réponse `200` :

```json
{ "transactions": { "items": [/* TransactionDto[] */], "page": 1, "limite": 20, "total": 42 } }
```

### `GET /api/v1/transactions/:id` — le détail d'une transaction

`{ "transaction": {...} }` — `404` si elle n'existe pas ou n'appartient pas à
l'utilisateur connecté.

### `PATCH /api/v1/transactions/:id` — modification partielle

Body : n'importe quel sous-ensemble de `montant`, `libelle`, `note`,
`dateOperation`, `categorieId`, `pointee`. (Le compte et le type d'une
transaction ne sont pas modifiables dans cette version — supprimer et
recréer si besoin.)

### `DELETE /api/v1/transactions/:id`

`204 No Content`.

## 6. Tableau de bord (`/dashboard`)

Deux endpoints en lecture seule, pensés pour l'écran d'accueil.

### `GET /api/v1/dashboard/soldes`

Réponse `200` :

```json
{
  "soldes": {
    "comptes": [{ "compteId": "uuid", "nom": "Compte courant", "solde": 850, "devise": "EUR" }],
    "totalGlobal": 850
  }
}
```

⚠️ `totalGlobal` additionne les soldes tels quels, **sans conversion de
devise** — à n'utiliser que si tous les comptes de l'utilisateur partagent la
même devise (pas de gestion multi-devises pour l'instant).

### `GET /api/v1/dashboard/depenses-par-categorie?du=&au=`

`du`/`au` optionnels (`AAAA-MM-JJ`) — par défaut, le **mois calendaire en
cours**. Ne regroupe que les `DEPENSE` (les revenus n'apparaissent jamais
ici).

Réponse `200` :

```json
{ "depenses": [{ "categorieId": "uuid", "nomCategorie": "Transport", "montantTotal": 50 }] }
```

Idéal pour un graphique en camembert/barres des dépenses par catégorie.

## 7. Parcours utilisateur recommandé (onboarding)

1. `POST /auth/register` (ou `/auth/login`) → obtenir la session.
2. Si `GET /comptes` renvoie une liste vide → afficher un écran "créer ton
   premier compte" → `POST /comptes`.
3. `GET /categories` pour peupler les sélecteurs de catégorie du formulaire de
   saisie (facultatif si on laisse la catégorisation auto faire le travail).
4. Formulaire de saisie de transaction → `POST /transactions` (catégorie
   laissée vide pour bénéficier de l'auto-catégorisation, éditable ensuite).
5. Écran d'accueil / dashboard → `GET /dashboard/soldes` +
   `GET /dashboard/depenses-par-categorie` en parallèle.
6. Écran historique → `GET /transactions` avec pagination + filtres.

## 8. Pas encore disponible (roadmap, ne pas construire l'UI dessus pour l'instant)

- Virements entre comptes (`type: "TRANSFERT"`).
- Création de catégories personnalisées (seules les catégories système
  existent actuellement).
- Budgets & alertes de dépassement.
- Chatbot conversationnel.
- Recommandations générées par IA.
- Export PDF/CSV.
- Conversion multi-devises sur le total du dashboard.

Si l'un de ces écrans est nécessaire pour la démo/le sprint courant, vérifier
d'abord avec le backend avant de construire l'UI — l'API ne l'expose pas
encore.
