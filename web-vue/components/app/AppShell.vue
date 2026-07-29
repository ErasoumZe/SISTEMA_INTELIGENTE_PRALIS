<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import type { CaixaStatus, ItemMenu, Opcao } from "~/types/padaria";
import { itemPorTela, rotaTela } from "~/utils/domain";
import { agruparTelasMenu } from "~/utils/menu";

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

const telasAgrupadas = computed(() => agruparTelasMenu(props.telas));

// Usuario da topbar (canto direito, estilo Mobills): nome, e-mail e iniciais para o avatar.
const nomeUsuario = computed(() => props.sessao.perfil?.nome ?? props.sessao.user?.name ?? "Usuario");
const emailUsuario = computed(() => props.sessao.user?.email ?? "");
const iniciaisUsuario = computed(() => {
  const partes = nomeUsuario.value.trim().split(/\s+/).filter(Boolean);
  const iniciais = (partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "");
  return iniciais.toUpperCase() || "U";
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
  <v-layout class="padaria-shell shell-mobills">
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

          <!-- FAB "+ NOVO" no TOPO da sidebar (Mobills): pill roxo, menu curto de lancamento. -->
          <div class="sidebar-actions">
            <slot name="actions" />
          </div>

          <slot name="caixa" :caixa-aberto="caixaAberto" />
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
        <!-- Logout unico: vive no menu do perfil do usuario (topbar). O botao "Sair" da sidebar foi
             removido para nao existir dois caminhos para o mesmo ato (Definition of Done). -->
      </div>
    </v-navigation-drawer>

    <v-main class="padaria-main">
      <header class="padaria-topbar">
        <!-- ESQUERDA: no desktop o proprio logo recolhe/expande o menu; no mobile (drawer overlay)
             ainda e preciso um gatilho para abrir. -->
        <div class="topbar-left">
          <v-btn v-if="viewportMobile" icon="mdi-menu" variant="text" title="Abrir menu" @click="alternarDrawer" />
          <div class="topbar-page-id">{{ telaAtual?.titulo ?? "Painel" }}</div>
        </div>

        <!-- DIREITA: empresa + tema + usuario. -->
        <div class="topbar-actions">
          <v-menu v-if="empresas.length > 1" location="bottom end">
            <template #activator="{ props: menuProps }">
              <button v-bind="menuProps" type="button" class="topbar-empresa" aria-label="Trocar de empresa">
                <v-icon icon="mdi-domain" size="18" />
                <span>{{ nomeEmpresaCurto }}</span>
                <v-icon icon="mdi-chevron-down" size="16" />
              </button>
            </template>
            <v-list min-width="260" density="compact">
              <v-list-subheader>Empresa ativa</v-list-subheader>
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
          <span v-else class="topbar-empresa estatica">
            <v-icon icon="mdi-domain" size="18" />
            <span>{{ nomeEmpresaCurto }}</span>
          </span>

          <v-btn
            :icon="escuro ? 'mdi-weather-sunny' : 'mdi-weather-night'"
            variant="text"
            :title="escuro ? 'Tema claro' : 'Tema escuro'"
            :aria-label="escuro ? 'Ativar tema claro' : 'Ativar tema escuro'"
            @click="alternarModoEscuro"
          />

          <v-menu location="bottom end">
            <template #activator="{ props: menuProps }">
              <button v-bind="menuProps" type="button" class="topbar-user" :title="nomeUsuario">
                <span class="topbar-avatar">{{ iniciaisUsuario }}</span>
              </button>
            </template>
            <v-list min-width="240" density="compact">
              <v-list-item :title="nomeUsuario" :subtitle="emailUsuario" />
              <v-divider />
              <v-list-item prepend-icon="mdi-logout" title="Sair" :disabled="saindo" @click="emit('logout')" />
            </v-list>
          </v-menu>

          <slot name="heading-actions" />
        </div>
      </header>

      <div class="content-frame">
        <slot />
      </div>
    </v-main>
  </v-layout>
</template>
