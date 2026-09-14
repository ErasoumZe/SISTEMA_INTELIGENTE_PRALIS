<script setup lang="ts">
/* anchor: linear.app/DESIGN.md (hierarquia por peso e cor, hairline, sem atmosfera),
   diverge: tipografia Noto Sans e escala --cx-fs-* do 67, que sao decisao de marca deste sistema.

   Cabecalho de tela. Existe para UNIFICAR cinco cabecalhos que ja existiam espalhados — o da
   topbar (removido), o do CadastroTable, o do PlaceholderPage, o do OperacoesPage e o do
   TesourariaCockpit —, nao para criar um sexto. D-04, 26/08: o titulo vive so na pagina.

   O subtitulo e OPCIONAL e nao tem texto proprio: cada tela passa o que ela ja dizia. Inventar
   frase aqui seria inventar produto (AGENTS §4.7).

   O slot `acoes` recebe os botoes que ja pertenciam ao cabeçalho de cada tela; ele nao cria
   acao nenhuma. */
defineProps<{
  titulo: string;
  subtitulo?: string;
}>();
</script>

<template>
  <header class="cabecalho-tela">
    <div class="cabecalho-tela-texto">
      <h1 class="cabecalho-tela-titulo">{{ titulo }}</h1>
      <!-- Slot alem da prop porque um dos cabecalhos unificados (Tesouraria) ja trazia um
           contador dentro do subtitulo. Sem o slot, aquele texto teria de ser recortado — e
           recortar texto de tela de negocio nao e trabalho de acabamento. -->
      <p v-if="$slots.subtitulo || subtitulo" class="cabecalho-tela-subtitulo">
        <slot name="subtitulo">{{ subtitulo }}</slot>
      </p>
    </div>
    <div v-if="$slots.acoes" class="cabecalho-tela-acoes">
      <slot name="acoes" />
    </div>
  </header>
</template>
