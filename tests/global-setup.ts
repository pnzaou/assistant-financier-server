// Exécuté UNE fois avant toute la suite : crée la base de test si besoin,
// applique les migrations et seed les rôles.
// La base de test = la base de dev suffixée "_test" (ex. assistant_financier_test) :
// les tests peuvent tout y effacer sans jamais toucher aux données de dev.
import { execSync } from "node:child_process";
import pg from "pg";

function urlAvecBase(urlOrigine: string, nomBase: string): string {
  const url = new URL(urlOrigine);
  url.pathname = `/${nomBase}`;
  return url.toString();
}

export default async function preparerBaseDeTest(): Promise<void> {
  const urlDev = process.env.DATABASE_URL;
  if (!urlDev) {
    throw new Error("DATABASE_URL manquante — impossible de préparer la base de test.");
  }

  const nomBaseDev = new URL(urlDev).pathname.slice(1);
  const nomBaseTest = `${nomBaseDev}_test`;

  // 1. Créer la base de test si elle n'existe pas (via la base d'admin "postgres").
  const urlAdmin = new URL(urlAvecBase(urlDev, "postgres"));
  urlAdmin.search = "";
  const admin = new pg.Client({ connectionString: urlAdmin.toString() });
  await admin.connect();
  const existe = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [nomBaseTest]);
  if (existe.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${nomBaseTest}"`);
    console.log(`Base de test "${nomBaseTest}" créée.`);
  }
  await admin.end();

  // 2. Migrations + seed sur la base de test (idempotents).
  const env = { ...process.env, DATABASE_URL: urlAvecBase(urlDev, nomBaseTest) };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx prisma db seed", { env, stdio: "inherit" });
}
