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
            colors: {
              background: "#f7f5f2",
              surface: "#ffffff",
              primary: "#c0521d",
              secondary: "#b8480f",
              success: "#16a34a",
              warning: "#f59e0b",
              error: "#ef4444",
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
