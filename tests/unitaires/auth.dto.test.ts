import { describe, expect, it } from "vitest";
import { versUtilisateurPublic } from "../../src/dtos/auth.dto.js";

describe("versUtilisateurPublic", () => {
  const personneEnBase = {
    id: "0198c5aa-0000-7000-8000-000000000001",
    email: "alice@test.local",
    nom: "Durand",
    prenom: "Alice",
    emailVerifieLe: null as Date | null,
    // Champs sensibles présents en base — ne doivent JAMAIS sortir :
    passwordHash: "$2b$12$secret",
    statut: "ACTIF",
  };

  it("expose les champs publics", () => {
    const dto = versUtilisateurPublic(personneEnBase);
    expect(dto).toEqual({
      id: personneEnBase.id,
      email: "alice@test.local",
      nom: "Durand",
      prenom: "Alice",
      emailVerifie: false,
    });
  });

  it("ne fuite jamais le passwordHash ni le statut", () => {
    const dto = versUtilisateurPublic(personneEnBase);
    expect(dto).not.toHaveProperty("passwordHash");
    expect(dto).not.toHaveProperty("statut");
  });

  it("traduit emailVerifieLe (date) en booléen", () => {
    const dto = versUtilisateurPublic({ ...personneEnBase, emailVerifieLe: new Date() });
    expect(dto.emailVerifie).toBe(true);
  });
});
