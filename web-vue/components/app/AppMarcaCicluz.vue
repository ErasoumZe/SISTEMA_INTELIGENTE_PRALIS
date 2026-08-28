<script setup lang="ts">
/* A MARCA COMPLETA: simbolo animado + a palavra. Existe para ser a MESMA composicao no login e no
   menu aberto — montar a dupla em dois lugares e garantir que elas divirjam na primeira mudanca.

   O RAIL NAO USA ESTE COMPONENTE, e isso e proposital: la cabe so o simbolo, e ele monta o
   `AppLogoAnimada` direto. Um `v-if` aqui para esconder a palavra faria este componente carregar
   uma decisao que nao e dele.

   A PALAVRA VEM DO PNG, RECORTADA POR CSS, e a escolha tem um porque medido. A primeira versao usou
   `cicluz-marca-dark.svg`, que e vetor puro — mas ele tem SO "CICLUZ". Conferi os quatro SVG da
   pasta de referencia, um a um, renderizados: NENHUM tem "Gestao Profissional". A assinatura so
   existe no PNG do lockup completo.
   Entre perder a assinatura e perder o vetor, perde-se o vetor: a marca e "CICLUZ Gestao
   Profissional", e meia marca nao serve.

   O RECORTE NAO CRIA ARQUIVO. Medido no proprio PNG (718x205), o perfil de opacidade por coluna
   mostra uma faixa TOTALMENTE transparente entre x=162 e x=193 — e ali que o simbolo acaba e o
   texto comeca. O corte parte de x=186, dentro dessa faixa, entao nao raspa tinta de nenhum dos
   dois lados. As outras faixas vazias (412-426 e 613-618) sao espacos entre letras.
   As contas de largura e deslocamento sao PERCENTUAIS do proprio recorte, entao a composicao
   escala junto com o container em qualquer tamanho — nao ha pixel cravado.

   ATENCAO AO `escuro`: a palavra tem duas variantes de TINTA, e a escolha e pela superficie atras
   dela, nao pelo tema em si. No login e sempre a clara, porque a tela de entrada abre sempre no
   escuro (D-LOGIN-ESCURO). Na sidebar segue o tema, porque la a superficie inverte. */
withDefaults(
  defineProps<{
    /** Lado do simbolo. Numero = px; string = qualquer comprimento CSS, inclusive `clamp()`. */
    size?: number | string;
    /** 0 a 1,4. Em tamanho pequeno o brilho forte vira borrao — ver os valores calibrados no 69. */
    glowIntensity?: number;
    /** `true` = superficie escura atras, logo a palavra vem em tinta clara. */
    escuro?: boolean;
    /** Largura do bloco da palavra. Aceita `clamp()`, porque cada lugar tem um limite diferente. */
    larguraPalavra?: string;
    /** `empilhada` = simbolo em cima (login). `lateral` = simbolo a esquerda (menu aberto). */
    orientacao?: "empilhada" | "lateral";
  }>(),
  {
    size: 88,
    glowIntensity: 0.22,
    escuro: true,
    larguraPalavra: "clamp(140px, 46%, 176px)",
    orientacao: "empilhada"
  }
);
</script>

<template>
  <!-- O `alt` fica so na palavra, e o simbolo e decorativo: os dois juntos anunciariam a marca
       duas vezes para quem usa leitor de tela. -->
  <div class="marca-cicluz" :class="`marca-cicluz--${orientacao}`">
    <AppLogoAnimada :size="size" :glow-intensity="glowIntensity" />
    <span
      class="marca-cicluz-palavra"
      role="img"
      aria-label="Cicluz Gestão Profissional"
      :style="{ width: larguraPalavra }"
    >
      <img
        :src="escuro ? '/cicluz/logo-cicluz-branca.png' : '/cicluz/logo-cicluz.png'"
        alt=""
        aria-hidden="true"
        width="718"
        height="205"
      />
    </span>
  </div>
</template>

<style scoped>
/* DUAS ORIENTACOES, e nao duas montagens: o menu aberto e o login usam a MESMA composicao, so
   mudando o eixo. Montar a dupla em dois componentes seria garantir que divergissem. */
.marca-cicluz {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
}
.marca-cicluz--empilhada {
  flex-direction: column;
}
/* O travamento horizontal e o que a logo original ja fazia: simbolo a esquerda, e a direita
   "CICLUZ" com a assinatura embaixo — as duas linhas ja vem juntas no recorte do PNG.
   `min-width: 0` na palavra porque e ela que pode encolher; o simbolo tem tamanho proprio. */
.marca-cicluz--lateral {
  flex-direction: row;
  gap: var(--cx-sp-2);
}
.marca-cicluz--lateral .marca-cicluz-palavra {
  min-width: 0;
}
/* O RECORTE. O bloco visivel vai de x=186 a x=718 do PNG, ou seja 532 de 718 de largura, com os
   205 de altura inteiros — as duas linhas do texto entram, que era o ponto.
     largura da imagem   718 / 532 = 134,96%
     deslocamento        186 / 532 =  34,96%  (negativo)
   Percentuais do proprio bloco, entao tudo escala junto e nada fica cravado em pixel. */
.marca-cicluz-palavra {
  display: block;
  overflow: hidden;
  aspect-ratio: 532 / 205;
}
.marca-cicluz-palavra img {
  display: block;
  width: 134.96%;
  height: auto;
  margin-left: -34.96%;
}
</style>
