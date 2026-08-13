import type { Request, Response } from "express";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import * as detectionService from "../services/detection-proactive.service.js";
import * as notificationService from "../services/notification.service.js";

export async function envoyerTest(req: Request, res: Response): Promise<void> {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  const envoye = await notificationService.envoyerNotificationPush(
    req.utilisateur.id,
    "Assistant Financier",
    "Ceci est une notification de test — si tu la vois, tout fonctionne !",
  );
  res.json({ envoye });
}

// Déclenche la détection d'anomalies par catégorie pour l'utilisateur
// connecté SEUL (pas le batch complet) — pour vérifier manuellement le
// pipeline sans attendre le cron quotidien.
export async function testerAnomalies(req: Request, res: Response): Promise<void> {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  await detectionService.detecterAnomaliesCategoriePourPersonne(req.utilisateur.id);
  res.status(204).send();
}
