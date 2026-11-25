<script setup lang="ts">
import { temPermissao } from "@padaria/shared";
import type { Permissao } from "@padaria/shared";
import { mensagemErro, permissoes } from "~/utils/domain";
import { filtrarFornecedores, fornecedorPendente } from "~/utils/fornecedores-pendentes";
import AppWorkspace from "~/components/app/AppWorkspace.vue";
import CadastroTablePage from "~/components/cadastros/CadastroTablePage.vue";

// Doc 59: sem WhatsApp o pedido não vai sozinho; a lista de pendentes é o ponto de partida de quem compra.
const busca = ref("");
const filtroWhatsapp = ref<"todos" | "com" | "sem">("todos");
const filtroSituacao = ref<"todos" | "ativos" | "inativos">("todos");

// Exclusão (25/11/2026): sai junto a "compra sem efeito" (cotações e pedidos nunca recebidos). Com
// dinheiro, estoque ou histórico de preço a API responde 409 e a mensagem orienta marcar como inativo.
type Linha = Record<string, string | undefined>;
type ContextoExclusao = {
  empresaId: string;
  notificar: (mensagem: string, cor?: "success" | "error") => void;
  recarregarDadosCadastro: () => Promise<void> | void;
};
const { apiDelete } = useApi();
const paraExcluir = ref<{ linha: Linha; ctx: ContextoExclusao } | null>(null);
const excluindoId = ref("");

const podeExcluir = (permissoesUsuario: Permissao[] | undefined) =>
  temPermissao(permissoesUsuario ?? [], "cadastro_fornecedores_excluir");

async function confirmarExclusao() {
  const alvo = paraExcluir.value;
  if (!alvo?.linha.id) return;
  excluindoId.value = alvo.linha.id;
  try {
    await apiDelete(
      `/api/fornecedores/${encodeURIComponent(alvo.linha.id)}?empresaId=${encodeURIComponent(alvo.ctx.empresaId)}`
    );
    alvo.ctx.notificar(`"${alvo.linha.nome ?? "Fornecedor"}" excluído.`);
    paraExcluir.value = null;
    await alvo.ctx.recarregarDadosCadastro();
  } catch (erro) {
    alvo.ctx.notificar(mensagemErro(erro), "error");
    paraExcluir.value = null;
  } finally {
    excluindoId.value = "";
  }
}
</script>

<template>
  <AppWorkspace tela-inicial="fornecedores" tipo-pagina="cadastro" v-slot="ctx">
    <div class="fornecedores__filtro">
      <v-text-field
        v-model="busca"
        label="Buscar fornecedor"
        placeholder="Nome, documento, WhatsApp ou categoria"
        prepend-inner-icon="mdi-magnify"
        clearable
        density="compact"
        hide-details
        class="fornecedores__busca"
      />
      <v-select
        v-model="filtroWhatsapp"
        label="WhatsApp"
        :items="[
          { title: 'Todos', value: 'todos' },
          { title: 'Com WhatsApp', value: 'com' },
          { title: `Sem WhatsApp (${ctx.linhasCadastro.filter(fornecedorPendente).length})`, value: 'sem' }
        ]"
        density="compact"
        hide-details
        class="fornecedores__seletor"
      />
      <v-select
        v-model="filtroSituacao"
        label="Situação"
        :items="[
          { title: 'Todos', value: 'todos' },
          { title: 'Ativos', value: 'ativos' },
          { title: 'Inativos', value: 'inativos' }
        ]"
        density="compact"
        hide-details
        class="fornecedores__seletor"
      />
    </div>
    <CadastroTablePage
      tela="fornecedores"
      :tela-atual="ctx.telaAtual"
      :descricao="ctx.descricao"
      :colunas="ctx.colunasCadastro"
      :linhas="filtrarFornecedores(ctx.linhasCadastro, { busca, whatsapp: filtroWhatsapp, situacao: filtroSituacao })"
      :permissoes-filtro="[...permissoes]"
      :pode-excluir="podeExcluir(ctx.sessao?.perfil?.permissoes)"
      excluir-como-icone
      :excluindo-id="excluindoId"
      @acionar="ctx.abrirCadastroNovo"
      @importar="ctx.abrirImportacao"
      @exportar="ctx.abrirExportacao"
      @editar="ctx.abrirCadastroEditar"
      @extra="ctx.lidarExtraCadastro"
      @excluir="paraExcluir = { linha: $event, ctx }"
    />
    <v-dialog :model-value="paraExcluir !== null" max-width="460" @update:model-value="paraExcluir = null">
      <v-card>
        <v-card-title>Excluir fornecedor</v-card-title>
        <v-card-text class="d-grid ga-3">
          <p>
            Excluir <strong>{{ paraExcluir?.linha.nome }}</strong> do cadastro? Saem junto o catálogo de produtos dele,
            as cotações e os pedidos que nunca foram recebidos. Não dá para desfazer.
          </p>
          <p class="text-medium-emphasis text-body-2">
            Se ele tiver despesa, mercadoria, retirada, nota fiscal, histórico de preço ou pedido já recebido, o sistema
            não exclui: nesse caso edite e marque como inativo.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="Boolean(excluindoId)" @click="paraExcluir = null">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="Boolean(excluindoId)" @click="confirmarExclusao">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppWorkspace>
</template>

<style scoped>
.fornecedores__filtro {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-2) var(--cx-sp-3) 0;
}
.fornecedores__busca {
  flex: 1 1 280px;
}
.fornecedores__seletor {
  flex: 1 1 170px;
  max-width: 240px;
}
@media (max-width: 600px) {
  .fornecedores__seletor {
    max-width: none;
  }
}
</style>
