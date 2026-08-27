<script setup lang="ts">
/* A coluna de navegacao da casca. EXTRAIDA do AppShell.vue em 27/08/2026 (VIS-E7a), que estava
   com 412 linhas contra o limite de ~400 do 16 R5 — o mesmo limite que o AppWorkspace furou ate
   chegar a 1886 por ninguem ter quebrado a tempo.

   REFATORACAO PURA: zero mudanca de comportamento, de aparencia ou de marcacao renderizada. O que
   era estado local do AppShell virou prop; o que era chamada direta virou evento. A marcacao de
   dentro do `<v-navigation-drawer>` veio inteira, comentarios inclusive.

   Os slots `actions` e `caixa` sao repassados pelo AppShell exatamente com a mesma assinatura —
   `caixa` continua escopado com `caixa-aberto`, mesmo nao havendo hoje quem consuma esse escopo
   (AppWorkspace.vue:2065 usa `<template #caixa>` sem desestruturar). Assinatura publica nao se
   encolhe num commit que promete nao mudar comportamento. */
import type { CaixaOperacional, ItemMenu } from "~/types/padaria";
import AppMenuItem from "~/components/app/AppMenuItem.vue";
import { agruparTelasMenu } from "~/utils/menu";
import { CATEGORIA_POR_SECAO } from "~/utils/cores-categoria";

const props = defineProps<{
  telas: ItemMenu[];
  telaAtiva: string;
  telasDesabilitadas?: string[];
  motivosTelasDesabilitadas?: Record<string, string>;
  escuro: boolean;
  caixaAberto: CaixaOperacional | null;
  aberto: boolean;
  rail: boolean;
  recolhido: boolean;
  mobile: boolean;
}>();

const emit = defineEmits<{
  (event: "update:aberto", aberto: boolean): void;
  (event: "alternar"): void;
  (event: "navegar"): void;
}>();

const telasDesabilitadasSet = computed(() => new Set(props.telasDesabilitadas ?? []));
const telasAgrupadas = computed(() => agruparTelasMenu(props.telas));

function textoTooltipTela(telaId: string) {
  return props.motivosTelasDesabilitadas?.[telaId] ?? "Tela indisponivel para este perfil.";
}

// Custom property, como o `--item-cor` do AppMenuItem: a lista de quem tem cor continua sendo so o
// `CATEGORIA_POR_SECAO`. Aponta para o TOKEN e nunca para o hex (licao do VIS-E2a: com hex a marca
// ficava com a cor do claro tambem no escuro). Secao sem cor devolve `undefined` e o CSS cai no
// neutro do `var(--grupo-cor, ...)` — mesma forma, mesmo tamanho, so a tinta muda.
function estiloGrupo(titulo: string) {
  const categoria = CATEGORIA_POR_SECAO[titulo];
  return categoria ? { "--grupo-cor": `var(--cat-${categoria}-tinta)` } : undefined;
}

// Categorias do menu (hoje so "Lancamentos"): abrem/fecham no clique. Fica aberta enquanto uma das
// telas de dentro dela e a tela atual — quem esta em /despesas ve onde esta.
const categoriasAbertas = ref<Record<string, boolean>>({});

function categoriaAberta(id: string) {
  return categoriasAbertas.value[id] ?? false;
}

function alternarCategoria(id: string) {
  categoriasAbertas.value[id] = !categoriaAberta(id);
}

watch(
  [() => props.telaAtiva, telasAgrupadas],
  ([telaAtiva, grupos]) => {
    for (const grupo of grupos) {
      for (const no of grupo.itens) {
        if (no.tipo === "categoria" && no.itens.some((tela) => tela.id === telaAtiva)) {
          categoriasAbertas.value[no.id] = true;
        }
      }
    }
  },
  { immediate: true }
);

// O menu volta para onde o usuario o deixou. A causa (a casca REMONTA a cada rota, entao a
// `.sidebar-nav` e outra e nasce em zero) e a medicao estao no proprio composable.
useItemAtivoVisivel();
</script>

<template>
  <v-navigation-drawer
    :model-value="aberto"
    :permanent="!mobile"
    :temporary="mobile"
    width="300"
    rail-width="72"
    :rail="rail"
    class="padaria-sidebar"
    :class="{ rail }"
    @update:model-value="emit('update:aberto', $event)"
  >
    <div class="drawer-shell">
      <div class="drawer-top">
        <button
          type="button"
          class="sidebar-logo-row"
          :title="recolhido ? 'Expandir menu' : 'Recolher menu'"
          :aria-label="recolhido ? 'Expandir menu' : 'Recolher menu'"
          @click="emit('alternar')"
        >
          <img
            :src="
              rail
                ? '/cicluz/cicluz-simbolo.png'
                : escuro
                  ? '/cicluz/logo-cicluz-branca.png'
                  : '/cicluz/logo-cicluz.png'
            "
            alt="Cicluz Gestão Profissional"
            class="sidebar-logo"
            width="220"
            height="72"
          />
        </button>

        <!-- FAB "+ NOVO" no TOPO da sidebar (Mobills): pill roxo, menu curto de lancamento. -->
        <div class="sidebar-actions">
          <slot name="actions" />
        </div>

        <slot name="caixa" :caixa-aberto="caixaAberto" />
      </div>

      <div class="sidebar-scroll-shell">
        <nav class="sidebar-nav" aria-label="Menu principal">
          <div
            v-for="grupo in telasAgrupadas"
            :key="grupo.titulo"
            class="sidebar-group"
            :style="estiloGrupo(grupo.titulo)"
          >
            <div class="sidebar-group-label">{{ grupo.titulo }}</div>
            <template v-for="no in grupo.itens" :key="no.id">
              <!-- Categoria (Lancamentos): entrada unica que abre e revela as telas de dentro. -->
              <template v-if="no.tipo === 'categoria'">
                <button
                  type="button"
                  class="sidebar-item sidebar-categoria"
                  :class="{ aberta: categoriaAberta(no.id) }"
                  :aria-expanded="categoriaAberta(no.id)"
                  :aria-controls="`sidebar-subitens-${no.id}`"
                  @click="alternarCategoria(no.id)"
                >
                  <v-icon :icon="no.icone" size="21" />
                  <span>{{ no.titulo }}</span>
                  <!-- Um unico chevron que GIRA (CSS) no lugar de trocar de icone: o
                       movimento liga o estado fechado ao aberto em vez de cortar. -->
                  <v-icon class="sidebar-categoria-chevron" icon="mdi-chevron-right" size="18" />
                  <v-tooltip v-if="rail" activator="parent" location="right" :text="no.titulo" :transition="false" />
                </button>
                <!-- A altura anima de verdade (grid-template-rows 0fr -> 1fr, ver main.css),
                     e por isso os filhos ficam SEMPRE montados: com v-if nao ha o que animar.
                     Fechado, o CSS tira a visibilidade — some tambem da ordem do Tab. -->
                <div
                  :id="`sidebar-subitens-${no.id}`"
                  class="sidebar-subitens-wrap"
                  :class="{ aberta: categoriaAberta(no.id) }"
                >
                  <div class="sidebar-subitens">
                    <AppMenuItem
                      v-for="tela in no.itens"
                      :key="tela.id"
                      :tela="tela"
                      :tela-ativa="telaAtiva"
                      :desabilitada="telasDesabilitadasSet.has(tela.id)"
                      :motivo="textoTooltipTela(tela.id)"
                      :rail="rail"
                      @navegar="emit('navegar')"
                    />
                  </div>
                </div>
              </template>
              <AppMenuItem
                v-else
                :tela="no"
                :tela-ativa="telaAtiva"
                :desabilitada="telasDesabilitadasSet.has(no.id)"
                :motivo="textoTooltipTela(no.id)"
                :rail="rail"
                @navegar="emit('navegar')"
              />
            </template>
          </div>
        </nav>
      </div>
      <!-- Logout unico: vive no menu do perfil do usuario (topbar). O botao "Sair" da sidebar foi
           removido para nao existir dois caminhos para o mesmo ato (Definition of Done). -->
    </div>
  </v-navigation-drawer>
</template>
