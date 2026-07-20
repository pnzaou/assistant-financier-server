import { Resend } from "resend";

interface OptionsEmail {
  destinataire: string;
  sujet: string;
  html: string;
}

// Envoi d'email via Resend. Sans RESEND_API_KEY (dev), l'email est affiché
// dans les logs du conteneur : les liens de vérification/réinitialisation y
// sont lisibles et cliquables — parfait pour tester sans compte email.
export async function envoyerEmail({ destinataire, sujet, html }: OptionsEmail): Promise<void> {
  const cleApi = process.env.RESEND_API_KEY;
  if (!cleApi) {
    console.log(
      `[email simulé — RESEND_API_KEY absente]\nÀ      : ${destinataire}\nSujet  : ${sujet}\nCorps  : ${html}`,
    );
    return;
  }
  try {
    const resend = new Resend(cleApi);
    await resend.emails.send({
      from: process.env.EMAIL_EXPEDITEUR ?? "Assistant Financier <onboarding@resend.dev>",
      to: destinataire,
      subject: sujet,
      html,
    });
  } catch (erreur) {
    // Un email qui échoue ne doit pas faire échouer l'inscription :
    // l'utilisateur pourra demander un renvoi.
    console.error("Échec d'envoi d'email :", erreur);
  }
}

// Base des liens envoyés par email : la première origine de CLIENT_URLS
// (le front web, qui héberge les pages /verifier-email et
// /reinitialiser-mot-de-passe).
export function urlFront(): string {
  const premiere = (process.env.CLIENT_URLS ?? "http://localhost:5173").split(",")[0];
  return premiere?.trim() ?? "http://localhost:5173";
}
