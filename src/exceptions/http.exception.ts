// Erreurs métier typées : les services les lèvent, le middleware d'erreurs
// global (middlewares/erreurs.middleware.ts) les traduit en réponse JSON.
// Un service ne touche jamais à res/status : il décrit le problème, c'est tout.
export class HttpException extends Error {
  constructor(
    public readonly statut: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class RequeteInvalideException extends HttpException {
  constructor(message = "Requête invalide.") {
    super(400, message);
  }
}

export class NonAutoriseException extends HttpException {
  constructor(message = "Authentification requise.") {
    super(401, message);
  }
}

export class AccesRefuseException extends HttpException {
  constructor(message = "Accès refusé.") {
    super(403, message);
  }
}

export class NonTrouveException extends HttpException {
  constructor(message = "Ressource introuvable.") {
    super(404, message);
  }
}

export class ConflitException extends HttpException {
  constructor(message = "Conflit avec une ressource existante.") {
    super(409, message);
  }
}
