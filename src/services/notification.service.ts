import * as personneRepository from "../repositories/personne.repository.js";

const URL_EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

interface TicketExpoPush {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

// Un seul token par personne (voir schema.prisma) : pas de batching à gérer,
// un ticket en retour suffit. Si Expo répond "DeviceNotRegistered" (appareil
// désinstallé/token expiré), on efface le token en base — sinon on continue
// à taper dans le vide à chaque envoi futur.
export async function envoyerNotificationPush(
  personneId: string,
  titre: string,
  corps: string,
  donnees?: Record<string, unknown>,
): Promise<boolean> {
  const personne = await personneRepository.trouverParId(personneId);
  if (!personne?.expoPushToken) {
    return false;
  }

  console.log("[notification] envoi Expo Push vers token", personne.expoPushToken);

  let reponse: Response;
  try {
    reponse = await fetch(URL_EXPO_PUSH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: personne.expoPushToken,
        title: titre,
        body: corps,
        ...(donnees && { data: donnees }),
      }),
    });
  } catch (error) {
    console.log("[notification] envoi Expo Push échoué (réseau)", error);
    return false;
  }

  if (!reponse.ok) {
    const text = await reponse.text();
    console.log("[notification] envoi Expo Push échoué", reponse.status, text);
    return false;
  }

  const payload = (await reponse.json()) as { data?: TicketExpoPush };
  console.log("[notification] expo response", payload);
  const ticket = payload.data;

  if (ticket?.status === "error") {
    console.log("[notification] ticket Expo Push en erreur", ticket.message);
    if (ticket.details?.error === "DeviceNotRegistered") {
      await personneRepository.mettreAJourPushToken(personneId, null);
    }
    return false;
  }

  return true;
}
