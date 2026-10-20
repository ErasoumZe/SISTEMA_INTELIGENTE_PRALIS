<script setup lang="ts">
import type { Opcao } from "~/types/padaria";
import type { ProdutoEstoqueDto } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

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
type ImportacaoLinha = {
  id: string;
  nomeArquivo: string;
  status: "analisada" | "aplicada" | "cancelada";
  totalLinhas: number;
  totalCorrespondencias: number;
  totalAmbiguidades: number;
  totalNaoEncontrados: number;
  criadoEm: string;
};
type PrecoBaseLinha = {
  id: string;
  produtoDescricao: string;
  produtoCodigo: string | null;
  valor: string;
  origem: "importacao" | "rodada";
  validoDesde: string;
};

const props = defineProps<{
  empresaId: string;
  fornecedores: Opcao[];
  produtos: ProdutoEstoqueDto[];
  podeCatalogo: boolean;
  podePrecoBase: boolean;
}>();

const { apiUrl, apiGet, apiPost, apiPut } = useApi();
const catalogo = ref<CatalogoLinha[]>([]);
const importacoes = ref<ImportacaoLinha[]>([]);
const precos = ref<PrecoBaseLinha[]>([]);
const carregando = ref(false);
const salvando = ref(false);
const erro = ref("");
const sucesso = ref("");
const dialogVinculo = ref(false);
const fornecedorId = ref("");
const produtoId = ref("");
const precoOfertado = ref("");
const arquivoInput = ref<HTMLInputElement | null>(null);
const aba = ref(props.podeCatalogo ? "catalogo" : "precos");

const moeda = (valor: string) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (valor: string) => new Date(valor).toLocaleString("pt-BR");

async function carregar() {
  if (!props.empresaId || (!props.podeCatalogo && !props.podePrecoBase)) return;
  carregando.value = true;
  erro.value = "";
  try {
    const query = `?empresaId=${encodeURIComponent(props.empresaId)}`;
    const tarefas: Promise<void>[] = [];
    if (props.podeCatalogo)
      tarefas.push(
        apiGet<CatalogoLinha[]>(`/api/compras/catalogo-fornecedores${query}`).then(
          (itens) => void (catalogo.value = itens)
        )
      );
    if (props.podePrecoBase) {
      tarefas.push(
        apiGet<ImportacaoLinha[]>(`/api/compras/precos-base/importacoes${query}`).then(
          (itens) => void (importacoes.value = itens)
        )
      );
      tarefas.push(
        apiGet<PrecoBaseLinha[]>(`/api/compras/precos-base${query}`).then((itens) => void (precos.value = itens))
      );
    }
    await Promise.all(tarefas);
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    carregando.value = false;
  }
}

async function adicionarVinculo() {
  if (!fornecedorId.value || !produtoId.value) return;
  salvando.value = true;
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
    sucesso.value = "Produto vinculado e aprovado no catálogo.";
    await carregar();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
  }
}

async function decidir(id: string, status: "aprovado" | "rejeitado") {
  salvando.value = true;
  try {
    await apiPut(`/api/compras/catalogo-fornecedores/${id}/decisao`, { empresaId: props.empresaId, status });
    sucesso.value = status === "aprovado" ? "Sugestão aprovada." : "Sugestão rejeitada.";
    await carregar();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
  }
}

async function enviarPlanilha(evento: Event) {
  const arquivo = (evento.target as HTMLInputElement).files?.[0];
  if (!arquivo) return;
  salvando.value = true;
  erro.value = "";
  try {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(
      `${apiUrl}/api/compras/precos-base/importacoes/analisar-arquivo?empresaId=${encodeURIComponent(props.empresaId)}`,
      { method: "POST", credentials: "include", body: corpo }
    );
    const payload = (await resposta.json()) as { title?: string };
    if (!resposta.ok) throw new Error(payload.title || "Não foi possível analisar a planilha.");
    sucesso.value = "Planilha analisada. Confira as ambiguidades antes de aplicar.";
    await carregar();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
    if (arquivoInput.value) arquivoInput.value.value = "";
  }
}

async function aplicar(importacao: ImportacaoLinha) {
  salvando.value = true;
  try {
    await apiPost(`/api/compras/precos-base/importacoes/${importacao.id}/aplicar`, { empresaId: props.empresaId });
    sucesso.value = "Preço-base inicial aplicado com histórico auditável.";
    await carregar();
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    salvando.value = false;
  }
}

watch(() => props.empresaId, carregar, { immediate: true });
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
      <v-alert v-if="erro" type="error" variant="tonal" closable class="mb-3" @click:close="erro = ''">{{
        erro
      }}</v-alert>
      <v-alert v-if="sucesso" type="success" variant="tonal" closable class="mb-3" @click:close="sucesso = ''">{{
        sucesso
      }}</v-alert>
      <v-progress-linear v-if="carregando" indeterminate class="mb-3" />

      <v-tabs v-model="aba">
        <v-tab v-if="podeCatalogo" value="catalogo">Catálogo fornecedor–produto</v-tab>
        <v-tab v-if="podePrecoBase" value="precos">Preço-base</v-tab>
      </v-tabs>
      <v-window v-model="aba">
        <v-window-item v-if="podeCatalogo" value="catalogo" eager>
          <div class="d-flex justify-end my-3">
            <v-btn prepend-icon="mdi-link-plus" color="primary" @click="dialogVinculo = true">Vincular produto</v-btn>
          </div>
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Produto</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Preço ofertado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="linha in catalogo" :key="linha.id">
                <td>{{ linha.fornecedorNome }}</td>
                <td>{{ linha.produtoDescricao }}</td>
                <td>{{ linha.origem }}</td>
                <td>
                  <v-chip
                    size="small"
                    :color="
                      linha.status === 'aprovado' ? 'success' : linha.status === 'rejeitado' ? 'error' : 'warning'
                    "
                    >{{ linha.status }}</v-chip
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
                      :disabled="salvando"
                      @click="decidir(linha.id, 'aprovado')"
                    />
                    <v-btn
                      icon="mdi-close"
                      size="small"
                      variant="text"
                      color="error"
                      :disabled="salvando"
                      @click="decidir(linha.id, 'rejeitado')"
                    />
                  </template>
                </td>
              </tr>
              <tr v-if="!catalogo.length">
                <td colspan="6" class="text-center text-medium-emphasis py-6">Nenhum vínculo cadastrado.</td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>

        <v-window-item v-if="podePrecoBase" value="precos" eager>
          <div class="d-flex align-center justify-space-between ga-3 flex-wrap my-3">
            <div class="text-body-2 text-medium-emphasis">
              A planilha deve conter “ÚLTIMO MENOR CUSTO” e “DESCRIÇÃO” ou “PRODUTO”.
            </div>
            <v-btn prepend-icon="mdi-file-excel" color="primary" :loading="salvando" @click="arquivoInput?.click()"
              >Analisar .xlsx</v-btn
            >
            <input ref="arquivoInput" class="d-none" type="file" accept=".xlsx" @change="enviarPlanilha" />
          </div>
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Data</th>
                <th>Status</th>
                <th>Correspondências</th>
                <th>Ambiguidades</th>
                <th>Não encontrados</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in importacoes" :key="item.id">
                <td>{{ item.nomeArquivo }}</td>
                <td>{{ dataHora(item.criadoEm) }}</td>
                <td>{{ item.status }}</td>
                <td>{{ item.totalCorrespondencias }}/{{ item.totalLinhas }}</td>
                <td>{{ item.totalAmbiguidades }}</td>
                <td>{{ item.totalNaoEncontrados }}</td>
                <td class="text-right">
                  <v-btn
                    v-if="item.status === 'analisada'"
                    size="small"
                    variant="tonal"
                    :disabled="item.totalAmbiguidades > 0 || item.totalNaoEncontrados > 0 || salvando"
                    @click="aplicar(item)"
                    >Aplicar uma vez</v-btn
                  >
                </td>
              </tr>
              <tr v-if="!importacoes.length">
                <td colspan="7" class="text-center text-medium-emphasis py-6">Nenhuma planilha analisada.</td>
              </tr>
            </tbody>
          </v-table>
          <h3 class="text-subtitle-1 mt-6 mb-2">Preços-base atuais</h3>
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Código</th>
                <th>Valor</th>
                <th>Origem</th>
                <th>Válido desde</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in precos" :key="item.id">
                <td>{{ item.produtoDescricao }}</td>
                <td>{{ item.produtoCodigo ?? "—" }}</td>
                <td>{{ moeda(item.valor) }}</td>
                <td>{{ item.origem }}</td>
                <td>{{ dataHora(item.validoDesde) }}</td>
              </tr>
              <tr v-if="!precos.length">
                <td colspan="5" class="text-center text-medium-emphasis py-6">Ainda não há preço-base aplicado.</td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>
      </v-window>
    </v-card-text>
  </v-card>

  <v-dialog v-model="dialogVinculo" max-width="620">
    <v-card
      ><v-card-title>Vincular produto ao fornecedor</v-card-title
      ><v-card-text class="d-grid ga-3">
        <v-select v-model="fornecedorId" :items="fornecedores" item-title="nome" item-value="id" label="Fornecedor" />
        <v-select v-model="produtoId" :items="produtos" item-title="descricao" item-value="id" label="Produto" />
        <v-text-field
          v-model="precoOfertado"
          type="number"
          min="0"
          step="0.01"
          label="Preço ofertado (opcional)"
          prefix="R$"
        />
        <v-alert type="info" variant="tonal"
          >Vínculos criados por Compras já nascem aprovados. Sugestões futuras do fornecedor ficarão pendentes.</v-alert
        > </v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn variant="text" @click="dialogVinculo = false">Cancelar</v-btn
        ><v-btn color="primary" :loading="salvando" :disabled="!fornecedorId || !produtoId" @click="adicionarVinculo"
          >Salvar</v-btn
        ></v-card-actions
      ></v-card
    >
  </v-dialog>
</template>

<style scoped>
.fundacao {
  border-color: color-mix(in srgb, var(--cx-brand) 35%, var(--cx-line-soft));
}
</style>
