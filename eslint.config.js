import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Code généré, sorties de build et configs racines : pas lintés
  {
    ignores: [
      "dist/",
      "generated/",
      "node_modules/",
      "coverage/",
      "eslint.config.js",
      "prisma.config.ts",
    ],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Le piège n°1 avec Prisma : une requête sans await ne s'exécute jamais.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Un underscore marque un paramètre volontairement inutilisé
      // (ex. le 4e paramètre obligatoire du middleware d'erreurs Express).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Dans les tests, reponse.body (Supertest) est typé any par nature :
    // les règles "unsafe" y deviennent du bruit, on les coupe ICI seulement.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
);
