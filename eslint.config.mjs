import js from "@eslint/js";
import globals from "globals";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // integracoes-scripts e um workspace JS puro (sem TS), com gate proprio (node --check + node --test).
    // Fica fora do eslint com type-check, como ja fica fora do `lint` da raiz.
    // **/*.json* fica ignorado globalmente: o eslint nao linta JSON neste repo (o `lint` da raiz passa
    // diretorios, nunca .json). Sem isso, a extensao do eslint no editor acusa "File ignored because no
    // matching configuration was supplied" ao abrir tsconfig.json/package.json — falso positivo.
    ignores: [
      "**/dist/**",
      "**/.nuxt/**",
      "**/.output/**",
      "**/node_modules/**",
      "db/proposals/**",
      "**/*.json",
      "**/*.jsonc",
      "web-vue/**/*.test.ts",
      "web-vue/**/*.spec.ts",
      // Arquivo estatico executado pelo navegador como Service Worker; nao participa do projeto TS.
      "web-vue/public/sw.js",
      "integracoes-scripts/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: {
      security
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "*.mjs",
            "vitest.config.ts",
            "scripts/*.mjs",
            "db/setup-dev.mjs",
            "db/seed.ts",
            "db/bootstrap-prod.ts",
            "db/seed-referencia-prod.ts",
            "db/backfill-codigos.ts",
            "db/diagnostico-fuso.ts",
            "playwright.config.ts"
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20
        },
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true }
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-child-process": "warn",
      "security/detect-non-literal-fs-filename": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSUnknownKeyword",
          message:
            "Use um tipo explicito do shared ou do dominio. unknown explicito so e permitido em fronteiras de dados externos."
        }
      ]
    }
  },
  {
    files: [
      "*.mjs",
      "scripts/**/*.mjs",
      "db/setup-dev.mjs",
      "eslint.config.mjs",
      "db/seed.ts",
      "db/bootstrap-prod.ts",
      "db/seed-referencia-prod.ts",
      "db/backfill-codigos.ts",
      "db/diagnostico-fuso.ts",
      "tests/**/*.ts",
      "api/src/env.ts",
      "web-vue/composables/useApi.ts",
      "web-vue/utils/domain.ts",
      // Le o dossie do fechamento como JSON cru da API (fronteira de dados externos), como domain.ts.
      "web-vue/utils/relatorio-fechamento.ts"
    ],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "no-restricted-syntax": "off"
    }
  },
  {
    files: ["web-vue/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./web-vue/tsconfig.eslint.json"
      }
    }
  }
);
