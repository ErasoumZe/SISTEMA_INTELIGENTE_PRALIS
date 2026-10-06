<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import type { Notificacao } from "@padaria/shared/notificacoes";
import type { CaixaStatus, ItemMenu, Opcao } from "~/types/padaria";
import AppSidebar from "~/components/app/AppSidebar.vue";
import AppMobileBottomNav from "~/components/app/AppMobileBottomNav.vue";
import { dinheiro, itemPorTela } from "~/utils/domain";
import { lerRelogio, type Relogio } from "~/utils/saudacao";
import { CATEGORIA_POR_TELA } from "~/utils/cores-categoria";
import { limitarNotificacoesDoSino } from "~/utils/notificacoes";

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
  notificacoes?: Notificacao[];
  acoesNovoIds?: string[];
}>();

const emit = defineEmits<{
  (event: "selecionarEmpresa", id: string): void;
  (event: "abrirPendencias"): void;
  (event: "verificarNotificacao", id: string): void;
  (event: "verificarTodasNotificacoes"): void;
  (event: "abrirSaidas"): void;
  (event: "abrirTransferencias"): void;
}>();

const drawerRecolhido = ref(false);
const drawerMobileAberto = ref(false);
const viewportMobile = ref(false);
// De 769 a 1024 o menu nasce em rail, mas o controle unico continua permitindo expandi-lo; em
// <=768 ele abre/fecha como gaveta e, acima de 1024, recolher e uma escolha do usuario.
const saindo = ref(false);
const router = useRouter();
const rota = useRoute();
// Verdade sobre "estou no painel" vem da ROTA, e nao de `telaAtiva`: o botao aponta para "/", entao
// quem responde se ele ja esta no destino e o proprio caminho atual.
const naHome = computed(() => rota.path === "/");
const telaTemCategoria = computed(() => Boolean(CATEGORIA_POR_TELA[props.telaAtiva]));
const notificacoesRecentes = computed(() => limitarNotificacoesDoSino(props.notificacoes ?? []));

async function sair() {
  saindo.value = true;
  try {
    try {
      await fetch(`${useRuntimeConfig().public.apiUrl || "http://localhost:4100"}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include"
      });
    } catch {
      // A sessao local ainda precisa sair mesmo quando a API estiver indisponivel.
    }
    // O perfil do usuario que sai NAO pode sobreviver ao logout: sem isto, o proximo login na mesma
    // aba reaproveita `sessao`/`workspaceCarregado` do anterior e o sistema avalia permissao errada.
    limparEstadoWorkspace(useNuxtApp().payload.state);
    await router.push("/login");
  } finally {
    saindo.value = false;
  }
}

const { escuro, inicializar: inicializarModoEscuro, alternar: alternarModoEscuro } = useModoEscuro();

const empresaAtiva = computed(
  () => props.empresas.find((empresa) => empresa.id === props.empresaId) ?? props.empresas[0] ?? null
);
const telaAtual = computed(
  () => itemPorTela[props.telaAtiva] ?? props.telas.find((item) => item.id === props.telaAtiva) ?? null
);
const nomeEmpresaCurto = computed(() => empresaAtiva.value?.nome ?? "Empresa");
const caixaAberto = computed(() => props.caixaStatus?.caixaAberto ?? null);
const drawerAberto = computed(() => (viewportMobile.value ? drawerMobileAberto.value : true));
const drawerRail = computed(() => !viewportMobile.value && drawerRecolhido.value);

// Usuario da topbar (canto direito, estilo Mobills): nome, e-mail e iniciais para o avatar.
const nomeUsuario = computed(() => props.sessao.perfil?.nome ?? props.sessao.user?.name ?? "Usuário");
const primeiroNome = computed(() => nomeUsuario.value.trim().split(/\s+/)[0] ?? "");

// O relogio nasce SO NO CLIENTE, e `null` ate montar. Formatar a hora no servidor e reformatar no
// navegador da descompasso de hidratacao garantido: sao dois instantes diferentes, e o Vue acusa.
const relogio = ref<Relogio | null>(null);
let timerRelogio: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  const ler = () => (relogio.value = lerRelogio(new Date()));
  ler();
  // POR MINUTO, nao por segundo, e isso vem do formato: `lerRelogio` devolve HH:mm, entao 59 dos
  // 60 disparos de um intervalo de 1s redesenhariam exatamente os mesmos pixels.
  timerRelogio = setInterval(ler, 60_000);
});
onUnmounted(() => clearInterval(timerRelogio));
const emailUsuario = computed(() => props.sessao.user?.email ?? "");
const iniciaisUsuario = computed(() => {
  const partes = nomeUsuario.value.trim().split(/\s+/).filter(Boolean);
  const iniciais = (partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "");
  return iniciais.toUpperCase() || "U";
});

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

  // A gaveta de <=768px nao fechava no Esc. O `v-navigation-drawer` temporario do Vuetify 3 nao
  // trata a tecla — diferente do `v-dialog`, que trata.
  //
  // MEDIDO com a gaveta aberta em 390px, os tres caminhos de saida:
  //   botao da topbar  COBERTO pela propria gaveta (`document.elementFromPoint` devolve o
  //                    `<img class="sidebar-logo">`), o que e proprio de gaveta em overlay
  //   Esc              nao fazia nada
  //   clique no scrim  fechava
  // Sobrava UM caminho, e para quem navega por teclado, NENHUM: abria a gaveta e nao dispensava.
  // WCAG 2.1.2 (sem armadilha de teclado) e o motivo de isto nao ser cosmetico.
  const aoTeclar = (evento: KeyboardEvent) => {
    if (evento.key !== "Escape") return;
    if (!viewportMobile.value || !drawerMobileAberto.value) return;
    // Dialogo aberto por cima trata o proprio Esc. Sem esta guarda, uma tecla fecharia a gaveta
    // POR BAIXO do dialogo e deixaria o dialogo aberto — o usuario veria a tecla "nao funcionar".
    if (document.querySelector(".v-overlay.v-dialog.v-overlay--active")) return;
    drawerMobileAberto.value = false;
  };
  window.addEventListener("keydown", aoTeclar);

  onUnmounted(() => {
    mediaRail.removeEventListener("change", atualizar);
    mediaMobile.removeEventListener("change", atualizar);
    window.removeEventListener("keydown", aoTeclar);
  });
});
</script>

<template>
  <v-layout class="padaria-shell shell-mobills">
    <!-- A coluna de navegacao vive no AppSidebar.vue desde o VIS-E7a. O que ficou aqui e o que e
         da CASCA: layout, breakpoints, topbar. O estado do drawer continua nascendo aqui porque o
         botao de menu da topbar tambem o alterna — dois donos para um estado seria a origem de um
         descompasso, e o 67 §13.1 documenta o preco disso. -->
    <AppSidebar
      :telas="telas"
      :tela-ativa="telaAtiva"
      :telas-desabilitadas="telasDesabilitadas"
      :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
      :escuro="escuro"
      :aberto="drawerAberto"
      :rail="drawerRail"
      :mobile="viewportMobile"
      @update:aberto="atualizarDrawerAberto"
      @alternar="alternarDrawer"
      @navegar="fecharDrawerMobile"
    >
      <template #actions="{ rail: railAtual }"><slot name="actions" :rail="railAtual" /></template>
    </AppSidebar>

    <v-main class="padaria-main" :class="{ 'com-navegacao-mobile': viewportMobile }">
      <header class="padaria-topbar">
        <!-- ESQUERDA: no desktop o proprio logo recolhe/expande o menu; no mobile (drawer overlay)
             ainda e preciso um gatilho para abrir. -->
        <!-- O `.topbar-page-id` foi REMOVIDO (D-04, 26/08): o titulo da tela vive so na pagina,
             no AppCabecalhoTela. Nao ha duplicidade — um lugar diz o nome da tela, e ele fica
             grande, junto do conteudo que nomeia. Este zona guarda so o gatilho do menu no
             mobile; no desktop ela fica vazia e a topbar sobra para o contexto a direita. -->
        <div class="topbar-left">
          <v-btn v-if="viewportMobile" icon="mdi-menu" variant="text" title="Abrir menu" @click="alternarDrawer" />

          <!-- RELOGIO, DATA E SAUDACAO ocupam a zona que o VIS-10 esvaziou ao tirar o nome da tela
               daqui. Ordem de recolhimento definida por Marco e implementada no CSS: a saudacao sai
               primeiro, a data depois, a hora fica. E a ordem do menos informativo para o mais:
               "Boa tarde" e gentileza, a data se descobre em qualquer lugar, a hora e operacao. -->
          <p v-if="relogio" class="topbar-relogio">
            <!-- O NOME sai num `<span>` proprio porque no celular ele e a primeira coisa a cair: a
                 saudacao cabe, "Boa noite, Diretor" nao. Quem le a tela sabe quem e. -->
            <span class="topbar-saudacao"
              >{{ relogio.saudacao }}<span class="topbar-nome">, {{ primeiroNome }}</span></span
            >
            <span class="topbar-hora">{{ relogio.hora }}</span>
            <span class="topbar-data">{{ relogio.data }}</span>
            <!-- A data curta so aparece onde a longa nao cabe. As duas existem no DOM e o CSS
                 escolhe: trocar o TEXTO por media query exigiria duas fontes de verdade para a
                 mesma data. -->
            <span class="topbar-data-curta">{{ relogio.dataCurta }}</span>
          </p>
        </div>

        <!-- DIREITA: caixa + empresa + painel + tema + sino + avatar. -->
        <div class="topbar-actions">
          <!-- ORDEM DA TOPBAR, definida por Marco: estado operacional (caixa), depois contexto
               (empresa), depois navegacao (painel), depois as ferramentas (tema, sino, avatar).
               A ordem e do MARKUP e nao do `order` do flexbox, de proposito: `order` reordena so o
               visual e deixa o Tab na ordem antiga, o que separa quem enxerga de quem navega por
               teclado (WCAG 2.4.3). Trocando no markup, as duas ordens continuam sendo a mesma.

               O AVISO DE CAIXA era um bloco no topo da sidebar ate hoje. Quem o preenche e o
               AppWorkspace, que e quem tem o status e a permissao — a casca so reserva o lugar. -->
          <slot v-if="!viewportMobile" name="caixa" :caixa-aberto="caixaAberto" />

          <v-menu v-if="!viewportMobile && empresas.length > 1" location="bottom end">
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
          <span v-else-if="!viewportMobile" class="topbar-empresa estatica">
            <v-icon icon="mdi-domain" size="18" />
            <span>{{ nomeEmpresaCurto }}</span>
          </span>

          <!-- Volta ao painel. Fica FORA do v-if/v-else da empresa de proposito: dentro de um dos
               ramos ele sumiria para quem tem uma empresa so.
               `:to` e nao `@click` com push — assim clique do meio, "abrir em nova aba" e teclado
               funcionam, porque continua sendo um link de verdade.
               Ja no painel ele NAO e desabilitado: `disabled` o tiraria da ordem de Tab e do leitor
               de tela justo para quem mais precisa da referencia. `aria-current="page"` e a forma
               padrao de dizer "voce esta aqui", e mantem o controle alcancavel — mesma logica do
               item ativo do menu, que e marcado e nao removido. -->
          <!-- Casa + rotulo. O nome e "Painel", nao "Dashboard": a R-100 manda portugues e o
               sistema chama assim em todo lugar. O rotulo recolhe em tela estreita, mas o
               `aria-label` fica — quem usa leitor de tela nao perde o nome no celular. -->
          <v-btn
            v-if="!viewportMobile"
            to="/"
            variant="text"
            class="topbar-painel"
            prepend-icon="mdi-home-variant"
            title="Ir para o painel"
            aria-label="Ir para o painel"
            :aria-current="naHome ? 'page' : undefined"
          >
            <span class="topbar-painel-rotulo">Painel</span>
          </v-btn>

          <v-btn
            :icon="escuro ? 'mdi-weather-sunny' : 'mdi-weather-night'"
            variant="text"
            :title="escuro ? 'Tema claro' : 'Tema escuro'"
            :aria-label="escuro ? 'Ativar tema claro' : 'Ativar tema escuro'"
            @click="alternarModoEscuro"
          />

          <v-menu location="bottom end" :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <v-badge :content="notificacoes?.length ?? 0" :model-value="Boolean(notificacoes?.length)" color="error">
                <v-btn v-bind="menuProps" icon="mdi-bell-outline" variant="text" aria-label="Notificações" />
              </v-badge>
            </template>
            <v-card min-width="320" max-width="420">
              <v-card-title class="d-flex align-center ga-2 text-subtitle-1">
                <span>Pendências</span>
                <v-spacer />
                <v-btn
                  v-if="notificacoesRecentes.length"
                  size="small"
                  variant="text"
                  prepend-icon="mdi-check-all"
                  title="Marcar todas as pendências como lidas"
                  @click="emit('verificarTodasNotificacoes')"
                >
                  Li tudo
                </v-btn>
              </v-card-title>
              <v-list v-if="notificacoesRecentes.length" lines="three">
                <v-list-item
                  v-for="item in notificacoesRecentes"
                  :key="item.id"
                  :title="item.titulo"
                  class="notificacao-item"
                  @click="emit('abrirPendencias')"
                >
                  <template #subtitle>
                    <span v-if="item.valor != null">{{ dinheiro(item.valor) }} · </span>
                    {{ new Date(item.criadoEm).toLocaleString("pt-BR") }}
                  </template>
                  <template #append>
                    <v-btn
                      icon="mdi-check"
                      size="small"
                      variant="text"
                      title="Marcar como visto"
                      aria-label="Marcar como visto"
                      @click.stop="emit('verificarNotificacao', item.id)"
                    />
                    <v-btn
                      icon="mdi-open-in-new"
                      size="small"
                      variant="text"
                      title="Abrir pendência"
                      @click.stop="emit('abrirPendencias')"
                    />
                  </template>
                </v-list-item>
              </v-list>
              <v-card-text v-else>Nenhuma pendência.</v-card-text>
              <v-card-actions>
                <v-btn to="/pendencias" variant="text">Ver todas</v-btn>
              </v-card-actions>
            </v-card>
          </v-menu>

          <v-menu location="bottom end">
            <template #activator="{ props: menuProps }">
              <button v-bind="menuProps" type="button" class="topbar-user" :title="nomeUsuario">
                <span class="topbar-avatar">{{ iniciaisUsuario }}</span>
              </button>
            </template>
            <v-list min-width="240" density="compact">
              <v-list-item :title="nomeUsuario" :subtitle="emailUsuario" />
              <v-divider />
              <v-list-item prepend-icon="mdi-logout" title="Sair" :disabled="saindo" @click="sair" />
            </v-list>
          </v-menu>

          <slot name="heading-actions" />
        </div>
      </header>

      <!-- `tela-com-cor` e o unico sinal que o CSS tem de que a tela pertence a uma categoria: o
           `--padaria-brand` e injetado em TODA tela (na neutra ele e a marca), entao ele nao serve
           para distinguir. A lista de quem tem cor continua sendo so o `CATEGORIA_POR_TELA`. -->
      <div class="content-frame" :class="{ 'tela-com-cor': telaTemCategoria }">
        <slot />
      </div>
    </v-main>

    <AppMobileBottomNav
      v-if="viewportMobile"
      :telas="telas"
      :tela-ativa="telaAtiva"
      :telas-desabilitadas="telasDesabilitadas"
      :acoes-novo-ids="acoesNovoIds"
      @abrir-saidas="emit('abrirSaidas')"
      @abrir-transferencias="emit('abrirTransferencias')"
    />
  </v-layout>
</template>
