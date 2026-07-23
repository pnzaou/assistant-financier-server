import type { Request, Response } from "express";
import { NonAutoriseException } from "../exceptions/http.exception.js";
import { repondreAuMessage } from "../services/chatbot.service.js";

function utilisateurConnecte(req: Request): { id: string } {
  if (!req.utilisateur) {
    throw new NonAutoriseException();
  }
  return req.utilisateur;
}

interface CorpsMessageChatbot {
  message?: unknown;
}

function extraireMessage(req: Request): string | undefined {
  const corps = req.body as unknown;
  if (typeof corps !== "object" || corps === null) {
    return undefined;
  }

  const message = (corps as CorpsMessageChatbot).message;
  return typeof message === "string" ? message.trim() : undefined;
}

export async function chat(req: Request, res: Response): Promise<void> {
  const utilisateur = utilisateurConnecte(req);
  const message = extraireMessage(req);

  if (!message) {
    res.status(400).json({ message: "Le message est obligatoire." });
    return;
  }

  const reponse = await repondreAuMessage(utilisateur.id, message);
  res.json({ message: reponse });
}
