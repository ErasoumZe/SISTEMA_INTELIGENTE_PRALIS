<script setup lang="ts">
import type { Opcao } from "~/types/padaria";
import type { ProdutoEstoqueDto } from "@padaria/shared";

// Casca da fundacao do novo Compras (feature flag COMPRAS_NOVO_FLUXO). Cada aba e dona do proprio
// carregamento, estado e erro: elas nao compartilham dado nenhum, e concentrar as duas aqui levava o
// componente a passar do limite de tamanho do projeto (AGENTS 4.5).
const props = defineProps<{
  empresaId: string;
  empresaNome: string;
  fornecedores: Opcao[];
  produtos: ProdutoEstoqueDto[];
  podeCatalogo: boolean;
  podePrecoBase: boolean;
  podeSolicitacoes: boolean;
  podeCriarSolicitacao: boolean;
  podeEditarSolicitacao: boolean;
  podeExcecaoSolicitacao: boolean;
}>();

const aba = ref(props.podeCatalogo ? "catalogo" : props.podePrecoBase ? "precos" : "solicitacoes");
</script>

<template>
  <v-card class="fundacao" variant="outlined">
    <v-card-title class="d-flex align-center ga-3 flex-wrap">
      <v-icon icon="mdi-database-cog-outline" color="primary" />
      <span>Fundação do novo Compras</span>
      <v-spacer />
      <v-chip color="warning" variant="tonal" size="small">feature flag operacional</v-chip>
    </v-card-title>
    <v-card-subtitle>
      Catálogo por fornecedor e preço-base inicial. O fluxo legado permanece disponível abaixo.
    </v-card-subtitle>
    <v-card-text>
      <v-tabs v-model="aba">
        <v-tab v-if="podeCatalogo" value="catalogo">Catálogo fornecedor–produto</v-tab>
        <v-tab v-if="podePrecoBase" value="precos">Preço-base</v-tab>
        <v-tab v-if="podeSolicitacoes" value="solicitacoes">Solicitações</v-tab>
      </v-tabs>
      <!-- Sem `eager`: cada aba so busca quando e aberta. Com `eager`, abrir a tela de Pedidos para
           olhar a fila disparava tambem as tres consultas da fundacao, inclusive a lista de
           precos-base de todos os produtos da empresa. -->
      <v-window v-model="aba">
        <v-window-item v-if="podeCatalogo" value="catalogo">
          <ComprasCatalogoAba :empresa-id="empresaId" :fornecedores="fornecedores" :produtos="produtos" />
        </v-window-item>
        <v-window-item v-if="podePrecoBase" value="precos">
          <ComprasPrecoBaseAba :empresa-id="empresaId" />
        </v-window-item>
        <v-window-item v-if="podeSolicitacoes" value="solicitacoes">
          <ComprasSolicitacoesAba
            :empresa-id="empresaId"
            :empresa-nome="empresaNome"
            :produtos="produtos"
            :fornecedores="fornecedores"
            :pode-criar="podeCriarSolicitacao"
            :pode-editar="podeEditarSolicitacao"
            :pode-excecao="podeExcecaoSolicitacao"
          />
        </v-window-item>
      </v-window>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.fundacao {
  border-color: color-mix(in srgb, var(--cx-brand) 35%, var(--cx-line-soft));
}
</style>
