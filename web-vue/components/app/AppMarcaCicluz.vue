<script setup lang="ts">
/* A MARCA COMPLETA: simbolo animado + a palavra. Existe para ser a MESMA composicao no login e no
   menu aberto — montar a dupla em dois lugares e garantir que elas divirjam na primeira mudanca.

   O RAIL NAO USA ESTE COMPONENTE, e isso e proposital: la cabe so o simbolo, e ele monta o
   `AppLogoAnimada` direto. Um `v-if` aqui para esconder a palavra faria este componente carregar
   uma decisao que nao e dele.

   A PALAVRA E VETOR E A ASSINATURA E TEXTO DE VERDADE. As duas versoes anteriores estavam presas
   entre duas saidas ruins, e as duas eram bitmap:
     1a · so o SVG `cicluz-marca-dark` — vetor nitido, mas ele tem SO "CICLUZ". Meia marca.
     2a · o PNG do lockup recortado por CSS — a marca inteira, mas RASTER. MEDIDO: a 136px de
          largura a assinatura ficava com banda de 8,95px e traco mediano de 1,02px, abaixo do
          menor token de tipo do projeto (`--cx-fs-micro`, 11px). E nao havia largura que salvasse:
          nem no teto do login (176px) o traco passava de 1,32px. Ela nao ficava pequena, ficava
          CINZA — meio pixel de traco vira metade de alfa.

   A terceira saida desfaz a premissa: ela era ilegivel POR SER BITMAP. Pixel escalado nao tem como
   ficar nitido a 9px. Entao "CICLUZ" volta ao vetor (nitido em qualquer tamanho) e "Gestao
   Profissional" vira TEXTO — que escala sem perder traco, e selecionavel, o leitor de tela le, e
   tem contraste medivel de verdade em vez de ser imagem.
   O PNG recortado saiu do projeto, e com ele o recorte em x=186 que precisou ser achado por perfil
   de opacidade.

   A PROPORCAO E CALIBRADA CONTRA A MARCA ORIGINAL, nao escolhida. Medido no PNG (718x205), na
   regiao do texto: "CICLUZ" ocupa 524x104 e a assinatura 426x35. Logo a assinatura vale 0,813 da
   largura do CICLUZ. O `letter-spacing` abaixo existe para bater essa razao — sem ele o texto sai
   estreito demais e o travamento muda de forma.

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
    <!-- O nome sai naturalmente do `alt` mais o texto: o leitor de tela le "Cicluz Gestao
         Profissional" sem `role="img"` nenhum. Antes era uma imagem so, com o nome cravado num
         `aria-label` que podia divergir do que estava desenhado. -->
    <span class="marca-cicluz-texto" :style="{ width: larguraPalavra }">
      <img
        :src="escuro ? '/cicluz/cicluz-palavra.svg' : '/cicluz/cicluz-palavra-escura.svg'"
        alt="Cicluz"
        class="marca-cicluz-palavra"
        width="208"
        height="46"
      />
      <span class="marca-cicluz-assinatura">Gestão Profissional</span>
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
.marca-cicluz--lateral .marca-cicluz-texto {
  min-width: 0;
}
.marca-cicluz-texto {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.marca-cicluz-palavra {
  display: block;
  width: 100%;
  height: auto;
}
/* A ASSINATURA. `--cx-fs-micro` e o piso de tipo do projeto, e e onde ela fica: ela e a linha menor
   da marca, nao um segundo titulo.
   `--cx-ink-soft` e nao `--cx-ink`: na marca original ela e mais leve e mais clara que o "CICLUZ",
   e o token que ja existe para texto secundario e exatamente esse — de quebra ele inverte junto com
   o tema, o que o PNG de duas variantes so fazia trocando de arquivo.
   O `letter-spacing` NAO e gosto: e o que faz a largura bater os 0,813 da marca original, medidos
   no PNG. Sem ele o texto sai estreito e o travamento muda de forma. */
.marca-cicluz-assinatura {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 500;
  letter-spacing: 0.06em;
  line-height: 1.1;
  white-space: nowrap;
}
</style>
