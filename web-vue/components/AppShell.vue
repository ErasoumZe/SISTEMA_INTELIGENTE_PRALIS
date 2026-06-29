<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import type { CaixaStatus, ItemMenu, Opcao } from "~/types/padaria";
import { itemPorTela, rotaTela } from "~/utils/domain";

const props = defineProps<{
  sessao: AuthSession;
  telas: ItemMenu[];
  telaAtiva: string;
  empresas: Opcao[];
  empresaId: string;
  caixaStatus?: CaixaStatus | null;
  telasDesabilitadas?: string[];
  carregandoEmpresa: boolean;
  saindo: boolean;
}>();

const emit = defineEmits<{
  (event: "selecionarEmpresa", id: string): void;
  (event: "logout"): void;
}>();

const drawerRecolhido = ref(false);

const empresaAtiva = computed(
  () => props.empresas.find((empresa) => empresa.id === props.empresaId) ?? props.empresas[0] ?? null
);
const telaAtual = computed(() => itemPorTela[props.telaAtiva] ?? props.telas.find((item) => item.id === props.telaAtiva) ?? null);
const nomeEmpresaCurto = computed(() => empresaAtiva.value?.nome ?? "Empresa");
const caixaAberto = computed(() => props.caixaStatus?.caixaAberto ?? null);
const telasDesabilitadasSet = computed(() => new Set(props.telasDesabilitadas ?? []));

function alternarDrawer() {
  drawerRecolhido.value = !drawerRecolhido.value;
}

onMounted(() => {
  drawerRecolhido.value = window.matchMedia("(width < 1280px)").matches;
});
</script>

<template>
  <v-layout class="padaria-shell">
    <v-navigation-drawer
      permanent
      width="300"
      rail-width="72"
      :rail="drawerRecolhido"
      class="padaria-sidebar"
      :class="{ rail: drawerRecolhido }"
    >
      <div class="drawer-shell">
        <div class="drawer-top">
          <div class="sidebar-brand">
            <div class="brand-icon">
              <v-icon icon="mdi-store-outline" size="22" />
            </div>
            <div class="brand-copy">
              <div class="sidebar-label">EMPRESA ATIVA</div>
              <v-menu v-if="empresas.length > 1" location="bottom start">
                <template #activator="{ props: menuProps }">
                  <button v-bind="menuProps" type="button" class="company-trigger">
                    <span>{{ nomeEmpresaCurto }}</span>
                    <v-icon icon="mdi-chevron-down" size="18" />
                  </button>
                </template>
                <v-list min-width="260" density="compact">
                  <v-list-item
                    v-for="empresa in empresas"
                    :key="empresa.id"
                    :active="empresa.id === empresaId"
                    :title="empresa.nome"
                    :disabled="carregandoEmpresa"
                    @click="emit('selecionarEmpresa', empresa.id)"
                  />
                </v-list>
              </v-menu>
              <div v-else class="company-name">{{ nomeEmpresaCurto }}</div>
            </div>
          </div>

          <slot name="caixa" :caixa-aberto="caixaAberto" />

          <div class="sidebar-actions">
            <slot name="actions" />
          </div>
        </div>

        <div class="sidebar-scroll-shell">
          <nav class="sidebar-nav" aria-label="Menu principal">
            <template v-for="tela in telas" :key="tela.id">
              <v-tooltip v-if="telasDesabilitadasSet.has(tela.id)" text="E necessario abrir caixa para acessar esta tela.">
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps" class="sidebar-disabled-wrapper">
                    <span class="sidebar-item disabled">
                      <v-icon :icon="tela.icone" size="21" />
                      <span>{{ tela.titulo }}</span>
                    </span>
                  </span>
                </template>
              </v-tooltip>
              <NuxtLink
                v-else
                :to="rotaTela(tela.id)"
                class="sidebar-item"
                :class="{ active: tela.id === telaAtiva }"
              >
                <v-icon :icon="tela.icone" size="21" />
                <span>{{ tela.titulo }}</span>
              </NuxtLink>
            </template>
          </nav>
        </div>

        <div class="sidebar-bottom">
          <v-btn
            v-if="drawerRecolhido"
            icon="mdi-logout"
            variant="tonal"
            :loading="saindo"
            :title="'Sair'"
            @click="emit('logout')"
          />
          <v-btn v-else block prepend-icon="mdi-logout" variant="tonal" :loading="saindo" @click="emit('logout')">
            Sair
          </v-btn>
        </div>
      </div>
    </v-navigation-drawer>

    <v-main class="padaria-main">
      <header class="padaria-topbar">
        <v-btn
          :icon="drawerRecolhido ? 'mdi-menu-open' : 'mdi-menu'"
          variant="text"
          :title="drawerRecolhido ? 'Expandir menu' : 'Recolher menu'"
          @click="alternarDrawer"
        />
        <div class="topbar-page-id">{{ telaAtual?.titulo ?? "Painel" }}</div>
        <div class="topbar-actions">
          <slot name="heading-actions" />
        </div>
      </header>

      <div class="content-frame">
        <slot />
      </div>
    </v-main>
  </v-layout>
</template>
