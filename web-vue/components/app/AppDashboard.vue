<script setup lang="ts">
/* anchor: card de numero do Mobills (Temp/mobills.txt §06) — disco chapado com icone branco,
   rotulo em cima, valor embaixo, razao valor/rotulo ~1,4x, rotulo da secao FORA do card.
   diverge: a cor do disco vem das seis categorias que o sistema ja tem, nao de paleta nova; e a
   tipografia e a escala --cx-fs-* do 67.

   A DASHBOARD DEIXA DE SER O MENU. Antes esta pagina listava TODAS as telas permitidas, agrupadas
   por secao — 32 blocos, com sanfona. Era o menu duas vezes, e a D-HOME decidiu em 26/08 que nao
   deveria ser assim. Quatro faixas, e a ultima com CINCO atalhos.

   NADA AQUI E DADO REAL: tudo vem de `utils/dashboard-demo.ts`, num arquivo so, por decisao de
   Marco em 27/08. Nenhum numero cravado neste template.

   AS DUAS REGRAS DE PERMISSAO VIVEM EM `utils/dashboard.ts` e sao testadas la. Aqui e so desenho.
   Elas nao sao detalhe: sem elas, a dashboard mostra "Entradas", "Saldo" e "Vendas" para qualquer
   um que faca login — e vira vazamento de dado financeiro no dia em que o demo for trocado pela
   chamada real. */
import type { Permissao } from "@padaria/shared";
import type { ItemMenu } from "~/types/padaria";
import type { MetricaDemo } from "~/utils/dashboard-demo";
import { FAIXA_DIA, FAIXA_IR_PARA, FAIXA_PRECISA, FAIXA_RELATORIOS } from "~/utils/dashboard-demo";
import { atalhosDoPainel, faixasDeNumeroVisiveis, metricasPermitidas, pontosDaSparkline } from "~/utils/dashboard";
import { dinheiro, rotaTela } from "~/utils/domain";
import { CATEGORIA_POR_TELA } from "~/utils/cores-categoria";

const props = defineProps<{
  /** A MESMA lista que o menu recebe. Nenhuma permissao e recalculada aqui. */
  telas: ItemMenu[];
  temPermissao: (permissao: Permissao) => boolean;
  /** Chega PRONTO do `AppWorkspace`, que e o unico ponto de chamada da regra. */
  ehAdministrador: boolean;
  desabilitadas?: string[];
  motivos?: Record<string, string>;
}>();

/* AS FAIXAS DE NUMERO SAO DE ADMINISTRADOR. Quem nao e nao ve NENHUMA delas — e nao ve cadeado,
   nem estado vazio, nem "voce nao tem acesso". Elas somem e a FAIXA 4 fecha o espaco, que e o
   mesmo comportamento do menu: esconder o que nao e seu em vez de mostrar porta trancada.
   A permissao CONTINUA valendo por cima: ser administrador nao pula o `metricasPermitidas`, so
   decide se a faixa chega a existir. Sao dois filtros em serie, nao um substituindo o outro. */
/* QUEM TEM DESTINO DE VERDADE, decidido pelo ROUTER e nao por uma lista escrita a mao.
 *
 * Lista a mao fica desatualizada no dia em que a tela de DRE nascer, e ninguem lembra de voltar
 * aqui. O router sabe sozinho — mas nao pela pergunta obvia: `pages/[tela].vue` e um CORINGA que
 * casa com QUALQUER caminho e renderiza o `PlaceholderPage`. Entao `/relatorio_dre` "existe" para o
 * router do mesmo jeito que `/caixa`, e perguntar so "a rota resolve?" responderia sim para as
 * duas.
 *
 * O que separa uma da outra e o registro casado: a tela de verdade casa uma rota ESTATICA; a que
 * ainda nao existe casa o parametro `:tela` do coringa. Quando `relatorio_dre.vue` for criado, o
 * `resolve` passa a casar a rota estatica e este teste vira `true` sozinho — sem ninguem editar
 * nada aqui.
 */
const router = useRouter();
function temDestino(telaId: string): boolean {
  const alvo = router.resolve(rotaTela(telaId));
  return alvo.matched.length > 0 && !alvo.matched.some((registro) => registro.path.includes(":tela"));
}

const faixas = computed(() =>
  faixasDeNumeroVisiveis(
    [
      { id: "dia", titulo: "O dia", metricas: metricasPermitidas(FAIXA_DIA, props.temPermissao) },
      { id: "precisa", titulo: "Precisa de você", metricas: metricasPermitidas(FAIXA_PRECISA, props.temPermissao) },
      { id: "relatorios", titulo: "Relatórios", metricas: metricasPermitidas(FAIXA_RELATORIOS, props.temPermissao) }
    ],
    props.ehAdministrador
  )
);

const atalhos = computed(() =>
  atalhosDoPainel(FAIXA_IR_PARA, props.telas, props.desabilitadas ?? [], props.motivos ?? {})
);

/* A cor entra como custom property apontando para o TOKEN, nunca para o hex do modulo — licao do
   VIS-E2a: com hex, o disco ficava com a cor do tema claro tambem no escuro.

   E a variante `faixa`, nao a `base`: `faixa` e a unica das seis escolhida POR MEDICAO para receber
   branco por cima. A `base` reprova — entradas da 2,94:1 com branco, abaixo ate dos 3:1 que o
   67 §11 pede para objeto grafico. O `cores-categoria.ts` ja registra essa medicao. */
/* O BRILHO DE FUNDO usa outra variante que o disco, e a diferenca e o que cada uma foi medida para
   fazer. A `faixa` existe para receber BRANCO POR CIMA — e o fundo do disco, e o contraste dela e
   contra a tinta que ela carrega, nao contra a pagina. Por isso ela nao se redefine no escuro, e
   isso e proposital, nao esquecimento: branco sobre #9e6c03 mede igual nos dois temas.
   Brilho de fundo e o problema OPOSTO: ele tinge a superficie da PAGINA, que inverte. A unica
   variante de categoria que inverte junto e a `tinta` (o `cores-categoria.ts` a devolve como
   `tintaEscura` no escuro), e e por isso que ela e a certa aqui. E o mesmo criterio que o VIS-E6d
   ja usa vivo no arquivo, onde o brilho neutro sai de `--cx-ink-soft`, que tambem inverte.
   Bonus de coerencia: a sidebar ja pinta a categoria do grupo com `tinta` (`--grupo-cor`), entao
   card e menu passam a brilhar com a MESMA variante — "brilho" quer dizer uma coisa so. */
function estiloDisco(categoria: MetricaDemo["categoria"]) {
  return {
    "--disco-cor": `var(--cat-${categoria}-faixa)`,
    "--brilho-cor": `var(--cat-${categoria}-tinta)`
  };
}

function estiloAtalho(id: string) {
  const categoria = CATEGORIA_POR_TELA[id];
  return categoria
    ? { "--disco-cor": `var(--cat-${categoria}-faixa)`, "--brilho-cor": `var(--cat-${categoria}-tinta)` }
    : undefined;
}

/** Travessao para `null`: o painel ainda nao le esse dado. Zero inventado e pior que vazio. */
function escrever(metrica: MetricaDemo) {
  if (metrica.valor === null) return "—";
  return metrica.formato === "dinheiro" ? dinheiro(metrica.valor) : String(metrica.valor);
}
</script>

<template>
  <div class="painel-faixas">
    <!-- Faixa sem nenhum card permitido nao existe — nem o titulo dela. -->
    <template v-for="faixa in faixas" :key="faixa.id">
      <section v-if="faixa.metricas.length" class="faixa" :aria-labelledby="`faixa-${faixa.id}`">
        <h2 :id="`faixa-${faixa.id}`" class="faixa-titulo">{{ faixa.titulo }}</h2>
        <div class="faixa-grade">
          <!-- `clicavel` so quando ha destino REAL. Card que levanta no hover e nao vai a lugar
               nenhum promete e nao entrega — o usuario clica tres vezes achando que travou. -->
          <article
            v-for="m in faixa.metricas"
            :key="m.id"
            class="metrica-card"
            :class="{ clicavel: temDestino(m.telaId) }"
            :style="estiloDisco(m.categoria)"
          >
            <span class="metrica-disco"><v-icon :icon="m.icone" size="24" /></span>
            <span class="metrica-rotulo">{{ m.rotulo }}</span>
            <span class="metrica-valor cx-num" :class="{ vazio: m.valor === null }">{{ escrever(m) }}</span>
            <!-- O nome acessivel diz DE QUE e o "ver mais". Sao nove links iguais na tela, e quem
                 navega por leitor de tela ouvia "Ver mais" nove vezes sem saber de que card era
                 (WCAG 2.4.4). O texto visivel continua curto; o nome e que fica completo, e ele
                 COMECA pelo texto visivel, como pede a 2.5.3. -->
            <NuxtLink class="metrica-mais" :to="rotaTela(m.telaId)" :aria-label="`Ver mais sobre ${m.rotulo}`">
              Ver mais
            </NuxtLink>
            <!-- DECORACAO, e por isso `aria-hidden`: quem usa leitor de tela nao ganha nada em
                 ouvir uma sequencia de numeros sem eixo nem escala, e o dado ja esta no card, no
                 rotulo e no valor. `preserveAspectRatio="none"` para a linha esticar com o card. -->
            <!-- SO DESENHA QUANDO HA DADO. Com `valor: null` o card mostra travessao — "ainda nao
                 leio isso" — e a linha desenhava uma tendencia ascendente do mesmo jeito: o numero
                 dizia uma coisa e o grafico dizia outra. Decoracao nao pode contradizer o dado. -->
            <svg
              v-if="m.valor !== null"
              class="metrica-linha"
              aria-hidden="true"
              viewBox="0 0 100 28"
              preserveAspectRatio="none"
              focusable="false"
            >
              <polyline :points="pontosDaSparkline(m.serie, 100, 28)" />
            </svg>
          </article>
        </div>
      </section>
    </template>

    <section v-if="atalhos.length" class="faixa" aria-labelledby="faixa-ir">
      <h2 id="faixa-ir" class="faixa-titulo">Ir para</h2>
      <nav class="atalhos-linha" aria-label="Atalhos do painel">
        <template v-for="tela in atalhos" :key="tela.id">
          <!-- Desabilitada CONTINUA visivel, com o mesmo motivo do menu. O painel nao pode ensinar
               uma coisa e o menu outra — e uma pilula clicavel para uma tela que o menu mostra
               cinza e pior do que nao mostrar nada. -->
          <v-tooltip v-if="tela.desabilitada" :text="tela.motivo" location="bottom">
            <template #activator="{ props: propsTooltip }">
              <span
                v-bind="propsTooltip"
                class="atalho-pilula disabled"
                tabindex="0"
                role="link"
                aria-disabled="true"
                :aria-label="`${tela.titulo} — ${tela.motivo}`"
                :style="estiloAtalho(tela.id)"
              >
                <span class="atalho-disco"><v-icon :icon="tela.icone" size="18" /></span>
                <span class="atalho-texto">{{ tela.titulo }}</span>
              </span>
            </template>
          </v-tooltip>
          <NuxtLink v-else class="atalho-pilula" :style="estiloAtalho(tela.id)" :to="rotaTela(tela.id)">
            <span class="atalho-disco"><v-icon :icon="tela.icone" size="18" /></span>
            <span class="atalho-texto">{{ tela.titulo }}</span>
          </NuxtLink>
        </template>
      </nav>
    </section>
  </div>
</template>
