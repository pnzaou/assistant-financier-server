// Génère une paire de clés RSA 4096 (JWT RS256) et affiche les deux lignes
// prêtes à coller telles quelles dans le .env (PEM aplati, sauts de ligne
// encodés en \n — le code les reconstitue avec .replace(/\\n/g, "\n")).
//
// Usage :
//   docker compose run --rm --no-deps server node scripts/generer-cles.js
//
// Équivalent openssl (Git Bash / Linux / macOS) :
//   openssl genrsa -out private.key 4096
//   openssl rsa -in private.key -pubout -out public.key
//   awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.key
//   awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' public.key
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 4096,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const aplatir = (pem) =>
  pem
    .trim()
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .join("\\n");

console.log(`JWT_PRIVATE_KEY="${aplatir(privateKey)}"`);
console.log(`JWT_PUBLIC_KEY="${aplatir(publicKey)}"`);
