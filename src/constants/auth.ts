// Durées et noms liés à l'authentification — un seul endroit à modifier.

// Access token (JWT RS256) : court, non révocable → durée courte.
export const DUREE_ACCESS_TOKEN = "15m" as const;
export const DUREE_ACCESS_TOKEN_MS = 15 * 60 * 1000;

// Session refresh : longue, stockée en base → révocable à tout moment.
export const DUREE_SESSION_REFRESH_JOURS = 30;

// Jetons envoyés par email.
export const DUREE_JETON_VERIFICATION_EMAIL_HEURES = 24;
export const DUREE_JETON_REINITIALISATION_MINUTES = 60;

// Cookies (apps web). Le refresh token n'est envoyé par le navigateur que sur
// les routes d'auth grâce à son path : il ne circule pas sur le reste de l'API.
export const COOKIE_ACCESS_TOKEN = "accessToken";
export const COOKIE_REFRESH_TOKEN = "refreshToken";
export const CHEMIN_COOKIE_REFRESH = "/api/v1/auth";
