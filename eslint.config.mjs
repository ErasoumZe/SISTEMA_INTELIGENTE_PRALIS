import js from "@eslint/js";
import globals from "globals";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.nuxt/**", "**/.output/**", "**/node_modules/**"]
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
          allowDefaultProject: ["*.mjs", "scripts/*.mjs", "db/setup.ts", "db/seed.ts"]
        },
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
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
      "eslint.config.mjs",
      "db/setup.ts",
      "db/seed.ts",
      "api/src/rotas.ts",
      "tests/**/*.ts",
      "api/src/db.ts",
      "api/src/auth.ts",
      "api/src/env.ts",
      "web-vue/composables/useApi.ts",
      "web-vue/utils/domain.ts"
    ],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "no-restricted-syntax": "off"
    }
  }
);
