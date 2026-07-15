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
  motivosTelasDesabilitadas?: Record<string, string>;
  carregandoEmpresa: boolean;
  saindo: boolean;
}>();

const emit = defineEmits<{
  (event: "selecionarEmpresa", id: string): void;
  (event: "logout"): void;
}>();

const drawerRecolhido = ref(false);
const drawerMobileAberto = ref(false);
const viewportMobile = ref(false);

const { escuro, inicializar: inicializarModoEscuro, alternar: alternarModoEscuro } = useModoEscuro();

const empresaAtiva = computed(
  () => props.empresas.find((empresa) => empresa.id === props.empresaId) ?? props.empresas[0] ?? null
);
const telaAtual = computed(
  () => itemPorTela[props.telaAtiva] ?? props.telas.find((item) => item.id === props.telaAtiva) ?? null
);
const nomeEmpresaCurto = computed(() => empresaAtiva.value?.nome ?? "Empresa");
const caixaAberto = computed(() => props.caixaStatus?.caixaAberto ?? null);
const telasDesabilitadasSet = computed(() => new Set(props.telasDesabilitadas ?? []));
const drawerAberto = computed(() => (viewportMobile.value ? drawerMobileAberto.value : true));
const drawerRail = computed(() => !viewportMobile.value && drawerRecolhido.value);

// Agrupamento apenas VISUAL do menu (nao filtra nem altera permissoes).
// Cada tela permitida cai na sua secao; o que nao estiver mapeado vai para "Geral",
// garantindo que nenhuma tela desapareca.
const SECOES_MENU: { titulo: string; ids: string[] }[] = [
  {
    titulo: "Operacao",
    ids: ["entradas", "despesas", "retiradas", "transferencias", "mercadorias", "fechamento", "pedidos"]
  },
  {
    titulo: "Relatorios",
    ids: [
      "relatorio_vendas",
      "relatorio_produtos",
      "contas_pagar",
      "relatorio_dre",
      "relatorio_faltas",
      "relatorio_advertencias",
      "relatorio_fiscal"
    ]
  },
  {
    titulo: "Cadastros",
    ids: [
      "produtos",
      "grupos",
      "unidades",
      "turnos",
      "formas_pagamento",
      "fornecedores",
      "clientes",
      "colaboradores",
      "pdv",
      "malotes",
      "areas_setores",
      "ficha_tecnica",
      "ingredientes",
      "fiscal_produtos",
      "patrimonio",
      "notas_fiscais"
    ]
  },
  {
    titulo: "Administracao",
    ids: ["empresas", "contas", "usuarios", "permissoes", "integracoes", "aparencia"]
  }
];

const telasAgrupadas = computed(() => {
  const restantes = new Map(props.telas.map((tela) => [tela.id, tela] as const));
  const grupos: { titulo: string; itens: ItemMenu[] }[] = [];
  for (const secao of SECOES_MENU) {
    const itens: ItemMenu[] = [];
    for (const id of secao.ids) {
      const tela = restantes.get(id);
      if (tela) {
        itens.push(tela);
        restantes.delete(id);
      }
    }
    if (itens.length) grupos.push({ titulo: secao.titulo, itens });
  }
  const outras = [...restantes.values()];
  if (outras.length) grupos.push({ titulo: "Geral", itens: outras });
  return grupos;
});

function textoTooltipTela(telaId: string) {
  return props.motivosTelasDesabilitadas?.[telaId] ?? "Tela indisponivel para este perfil.";
}

// Agora quem rola e a area de conteudo (.padaria-main), nao a janela — entao o reset de scroll
// do router nao se aplica. Ao trocar de tela, volta o conteudo ao topo.
watch(
  () => props.telaAtiva,
  () => {
    if (typeof document === "undefined") return;
    document.querySelector(".padaria-main")?.scrollTo({ top: 0 });
  }
);

function alternarDrawer() {
  if (viewportMobile.value) {
    drawerMobileAberto.value = !drawerMobileAberto.value;
    return;
  }
  drawerRecolhido.value = !drawerRecolhido.value;
}

function atualizarDrawerAberto(aberto: boolean) {
  if (viewportMobile.value) drawerMobileAberto.value = aberto;
}

function fecharDrawerMobile() {
  if (viewportMobile.value) drawerMobileAberto.value = false;
}

onMounted(() => {
  // Breakpoints alinhados ao padrao responsivo: <=768 = drawer (overlay),
  // 769-1024 = rail (icones), >1024 = drawer fixo completo.
  const mediaRail = window.matchMedia("(min-width: 769px) and (max-width: 1024px)");
  const mediaMobile = window.matchMedia("(max-width: 768px)");
  const atualizar = () => {
    const mobile = mediaMobile.matches;
    drawerRecolhido.value = mediaRail.matches;
    viewportMobile.value = mobile;
    if (!mobile) drawerMobileAberto.value = false;
  };
  atualizar();
  inicializarModoEscuro();
  mediaRail.addEventListener("change", atualizar);
  mediaMobile.addEventListener("change", atualizar);

  onUnmounted(() => {
    mediaRail.removeEventListener("change", atualizar);
    mediaMobile.removeEventListener("change", atualizar);
  });
});
</script>

<template>
  <v-layout class="padaria-shell">
    <v-navigation-drawer
      :model-value="drawerAberto"
      :permanent="!viewportMobile"
      :temporary="viewportMobile"
      width="300"
      rail-width="72"
      :rail="drawerRail"
      class="padaria-sidebar"
      :class="{ rail: drawerRail }"
      @update:model-value="atualizarDrawerAberto"
    >
      <div class="drawer-shell">
        <div class="drawer-top">
          <button
            type="button"
            class="sidebar-logo-row"
            :title="drawerRecolhido ? 'Expandir menu' : 'Recolher menu'"
            :aria-label="drawerRecolhido ? 'Expandir menu' : 'Recolher menu'"
            @click="alternarDrawer"
          >
            <img :src="'/pralis/logo-pralis.svg'" alt="Padaria Pralis" class="sidebar-logo" />
          </button>
          <div class="sidebar-brand">
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
            <div v-for="grupo in telasAgrupadas" :key="grupo.titulo" class="sidebar-group">
              <div class="sidebar-group-label">{{ grupo.titulo }}</div>
              <template v-for="tela in grupo.itens" :key="tela.id">
                <v-tooltip v-if="telasDesabilitadasSet.has(tela.id)" :text="textoTooltipTela(tela.id)">
                  <template #activator="{ props: tooltipProps }">
                    <span
                      v-bind="tooltipProps"
                      class="sidebar-disabled-wrapper"
                      tabindex="0"
                      role="button"
                      aria-disabled="true"
                      :aria-label="`${tela.titulo} — ${textoTooltipTela(tela.id)}`"
                    >
                      <span class="sidebar-item disabled">
                        <v-icon :icon="tela.icone" :color="tela.cor" size="21" />
                        <span :style="tela.cor ? { color: tela.cor } : undefined">{{ tela.titulo }}</span>
                      </span>
                    </span>
                  </template>
                </v-tooltip>
                <NuxtLink
                  v-else
                  :to="rotaTela(tela.id)"
                  class="sidebar-item"
                  :class="{ active: tela.id === telaAtiva }"
                  @click="fecharDrawerMobile"
                >
                  <v-icon :icon="tela.icone" :color="tela.cor" size="21" />
                  <span :style="tela.cor && tela.id !== telaAtiva ? { color: tela.cor } : undefined">{{
                    tela.titulo
                  }}</span>
                </NuxtLink>
              </template>
            </div>
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
        <!-- No desktop o proprio logo recolhe/expande o menu; no mobile (drawer overlay) ainda
             e preciso um gatilho para abrir. -->
        <v-btn v-if="viewportMobile" icon="mdi-menu" variant="text" title="Abrir menu" @click="alternarDrawer" />
        <div class="topbar-page-id">{{ telaAtual?.titulo ?? "Painel" }}</div>
        <div class="topbar-actions">
          <v-btn
            :icon="escuro ? 'mdi-weather-sunny' : 'mdi-weather-night'"
            variant="text"
            :title="escuro ? 'Tema claro' : 'Tema escuro'"
            :aria-label="escuro ? 'Ativar tema claro' : 'Ativar tema escuro'"
            @click="alternarModoEscuro"
          />
          <slot name="heading-actions" />
        </div>
      </header>

      <div class="content-frame">
        <slot />
      </div>
    </v-main>
  </v-layout>
</template>
