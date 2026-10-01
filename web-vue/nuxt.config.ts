import { defineNuxtConfig } from "nuxt/config";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// O workspace de desenvolvimento pode usar junctions para o node_modules compartilhado da máquina.
// O Vite compara o caminho real dos CSS/componentes com a allowlist; sem este caminho, a página
// carrega a casca mas falha ao importar páginas dinamicamente depois do primeiro hot reload.
const dependenciasReais = realpathSync(fileURLToPath(new URL("../node_modules", import.meta.url)));

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2026-06-23",
  alias: {
    "@padaria/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    // O alias do pacote-raiz nao resolve subpaths para o Vite. Sem este prefixo, imports como
    // `@padaria/shared/notificacoes` chegam ao navegador como modulo inexistente.
    "@padaria/shared/": fileURLToPath(new URL("../shared/src/", import.meta.url))
  },
  vite: {
    server: { fs: { allow: [dependenciasReais] } },
    optimizeDeps: {
      include: ["@vue/devtools-core", "@vue/devtools-kit", "zod"]
    }
  },
  modules: ["vuetify-nuxt-module"],
  css: ["@mdi/font/css/materialdesignicons.css", "~/assets/main.css"],
  app: {
    head: {
      title: "Cicluz Gestão Profissional",
      meta: [
        { name: "theme-color", content: "#090b11" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "Cicluz Gestão" }
      ],
      link: [
        { rel: "icon", type: "image/png", href: "/cicluz/cicluz-favicon.png" },
        { rel: "manifest", href: "/manifest.webmanifest?v=4" },
        { rel: "apple-touch-icon", href: "/cicluz/cicluz-gestao-v4-180.png?v=4", sizes: "180x180" },
        { rel: "apple-touch-icon-precomposed", href: "/cicluz/cicluz-gestao-v4-180.png?v=4", sizes: "180x180" }
      ],
      // TEMA DAS TELAS DE ENTRADA, ANTES DO APP EXISTIR.
      //
      // Este projeto e `ssr: false` (linha 5), entao o HTML servido e uma casca vazia e o
      // `useHead` do `useTemaEntrada` so consegue agir depois que o app inteiro monta. MEDIDO: a
      // tela ficava CLARA ate 1422ms e so entao virava escura — uma piscada longa do tema errado,
      // justamente na primeira tela que o usuario ve.
      //
      // Um script inline no <head> roda no parse do documento, antes da primeira pintura, e mata a
      // piscada. E o unico lugar de onde da para fazer isso num SPA.
      //
      // NAO GRAVA NADA: so escreve o atributo no <html>. A preferencia do usuario continua vivendo
      // no localStorage, intocada — quem entra e escolhe claro continua com claro. E casa com a
      // MESMA lista de rotas do `useTemaEntrada`; mudar uma sem a outra faz a piscada voltar.
      script: [
        {
          // SEM BARRA INVERTIDA, e isso nao e estilo: a primeira versao usava uma expressao
          // regular e o `\/` foi DESESCAPADO na serializacao do head. O que chegou ao navegador
          // foi `/^/(login|...)`, uma regex literal invalida — script quebrado, e a piscada de
          // volta sem aviso. Comparacao de string nao tem esse risco.
          innerHTML:
            "var p=location.pathname;" +
            'if(p.length>1&&p.charAt(p.length-1)==="/")p=p.slice(0,-1);' +
            'if(p==="/login"||p==="/forgot-password"||p==="/reset-password")' +
            'document.documentElement.setAttribute("data-theme","dark")'
        }
      ]
    }
  },
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || process.env.PUBLIC_API_URL || "http://localhost:4100",
      apiUrlLan: process.env.NUXT_PUBLIC_API_URL_LAN || ""
    }
  },
  vuetify: {
    vuetifyOptions: {
      icons: {
        defaultSet: "mdi"
      },
      // Uma linha aqui repinta o sistema inteiro: v-text-field aparece 107x, v-btn 98x,
      // v-select 62x, v-card 39x, v-alert 33x. Raio segue a escala unica de
      // PROJECT_BRAIN/67 (controle = 8px "lg" no vocabulario do Vuetify; card e
      // superficie grande sobem para 16/22px via main.css, que o Vuetify nao expressa).
      defaults: {
        VBtn: {
          // Era "pill" em TODO botao (heranca Mobills). Pill para tudo quebra a escala de
          // raio por hierarquia; o FAB "+ NOVO" continua pill pelo CSS, que e onde ele e
          // de fato um FAB. Botao comum volta para o retangulo arredondado de 8px.
          rounded: "lg"
        },
        VCard: {
          rounded: "lg"
        },
        VTextField: {
          density: "comfortable",
          variant: "outlined",
          rounded: "lg"
        },
        VTextarea: {
          density: "comfortable",
          variant: "outlined",
          rounded: "lg"
        },
        VSelect: {
          density: "comfortable",
          variant: "outlined",
          rounded: "lg"
        },
        VAlert: {
          rounded: "lg"
        },
        VChip: {
          rounded: "pill"
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
          },
          // Tema escuro DE VERDADE. Antes o modo escuro so remendava --v-theme-* com
          // !important no main.css: as vars mudavam, mas os componentes Vuetify seguiam
          // calculados como claros por dentro. useModoEscuro troca de tema por aqui.
          padariaDark: {
            dark: true,
            colors: {
              background: "#0f1318",
              surface: "#191f26",
              // Renditicao ESCURA da marca, nao troca de identidade: #6515dd sobre
              // superficie escura da 2,1:1 e reprova como texto/link (color="primary" em
              // botao de texto). Clareado, da 5,5:1 sobre o fundo, e o Vuetify passa a
              // escolher tinta escura por cima quando ele vira preenchimento.
              primary: "#a97bff",
              secondary: "#c9b0ff",
              success: "#4ade80",
              warning: "#e0a23a",
              error: "#ff8a80",
              info: "#64b5f6"
            }
          }
        }
      }
    }
  },
  typescript: {
    strict: true,
    typeCheck: true,
    // O Vite usa `alias`, mas o vue-tsc le o tsconfig gerado pelo Nuxt. Declare o coringa tambem
    // aqui para que tipos de submodulos do shared sigam apontando para a fonte no desenvolvimento.
    tsConfig: {
      compilerOptions: {
        paths: {
          "@padaria/shared/*": ["../../shared/src/*/index.ts"]
        }
      }
    }
  }
});
