import { describe, expect, it } from "vitest";
import {
  dateDansHeures,
  dateDansJours,
  dateDansMinutes,
  genererJetonOpaque,
  hasherJeton,
} from "../../src/utils/jeton.util.js";

describe("genererJetonOpaque", () => {
  it("produit 64 caractères hexadécimaux", () => {
    expect(genererJetonOpaque()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ne produit jamais deux fois le même jeton", () => {
    const jetons = new Set(Array.from({ length: 100 }, () => genererJetonOpaque()));
    expect(jetons.size).toBe(100);
  });
});

describe("hasherJeton", () => {
  it("est déterministe (même entrée → même empreinte)", () => {
    expect(hasherJeton("abc")).toBe(hasherJeton("abc"));
  });

  it("ne renvoie jamais le jeton en clair", () => {
    const jeton = genererJetonOpaque();
    expect(hasherJeton(jeton)).not.toBe(jeton);
    expect(hasherJeton(jeton)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("dates d'expiration", () => {
  it("calcule des échéances dans le futur, à la bonne distance", () => {
    const maintenant = Date.now();
    expect(dateDansMinutes(60).getTime() - maintenant).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(dateDansHeures(24).getTime() - maintenant).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(dateDansJours(30).getTime() - maintenant).toBeGreaterThanOrEqual(
      29 * 24 * 60 * 60 * 1000,
    );
  });
});
