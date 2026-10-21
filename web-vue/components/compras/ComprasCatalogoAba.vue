<script setup lang="ts">
import type { Opcao } from "~/types/padaria";
import type { ProdutoEstoqueDto } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

// Catalogo fornecedor-produto (R-218 / PROJECT_BRAIN 53). Vinculo criado por Compras nasce
// aprovado; sugestao do fornecedor nasce pendente e so e utilizavel depois da decisao.
//
// A aba carrega e guarda o proprio estado em vez de receber tudo do painel: as duas abas da fundacao
// nao compartilham dado nenhum, e concentrar as duas num componente so passou do limite de tamanho
// do projeto (AGENTS 4.5).
type CatalogoLinha = {
  id: string;
  fornecedorId: string;
  fornecedorNome: string;
  produtoId: string;
  produtoDescricao: string;
  status: "pendente" | "aprovado" | "rejeitado";
  origem: "compras" | "fornecedor";
  precoOfertado: string | null;
};

const props = defineProps<{ empresaId: string; fornecedores: Opcao[]; produtos: ProdutoEstoqueDto[] }>();

const { apiGet, apiPost, apiPut } = useApi();
const catalogo = ref<CatalogoLinha[]>([]);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const sucesso = ref("");
const dialogVinculo = ref(false);
// Erro proprio do dialogo: o alerta do card fica ATRAS do overlay do v-dialog, entao a falha de
// "Vincular produto" (409 de vinculo repetido, por exemplo) era invisivel — o botao parava de girar
// e nada acontecia na frente do operador, que clicava de novo.
const erroVinculo = ref("");
const fornecedorId = ref("");
const produtoId = ref("");
const precoOfertado = ref("");
const statusFiltro = ref<"" | "pendente" | "aprovado" | "rejeitado">("");

const ROTULO_ORIGEM: Record<CatalogoLinha["origem"], string> = { compras: "Compras", fornecedor: "Fornecedor" };
const ROTULO_STATUS: Record<CatalogoLinha["status"], string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado"
};
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moeda = (valor: string) => MOEDA.format(Number(valor));

// Guarda de sequencia: A -> B -> A em cliques rapidos pode fazer a resposta de A chegar depois da
// de B. Sem o token, a lista de A ficaria na tela sob a empresa B.
let requisicao = 0;

async function carregar() {
  if (!props.empresaId) return;
  const token = (requisicao += 1);
  carregando.value = true;
  erro.value = "";
  // Mensagem de sucesso de uma acao na empresa ANTERIOR nao vale para esta.
  sucesso.value = "";
  // Limpo ANTES do await: trocar de empresa (ou falhar a carga da nova) deixava na tela a lista da
  // empresa ANTERIOR junto do alerta de erro — dado de outra empresa parecendo ser desta.
  catalogo.value = [];
  try {
    // O filtro e do SERVIDOR (`status` ja existia no contrato e nunca era usado). Sem ele, as
    // sugestoes pendentes — o unico subconjunto sobre o qual Compras precisa agir — ficavam perdidas
    // no meio de todos os vinculos aprovados.
    const filtro = statusFiltro.value ? `&status=${statusFiltro.value}` : "";
    const itens = await apiGet<CatalogoLinha[]>(
      `/api/compras/catalogo-fornecedores?empresaId=${encodeURIComponent(props.empresaId)}${filtro}`
    );
    if (token !== requisicao) return;
    catalogo.value = itens;
  } catch (causa) {
    if (token !== requisicao) return;
    erro.value = mensagemErro(causa);
  } finally {
    if (token === requisicao) carregando.value = false;
  }
}

function abrirDialogo() {
  erroVinculo.value = "";
  dialogVinculo.value = true;
}

async function adicionarVinculo() {
  if (!fornecedorId.value || !produtoId.value) return;
  salvando.value = true;
  erroVinculo.value = "";
  try {
    await apiPost("/api/compras/catalogo-fornecedores", {
      empresaId: props.empresaId,
      fornecedorId: fornecedorId.value,
      produtoId: produtoId.value,
      precoOfertado: precoOfertado.value ? Number(precoOfertado.value.replace(",", ".")) : null
    });
    dialogVinculo.value = false;
    fornecedorId.value = "";
    produtoId.value = "";
    precoOfertado.value = "";
    erro.value = "";
    // Depois da recarga: `carregar()` limpa `sucesso` para nao arrastar mensagem entre empresas.
    await carregar();
    sucesso.value = "Produto vinculado e aprovado no catálogo.";
  } catch (causa) {
    // Fica no dialogo, que permanece aberto: o operador le o motivo e corrige a selecao.
    erroVinculo.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
  }
}

async function decidir(id: string, status: "aprovado" | "rejeitado") {
  salvando.value = true;
  // Alerta verde de uma acao anterior nao pode conviver com o vermelho desta.
  erro.value = "";
  sucesso.value = "";
  try {
    await apiPut(`/api/compras/catalogo-fornecedores/${id}/decisao`, { empresaId: props.empresaId, status });
    await carregar();
    sucesso.value = status === "aprovado" ? "Sugestão aprovada." : "Sugestão rejeitada.";
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
  }
}

watch([() => props.empresaId, statusFiltro], carregar, { immediate: true });
</script>

<template>
  <div>
    <v-alert v-if="erro" type="error" variant="tonal" closable class="mb-3" @click:close="erro = ''">{{
      erro
    }}</v-alert>
    <v-alert v-if="sucesso" type="success" variant="tonal" closable class="mb-3" @click:close="sucesso = ''">{{
      sucesso
    }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate class="mb-3" />

    <div class="d-flex align-center justify-space-between ga-3 flex-wrap my-3">
      <v-select
        v-model="statusFiltro"
        :items="[
          { titulo: 'Todas as situações', valor: '' },
          { titulo: 'Pendentes', valor: 'pendente' },
          { titulo: 'Aprovados', valor: 'aprovado' },
          { titulo: 'Rejeitados', valor: 'rejeitado' }
        ]"
        item-title="titulo"
        item-value="valor"
        label="Situação"
        density="compact"
        hide-details
        class="filtro-situacao"
      />
      <v-btn prepend-icon="mdi-link-plus" color="primary" @click="abrirDialogo">Vincular produto</v-btn>
    </div>
    <div class="responsive-table-shell">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th>Produto</th>
            <th>Origem</th>
            <th>Status</th>
            <th>Preço ofertado</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="linha in catalogo" :key="linha.id">
            <td>{{ linha.fornecedorNome }}</td>
            <td>{{ linha.produtoDescricao }}</td>
            <td>{{ ROTULO_ORIGEM[linha.origem] }}</td>
            <td>
              <v-chip
                size="small"
                :color="linha.status === 'aprovado' ? 'success' : linha.status === 'rejeitado' ? 'error' : 'warning'"
                >{{ ROTULO_STATUS[linha.status] }}</v-chip
              >
            </td>
            <td>{{ linha.precoOfertado ? moeda(linha.precoOfertado) : "—" }}</td>
            <td class="text-right">
              <template v-if="linha.status === 'pendente'">
                <v-btn
                  icon="mdi-check"
                  size="small"
                  variant="text"
                  color="success"
                  aria-label="Aprovar sugestão do fornecedor"
                  :disabled="salvando"
                  @click="decidir(linha.id, 'aprovado')"
                />
                <v-btn
                  icon="mdi-close"
                  size="small"
                  variant="text"
                  color="error"
                  aria-label="Rejeitar sugestão do fornecedor"
                  :disabled="salvando"
                  @click="decidir(linha.id, 'rejeitado')"
                />
              </template>
            </td>
          </tr>
          <!-- `!erro` junto: com a lista limpa antes do await, um 403 deixava a tela afirmando
             "nenhum vínculo cadastrado" ao lado do alerta vermelho. -->
          <tr v-if="!carregando && !erro && !catalogo.length">
            <td colspan="6" class="text-center text-medium-emphasis py-6">Nenhum vínculo cadastrado.</td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <v-dialog v-model="dialogVinculo" max-width="620">
      <v-card>
        <v-card-title>Vincular produto ao fornecedor</v-card-title>
        <v-card-text class="d-grid ga-3">
          <v-alert v-if="erroVinculo" type="error" variant="tonal">{{ erroVinculo }}</v-alert>
          <v-select v-model="fornecedorId" :items="fornecedores" item-title="nome" item-value="id" label="Fornecedor" />
          <v-autocomplete
            v-model="produtoId"
            :items="produtos"
            item-title="descricao"
            item-value="id"
            label="Produto"
            no-data-text="Nenhum produto disponível"
          />
          <!-- A lista de produtos vem da tela de Pedidos, que a busca com a permissao de estoque.
               Quem tem o catalogo e nao tem estoque abria o seletor vazio sem nenhuma explicacao. -->
          <v-alert v-if="!produtos.length" type="warning" variant="tonal" density="compact">
            Nenhum produto disponível para vincular. Isso acontece quando não há produto cadastrado ou quando seu acesso
            não inclui a visualização de estoque de produtos.
          </v-alert>
          <v-text-field
            v-model="precoOfertado"
            type="number"
            min="0"
            step="0.01"
            label="Preço ofertado (opcional)"
            prefix="R$"
          />
          <v-alert type="info" variant="tonal">
            Vínculos criados por Compras já nascem aprovados. Sugestões futuras do fornecedor ficarão pendentes.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogVinculo = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="salvando" :disabled="!fornecedorId || !produtoId" @click="adicionarVinculo"
            >Salvar</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.filtro-situacao {
  max-width: 220px;
}
</style>
