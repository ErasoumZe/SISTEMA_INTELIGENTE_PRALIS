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
          // Cara Material/Mobills: botoes/FAB como pills (~25px). Cards recebem raio 14px via main.css.
          rounded: "pill"
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
            // Tema neutro Mobills/Material (V1). Estes sao os defaults/paint inicial; a mecanica de
            // tema por empresa (aplicarTema) continua sobrescrevendo em runtime. Ver PROJECT_BRAIN/03.
            colors: {
              background: "#f4f6fa",
              surface: "#ffffff",
              primary: "#6515dd",
              secondary: "#35128c",
              success: "#16a34a",
              warning: "#b7791f",
              error: "#dc2626",
              info: "#2196f3"
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
