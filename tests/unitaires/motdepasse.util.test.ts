import { describe, expect, it } from "vitest";
import { hasherMotDePasse, verifierMotDePasse } from "../../src/utils/motdepasse.util.js";

describe("mot de passe (bcrypt)", () => {
  it("ne stocke jamais le mot de passe en clair", async () => {
    const hash = await hasherMotDePasse("Secret123");
    expect(hash).not.toBe("Secret123");
    expect(hash.startsWith("$2")).toBe(true); // format bcrypt
  });

  it("valide le bon mot de passe et rejette le mauvais", async () => {
    const hash = await hasherMotDePasse("Secret123");
    await expect(verifierMotDePasse("Secret123", hash)).resolves.toBe(true);
    await expect(verifierMotDePasse("Mauvais123", hash)).resolves.toBe(false);
  });

  it("produit un hash différent à chaque appel (sel aléatoire)", async () => {
    const [hash1, hash2] = await Promise.all([
      hasherMotDePasse("Secret123"),
      hasherMotDePasse("Secret123"),
    ]);
    expect(hash1).not.toBe(hash2);
  });
});
