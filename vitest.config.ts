import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Prépare la base de test (création, migrations, seed) une fois pour toute la suite.
    globalSetup: "./tests/global-setup.ts",
    // Bascule DATABASE_URL sur la base de test AVANT que l'app ne soit importée.
    setupFiles: ["./tests/setup-env.ts"],
    // Les fichiers de test partagent une même base : on les exécute en série
    // pour qu'ils ne s'écrasent pas les données entre eux.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    // Marge pour les tests d'API (bcrypt à 12 tours ≈ 250 ms par hash).
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});
