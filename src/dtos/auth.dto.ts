// Les formes des données qui ENTRENT et SORTENT de l'API d'auth.
// Règle d'or : ne JAMAIS renvoyer une Personne Prisma brute — elle contient
// passwordHash. Tout passe par versUtilisateurPublic().

export interface RegisterDto {
  email: string;
  motDePasse: string;
  nom: string;
  prenom: string;
}

export interface LoginDto {
  email: string;
  motDePasse: string;
}

// Type structurel : tout objet Prisma Personne le satisfait.
export interface PersonnePublique {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  emailVerifieLe: Date | null;
}

export interface UtilisateurPublicDto {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  emailVerifie: boolean;
}

export function versUtilisateurPublic(personne: PersonnePublique): UtilisateurPublicDto {
  return {
    id: personne.id,
    email: personne.email,
    nom: personne.nom,
    prenom: personne.prenom,
    emailVerifie: personne.emailVerifieLe !== null,
  };
}

export interface AuthResultatDto {
  utilisateur: UtilisateurPublicDto;
  accessToken: string;
  refreshToken: string;
}
