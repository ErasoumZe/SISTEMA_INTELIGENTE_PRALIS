<script setup lang="ts">
import { LIMITE_PAGINA_PRECO_BASE } from "@padaria/shared";
import { mensagemErro } from "~/utils/domain";

// Relatorio das linhas que impedem a aplicacao da carga inicial de preco-base.
//
// Existe porque a tela mostrava apenas as CONTAGENS ("Ambiguidades: 3") e desabilitava o botao
// Aplicar. O endpoint de detalhe ja existia e nao era consumido por ninguem, entao o operador via
// que a planilha tinha problema e nao tinha como descobrir QUAL — e a carga inicial e um ato unico,
// que so funciona com a planilha limpa. Sem este relatorio, a Fase 1 nao e usavel com planilha real.
type ItemImportacao = {
  id: string;
  numeroLinha: number;
  codigoInformado: string | null;
  eanInformado: string | null;
  descricaoInformada: string;
  valorInformado: string;
  resultado: "correspondencia" | "ambiguidade" | "nao_encontrado" | "invalido";
  detalhe: string | null;
};
type DetalheImportacao = { id: string; nomeArquivo: string; itens: ItemImportacao[] };

const props = defineProps<{ empresaId: string; importacaoId: string | null; nomeArquivo: string }>();
const aberto = defineModel<boolean>({ required: true });

const { apiGet } = useApi();
const carregando = ref(false);
const erro = ref("");
const itens = ref<ItemImportacao[]>([]);
// Guarda de sequencia. Abrir a importacao 1, fechar e abrir a 2 rapido pode fazer a resposta da 1
// chegar depois: sem o token, as linhas da 1 apareceriam sob o nome da 2.
let requisicao = 0;

const ROTULO_RESULTADO: Record<ItemImportacao["resultado"], string> = {
  correspondencia: "Correspondência",
  ambiguidade: "Ambiguidade",
  nao_encontrado: "Não encontrado",
  invalido: "Inválido"
};

// O filtro e do SERVIDOR (`somentePendencias`): filtrar aqui obrigava o navegador a baixar as
// milhares de linhas corretas para descartar quase todas.
const pendentes = computed(() => itens.value);

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moeda = (valor: string) => MOEDA.format(Number(valor));

async function carregar() {
  if (!aberto.value || !props.importacaoId || !props.empresaId) return;
  const token = (requisicao += 1);
  carregando.value = true;
  erro.value = "";
  // Limpa ANTES do await: sem isso, trocar de importacao mostrava as linhas da anterior enquanto a
  // nova carregava — e, se a nova falhasse, continuava mostrando as da anterior como se fossem dela.
  itens.value = [];
  try {
    const query = `?empresaId=${encodeURIComponent(props.empresaId)}&somentePendencias=true`;
    const detalhe = await apiGet<DetalheImportacao>(
      `/api/compras/precos-base/importacoes/${props.importacaoId}${query}`
    );
    if (token !== requisicao) return;
    itens.value = detalhe.itens ?? [];
  } catch (causa) {
    if (token !== requisicao) return;
    erro.value = mensagemErro(causa);
  } finally {
    if (token === requisicao) carregando.value = false;
  }
}

watch([aberto, () => props.importacaoId], carregar, { immediate: true });
</script>

<template>
  <v-dialog v-model="aberto" max-width="900" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-3 flex-wrap">
        <v-icon icon="mdi-alert-decagram-outline" color="warning" />
        <span>Linhas a corrigir</span>
        <v-chip size="small" variant="tonal">{{ nomeArquivo }}</v-chip>
      </v-card-title>
      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
        <v-progress-linear v-if="carregando" indeterminate class="mb-4" />
        <v-alert v-if="!carregando && !erro && !pendentes.length" type="success" variant="tonal">
          Nenhuma pendência nesta análise: todas as linhas casaram com um produto.
        </v-alert>
        <template v-if="pendentes.length">
          <p class="text-body-2 text-medium-emphasis mb-4">
            Corrija o código, o código de barras ou a descrição do produto no cadastro — ou a própria planilha — e envie
            o arquivo novamente. A carga inicial só pode ser aplicada sem pendências.
          </p>
          <div class="responsive-table-shell">
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Descrição na planilha</th>
                  <th>Código</th>
                  <th>Cód. barras</th>
                  <th>Custo</th>
                  <th>Situação</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pendentes" :key="item.id">
                  <td>{{ item.numeroLinha }}</td>
                  <td>{{ item.descricaoInformada }}</td>
                  <td>{{ item.codigoInformado ?? "—" }}</td>
                  <td>{{ item.eanInformado ?? "—" }}</td>
                  <td>{{ moeda(item.valorInformado) }}</td>
                  <td>{{ ROTULO_RESULTADO[item.resultado] }}</td>
                  <td class="text-medium-emphasis">{{ item.detalhe ?? "—" }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>
          <p v-if="pendentes.length >= LIMITE_PAGINA_PRECO_BASE" class="text-caption text-medium-emphasis mt-3">
            Mostrando as primeiras {{ LIMITE_PAGINA_PRECO_BASE }} pendências. Corrija estas e analise a planilha
            novamente para ver as demais.
          </p>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
