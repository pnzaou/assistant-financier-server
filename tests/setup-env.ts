// Exécuté avant CHAQUE fichier de test, avant tout import de l'app :
// bascule la connexion Prisma sur la base de test (suffixe "_test").
// C'est ce qui garantit qu'aucun test ne peut écrire dans la base de dev.
const urlDev = process.env.DATABASE_URL;
if (urlDev) {
  const url = new URL(urlDev);
  if (!url.pathname.endsWith("_test")) {
    url.pathname = `${url.pathname}_test`;
  }
  process.env.DATABASE_URL = url.toString();
}
