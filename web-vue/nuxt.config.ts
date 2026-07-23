import { defineNuxtConfig } from "nuxt/config";
import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2026-06-23",
  alias: {
    "@padaria/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url))
  },
  vite: {
    optimizeDeps: {
      include: ["@vue/devtools-core", "@vue/devtools-kit", "zod"]
    }
  },
  modules: ["vuetify-nuxt-module"],
  css: ["@mdi/font/css/materialdesignicons.css", "~/assets/main.css"],
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || process.env.PUBLIC_API_URL || "http://localhost:4100"
    }
  },
  vuetify: {
    vuetifyOptions: {
      icons: {
        defaultSet: "mdi"
      },
      defaults: {
        VBtn: {
          rounded: "lg"
        },
        VCard: {
          rounded: "lg"
        },
        VTextField: {
          density: "comfortable",
          variant: "outlined"
        },
        VTextarea: {
          density: "comfortable",
          variant: "outlined"
        },
        VSelect: {
          density: "comfortable",
          variant: "outlined"
        }
      },
      theme: {
        defaultTheme: "padariaLight",
        themes: {
          padariaLight: {
            dark: false,
            // Neutros do doc 03 (base Mobills) + brand roxo (D9). A mecanica de tema por empresa
            // continua vencendo por cima (aplicarTema injeta as vars inline). As cores de categoria
            // ficam FIXAS em main.css (--cat-*), fora do tema por empresa.
            colors: {
              background: "#f4f6fa", // --canvas
              surface: "#ffffff", // --surface
              primary: "#5b21b6", // --brand
              secondary: "#54209f", // brand/resultado forte
              success: "#16a34a", // --positive
              warning: "#f59e0b",
              error: "#dc2626", // --negative
              info: "#0284c7"
            }
          }
        }
      }
    }
  },
  typescript: {
    strict: true,
    typeCheck: true
  }
});
