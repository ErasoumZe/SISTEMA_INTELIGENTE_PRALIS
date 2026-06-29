<script setup lang="ts">
const route = useRoute();

const tela = computed(() => String(route.params.tela || "entradas"));
const tipoPagina = computed(() => {
  if (["entradas", "transferencias", "despesas", "mercadorias", "retiradas"].includes(tela.value)) return "operacoes";
  if (tela.value === "caixa") return "caixa";
  if (tela.value === "fechamento") return "fechamento";
  if (tela.value === "relatorio_produtos") return "relatorio_produtos";
  if (tela.value === "relatorio_vendas") return "relatorio_vendas";
  if (tela.value === "contas_pagar") return "contas_pagar";
  if (["grupos", "areas_setores"].includes(tela.value)) return "tree";
  if (
    [
      "empresas",
      "contas",
      "unidades",
      "usuarios",
      "permissoes",
      "colaboradores",
      "fornecedores",
      "clientes",
      "produtos",
      "pdv",
      "formas_pagamento",
      "malotes"
    ].includes(tela.value)
  )
    return "cadastro";
  return "placeholder";
});
</script>

<template>
  <DashboardPanel :tela-inicial="tela" :tipo-pagina="tipoPagina" />
</template>
