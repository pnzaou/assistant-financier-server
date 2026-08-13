import * as cron from "node-cron";
import app from "./app.js";
import { detecterAnomaliesCategoriesToutesPersonnes } from "./services/detection-proactive.service.js";

const port = Number(process.env.PORT ?? 5000);

app.listen(port, "0.0.0.0", () => {
  console.log(`API Assistant Financier démarrée sur http://0.0.0.0:${port}`);
});

// Une fois par jour à 8h (heure du serveur) : détecte les catégories dont
// la dépense du mois s'écarte nettement de l'habitude, pour chaque personne
// ayant un appareil enregistré.
cron.schedule("0 8 * * *", () => {
  void detecterAnomaliesCategoriesToutesPersonnes().catch((error) => {
    console.log("[cron] detecterAnomaliesCategoriesToutesPersonnes a échoué", error);
  });
});
