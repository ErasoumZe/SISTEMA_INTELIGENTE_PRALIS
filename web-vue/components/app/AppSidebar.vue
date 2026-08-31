<script setup lang="ts">
/* A coluna de navegacao da casca. EXTRAIDA do AppShell.vue em 27/08/2026 (VIS-E7a), que estava
   com 412 linhas contra o limite de ~400 do 16 R5 — o mesmo limite que o AppWorkspace furou ate
   chegar a 1886 por ninguem ter quebrado a tempo.

   REFATORACAO PURA: zero mudanca de comportamento, de aparencia ou de marcacao renderizada. O que
   era estado local do AppShell virou prop; o que era chamada direta virou evento. A marcacao de
   dentro do `<v-navigation-drawer>` veio inteira, comentarios inclusive.

   O slot `actions` e repassado pelo AppShell com a mesma assinatura. O slot `caixa` SAIU daqui em
   28/08/2026: o aviso de caixa subiu para a topbar por decisao do Marco, e com ele foram embora a
   prop `caixaAberto` e o escopo `caixa-aberto`, que nao tinham mais quem os consumisse. */
import type { ItemMenu } from "~/types/padaria";
import AppMenuItem from "~/components/app/AppMenuItem.vue";
import { agruparTelasMenu } from "~/utils/menu";
import { CATEGORIA_POR_SECAO } from "~/utils/cores-categoria";
import { gruposIniciais, idDoGrupo } from "~/utils/sanfona-menu";

const props = defineProps<{
  telas: ItemMenu[];
  telaAtiva: string;
  telasDesabilitadas?: string[];
  motivosTelasDesabilitadas?: Record<string, string>;
  escuro: boolean;
  aberto: boolean;
  rail: boolean;
  recolhido: boolean;
  mobile: boolean;
  /** Acima de 1024px, onde recolher e escolha do usuario e nao imposicao do viewport. */
  podeRecolher: boolean;
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

// Sanfona dos GRUPOS (Entradas, Saidas, Resultados...). O estado vive no `useGruposAbertos`, fora
// da casca, porque a casca remonta a cada rota — o porque completo esta no composable.
//
// O watch reaproveita o estado que ja existe e so ACRESCENTA: registra grupo novo como fechado e
// forca aberto o da tela ativa. Nunca escreve `false` por cima de um `true` que o usuario pos, que e
// a mesma disciplina do watch da categoria logo abaixo.
const { abertos: gruposAbertos, hidratado } = useGruposAbertos();

// `hidratado` entra nas dependencias de proposito: o `sessionStorage` so e lido depois da montagem,
// e o que vem de la tem precedencia sobre o padrao. Sem esta dependencia, a preferencia do usuario
// entraria mas o grupo da tela ativa nao seria reaberto por cima dela.
watch(
  [() => props.telaAtiva, telasAgrupadas, hidratado],
  ([telaAtiva, grupos]) => {
    gruposAbertos.value = gruposIniciais(grupos, telaAtiva, gruposAbertos.value);
  },
  { immediate: true }
);

function grupoAberto(titulo: string) {
  return gruposAbertos.value[titulo] ?? false;
}

function alternarGrupo(titulo: string) {
  gruposAbertos.value = { ...gruposAbertos.value, [titulo]: !grupoAberto(titulo) };
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
        <div class="sidebar-logo-row">
          <!-- A MARCA ALTERNA O MENU, junto com o chevron. Duas coisas se encontram aqui e as duas
               ficam: o COMPONENTE animado (que substituiu o PNG estatico) e o comportamento de
               recolher (que o `.sidebar-logo-alvo` trouxe).

               UM SUBARVORE SO, com `<component :is>`, em vez de duas copias da marca sob `v-if`.
               Duplicar a marca para so trocar a casca em volta seria garantir que as duas versoes
               divergissem no primeiro ajuste de tamanho ou de brilho.

               O NOME VIVE NA CASCA, e o miolo e sempre `aria-hidden`. Sem isso a marca seria
               anunciada DUAS vezes: o `AppMarcaCicluz` ja carrega `role="img"` com o nome dela por
               dentro. Com a casca nomeada e o miolo escondido, quem usa leitor de tela ouve uma
               coisa so, e ouve a coisa certa em cada caso.

               ACIMA DE 1024px a casca e `<button>` e o nome diz a marca E a acao — "Cicluz Gestao
               Profissional — recolher menu". O chevron ao lado diz so "Recolher menu". Os dois
               fazem a MESMA coisa (afordancia redundante, nao defeito), e e por os nomes serem
               DIFERENTES que quem navega por leitor de tela consegue distinguir um do outro.
               O nome comeca pelo texto da marca, que e o rotulo visivel, como pede a WCAG 2.5.3.

               E SEMPRE BOTAO, nas tres faixas. A versao anterior so o tornava clicavel acima de
               1024px, com o argumento de que abaixo disso recolher nao seria escolha do usuario.
               O argumento estava errado, e o teste mostrou: `drawerRail` e apenas `drawerRecolhido`
               (AppShell.vue:75) — o rail NAO e imposto pelo viewport, entao `alternar` funciona nas
               tres faixas. Medido antes do conserto: a 1000px o alvo era `<div>` e nao havia como
               reabrir o menu; no celular, idem.
               E na faixa do rail e justamente onde ele mais importa, porque ali os rotulos nao
               aparecem e o simbolo e o unico caminho de volta.
               No celular isto tambem fecha o A-03 do roteiro: a gaveta aberta nao tinha NENHUM
               controle visivel para fechar — so o scrim e o Esc, os dois invisiveis.

               O NOME ACOMPANHA A ACAO REAL de cada faixa: no celular a gaveta FECHA, no desktop o
               menu recolhe ou expande. Dizer "recolher" onde a acao e "fechar" seria mentir para
               quem so ouve o nome. -->
          <button
            type="button"
            class="sidebar-logo-alvo"
            :aria-expanded="mobile ? aberto : !rail"
            :aria-label="`Cicluz Gestão Profissional — ${mobile ? 'fechar' : rail ? 'expandir' : 'recolher'} menu`"
            @click="emit('alternar')"
          >
            <span v-if="rail" class="sidebar-logo-simbolo" aria-hidden="true">
              <AppLogoAnimada :size="52" :glow-intensity="0.24" />
            </span>
            <AppMarcaCicluz
              v-else
              orientacao="lateral"
              :size="60"
              :glow-intensity="0.22"
              :escuro="escuro"
              largura-palavra="136px"
              aria-hidden="true"
            />
          </button>
          <!-- O MESMO BOTAO SERVE AS DUAS FAIXAS, e isso e deliberado: no celular ele nao e um
               controle novo, e o mesmo controle aparecendo onde ele faltava. A acao e a mesma
               (`alternar`), entao nao nasce um segundo caminho para fechar a gaveta — nascer um
               segundo seria a origem de os dois divergirem depois.

               NO CELULAR A GAVETA JA FECHAVA pelo simbolo (VIS-F15), e continua fechando. O que
               faltava era AFORDANCIA: nada na tela dizia que dava para tocar ali. A seta diz.

               O NOME E PROPRIO E DIFERENTE do da marca — "Fechar menu" contra "Cicluz Gestao
               Profissional — fechar menu". Dois controles vizinhos com o mesmo nome fazem quem usa
               leitor de tela ouvir a mesma coisa duas vezes sem saber distinguir; e o defeito que
               o VIS-F14 corrigiu no desktop, e ele nao pode voltar pela porta do celular.

               O ICONE MUDA COM A FAIXA porque a ACAO muda: no celular a gaveta FECHA (seta de
               voltar), no desktop o menu recolhe ou expande (chevron). Acima de 1024px nada muda. -->
          <button
            v-if="podeRecolher || mobile"
            type="button"
            class="sidebar-recolher"
            :class="{ 'sidebar-fechar': mobile }"
            :aria-expanded="mobile ? aberto : !rail"
            :title="mobile ? 'Fechar menu' : rail ? 'Expandir menu' : 'Recolher menu'"
            :aria-label="mobile ? 'Fechar menu' : rail ? 'Expandir menu' : 'Recolher menu'"
            @click="emit('alternar')"
          >
            <v-icon :icon="mobile ? 'mdi-arrow-left' : 'mdi-chevron-left'" size="20" />
          </button>
        </div>

        <!-- FAB "+ NOVO" no TOPO da sidebar (Mobills): pill roxo, menu curto de lancamento. -->
        <!-- O slot recebe o `rail` porque quem monta o botao precisa saber se ha rotulo. O escopo
             existia no slot `caixa` pelo mesmo motivo, antes de ele mudar de lugar. -->
        <div class="sidebar-actions">
          <slot name="actions" :rail="rail" />
        </div>
      </div>

      <div class="sidebar-scroll-shell">
        <nav class="sidebar-nav" aria-label="Menu principal">
          <div
            v-for="grupo in telasAgrupadas"
            :key="grupo.titulo"
            class="sidebar-group"
            :style="estiloGrupo(grupo.titulo)"
          >
            <button
              type="button"
              class="sidebar-group-label"
              :class="{ aberto: grupoAberto(grupo.titulo) }"
              :aria-expanded="grupoAberto(grupo.titulo)"
              :aria-controls="idDoGrupo(grupo.titulo)"
              @click="alternarGrupo(grupo.titulo)"
            >
              <span class="sidebar-group-texto">{{ grupo.titulo }}</span>
              <v-icon class="sidebar-group-chevron" icon="mdi-chevron-right" size="16" />
            </button>
            <div
              :id="idDoGrupo(grupo.titulo)"
              class="sidebar-grupo-wrap"
              :class="{ aberto: grupoAberto(grupo.titulo) }"
            >
              <div class="sidebar-grupo-itens">
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
                      <v-tooltip
                        v-if="rail"
                        activator="parent"
                        location="right"
                        :text="no.titulo"
                        :transition="false"
                      />
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
            </div>
          </div>
        </nav>
      </div>
      <!-- Logout unico: vive no menu do perfil do usuario (topbar). O botao "Sair" da sidebar foi
           removido para nao existir dois caminhos para o mesmo ato (Definition of Done). -->
    </div>
  </v-navigation-drawer>
</template>
