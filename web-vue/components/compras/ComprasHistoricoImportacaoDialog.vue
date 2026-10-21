<script setup lang="ts">
import type {
  HistoricoAplicacaoDto,
  HistoricoImportacaoDetalheDto,
  HistoricoPendenciaFornecedorDto
} from "@padaria/shared";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

// R-222 (PROJECT_BRAIN/55): a ANALISE de uma planilha. Mostra o que pareou, o que ficou pendente e o que a
// aplicacao faria no catalogo ANTES de gravar. Aplicar grava so as linhas pareadas; o resto pode ser
// resolvido depois (apelido de fornecedor, cadastro novo) e aplicado em seguida, sem duplicar.
const props = defineProps<{
  empresaId: string;
  importacaoId: string | null;
  fornecedores: Opcao[];
  podeCriarFornecedor: boolean;
}>();
const aberto = defineModel<boolean>({ required: true });
const emit = defineEmits<{ alterado: [] }>();

const { apiGet, apiPost } = useApi();
const detalhe = ref<HistoricoImportacaoDetalheDto | null>(null);
const carregando = ref(false);
const acaoEmCurso = ref<string | null>(null);
const erro = ref("");
const sucesso = ref("");
const escolhidos = reactive<Record<string, string | null>>({});
const confirmando = ref<"aplicar" | "cancelar" | HistoricoPendenciaFornecedorDto | null>(null);
let requisicao = 0;

const ROTULO_RESULTADO = {
  correspondencia: "Pareadas",
  fornecedor_nao_encontrado: "Fornecedor sem par",
  produto_nao_encontrado: "Produto sem par",
  ambiguidade: "Ambíguas",
  invalido: "Inválidas"
} as const;
const COR_RESULTADO = {
  correspondencia: "success",
  fornecedor_nao_encontrado: "warning",
  produto_nao_encontrado: "warning",
  ambiguidade: "warning",
  invalido: "error"
} as const;
const resultados = Object.keys(ROTULO_RESULTADO) as Array<keyof typeof ROTULO_RESULTADO>;

const corpo = (extra: Record<string, unknown> = {}) => ({ empresaId: props.empresaId, ...extra });
const base = computed(() => `/api/compras/historico/importacoes/${props.importacaoId}`);
const editavel = computed(() => detalhe.value?.status !== "cancelada");
const aplicavel = computed(
  () => (detalhe.value?.porResultado.correspondencia ?? 0) > (detalhe.value?.totalAplicadas ?? 0)
);

async function carregar() {
  if (!props.importacaoId) return;
  const token = (requisicao += 1);
  carregando.value = true;
  erro.value = "";
  try {
    const lido = await apiGet<HistoricoImportacaoDetalheDto>(
      `${base.value}?empresaId=${encodeURIComponent(props.empresaId)}`
    );
    if (token === requisicao) detalhe.value = lido;
  } catch (causa) {
    if (token === requisicao) erro.value = mensagemErro(causa);
  } finally {
    if (token === requisicao) carregando.value = false;
  }
}

async function executar(nome: string, acao: () => Promise<void>, mensagem?: string) {
  acaoEmCurso.value = nome;
  erro.value = "";
  sucesso.value = "";
  try {
    await acao();
    await carregar();
    emit("alterado");
    if (mensagem) sucesso.value = mensagem;
  } catch (causa) {
    erro.value = mensagemErro(causa);
  } finally {
    acaoEmCurso.value = null;
    confirmando.value = null;
  }
}

const associar = (pendencia: HistoricoPendenciaFornecedorDto) =>
  executar(
    `associar-${pendencia.fornecedorNormalizado}`,
    () =>
      apiPost(
        `${base.value}/fornecedores/associar`,
        corpo({
          fornecedorNormalizado: pendencia.fornecedorNormalizado,
          fornecedorId: escolhidos[pendencia.fornecedorNormalizado]
        })
      ).then(() => undefined),
    `“${pendencia.fornecedorInformado}” associado. O apelido fica para as próximas planilhas.`
  );
const cadastrar = (pendencia: HistoricoPendenciaFornecedorDto) =>
  executar(
    `cadastrar-${pendencia.fornecedorNormalizado}`,
    () =>
      apiPost(
        `${base.value}/fornecedores/cadastrar`,
        corpo({ fornecedorNormalizado: pendencia.fornecedorNormalizado })
      ).then(() => undefined),
    `Fornecedor “${pendencia.fornecedorInformado}” cadastrado e associado.`
  );
const reparear = () =>
  executar("reparear", () => apiPost(`${base.value}/reparear`, corpo()).then(() => undefined), "Pareamento refeito.");
const cancelar = () =>
  executar("cancelar", () => apiPost(`${base.value}/cancelar`, corpo()).then(() => undefined), "Importação cancelada.");
const aplicar = () =>
  executar("aplicar", async () => {
    const aplicada = await apiPost<HistoricoAplicacaoDto>(`${base.value}/aplicar`, corpo());
    sucesso.value = `${aplicada.aplicadas} compra(s) gravada(s); ${aplicada.vinculosCriados} vínculo(s) criado(s), ${aplicada.vinculosAprovados} aprovado(s).`;
  });

watch(
  () => [aberto.value, props.importacaoId] as const,
  ([visivel]) => {
    if (!visivel) return;
    detalhe.value = null;
    sucesso.value = "";
    carregar();
  },
  { immediate: true }
);
</script>

<template>
  <v-dialog v-model="aberto" max-width="960" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2 flex-wrap">
        <span>Importação de histórico</span>
        <v-chip v-if="detalhe" size="small" label>{{ detalhe.nomeArquivo }}</v-chip>
      </v-card-title>
      <v-card-text class="d-grid ga-4">
        <v-alert v-if="erro" type="error" variant="tonal" closable @click:close="erro = ''">{{ erro }}</v-alert>
        <v-alert v-if="sucesso" type="success" variant="tonal" closable @click:close="sucesso = ''">{{
          sucesso
        }}</v-alert>
        <v-progress-linear v-if="carregando && !detalhe" indeterminate />

        <template v-if="detalhe">
          <div class="d-flex flex-wrap ga-2" data-secao="resultados">
            <v-chip
              v-for="resultado in resultados"
              :key="resultado"
              :color="COR_RESULTADO[resultado]"
              label
              size="small"
            >
              {{ ROTULO_RESULTADO[resultado] }}: {{ detalhe.porResultado[resultado] }}
            </v-chip>
            <v-chip label size="small" variant="outlined">Aplicadas: {{ detalhe.totalAplicadas }}</v-chip>
          </div>

          <v-alert v-if="editavel" type="info" variant="tonal" density="compact" data-secao="previa">
            <strong>Ao aplicar</strong>, grava as
            {{ detalhe.porResultado.correspondencia - detalhe.totalAplicadas }} compra(s) pareada(s) ainda não
            aplicada(s) e mexe no catálogo fornecedor–produto: {{ detalhe.previa.criar }} vínculo(s) novo(s)
            aprovado(s), {{ detalhe.previa.aprovar }} pendente(s) passa(m) a aprovado,
            {{ detalhe.previa.jaAprovados }} já aprovado(s) e {{ detalhe.previa.rejeitadosIgnorados }} rejeitado(s) que
            não será(ão) tocado(s). O preço-base não é alterado.
            <ul v-if="detalhe.previa.amostraCriar.length" class="mt-2 ps-4">
              <li v-for="(vinculo, indice) in detalhe.previa.amostraCriar" :key="indice" class="text-body-2">
                {{ vinculo.fornecedor }} — {{ vinculo.produto }} (último custo {{ vinculo.ultimoCusto }})
              </li>
            </ul>
          </v-alert>

          <section v-if="detalhe.fornecedoresPendentes.length" data-secao="fornecedores-pendentes">
            <h3 class="text-subtitle-1 mb-2">
              Fornecedores sem par ({{ detalhe.fornecedoresPendentes.length
              }}{{ detalhe.fornecedoresPendentesTruncado ? "+" : "" }})
            </h3>
            <p v-if="detalhe.fornecedoresPendentesTruncado" class="text-caption text-warning mb-2">
              Mostrando os que mais aparecem. Resolva estes e reabra a importação para ver os demais.
            </p>
            <p class="text-caption text-medium-emphasis mb-2">
              Escolha o fornecedor do cadastro (o nome vira apelido e vale nas próximas planilhas) ou cadastre um novo.
            </p>
            <div
              v-for="pendencia in detalhe.fornecedoresPendentes"
              :key="pendencia.fornecedorNormalizado"
              class="pendencia"
            >
              <div class="pendencia__nome">
                <strong>{{ pendencia.fornecedorInformado }}</strong>
                <span class="text-caption text-medium-emphasis">{{ pendencia.linhas }} linha(s)</span>
              </div>
              <v-autocomplete
                v-model="escolhidos[pendencia.fornecedorNormalizado]"
                :items="fornecedores"
                item-title="nome"
                item-value="id"
                label="Fornecedor do cadastro"
                density="compact"
                hide-details
                clearable
                :disabled="!editavel"
                class="pendencia__campo"
              />
              <v-btn
                size="small"
                variant="tonal"
                :disabled="!editavel || !escolhidos[pendencia.fornecedorNormalizado] || acaoEmCurso !== null"
                :loading="acaoEmCurso === `associar-${pendencia.fornecedorNormalizado}`"
                @click="associar(pendencia)"
                >Associar</v-btn
              >
              <v-btn
                v-if="podeCriarFornecedor"
                size="small"
                variant="text"
                :disabled="!editavel || acaoEmCurso !== null"
                @click="confirmando = pendencia"
                >Cadastrar novo</v-btn
              >
            </div>
          </section>

          <section v-if="detalhe.produtosPendentes.length" data-secao="produtos-pendentes">
            <h3 class="text-subtitle-1 mb-2">
              Produtos sem par ({{ detalhe.produtosPendentes.length
              }}{{ detalhe.produtosPendentesTruncado ? "+" : "" }})
            </h3>
            <p v-if="detalhe.produtosPendentesTruncado" class="text-caption text-warning mb-2">
              Mostrando os que mais aparecem. Ajuste estes e use “Refazer pareamento” para ver os demais.
            </p>
            <p class="text-caption text-medium-emphasis mb-2">
              O pareamento é pelo nome exato (sem acento ou pontuação). Ajuste o nome no cadastro de Produtos e use
              “Refazer pareamento”.
            </p>
            <v-table density="compact">
              <tbody>
                <tr v-for="produto in detalhe.produtosPendentes" :key="produto.produtoNormalizado">
                  <td>{{ produto.produtoInformado }}</td>
                  <td class="text-right text-medium-emphasis">{{ produto.linhas }} linha(s)</td>
                </tr>
              </tbody>
            </v-table>
          </section>

          <section v-if="detalhe.linhasPendentes.length" data-secao="linhas-pendentes">
            <h3 class="text-subtitle-1 mb-2">Linhas inválidas ou ambíguas</h3>
            <v-table density="compact">
              <tbody>
                <tr v-for="linha in detalhe.linhasPendentes" :key="linha.numeroLinha">
                  <td class="text-no-wrap">Linha {{ linha.numeroLinha }}</td>
                  <td>{{ linha.produtoInformado }} · {{ linha.fornecedorInformado }}</td>
                  <td class="text-medium-emphasis">{{ linha.detalhe }}</td>
                </tr>
              </tbody>
            </v-table>
          </section>
        </template>
      </v-card-text>
      <v-card-actions class="flex-wrap">
        <v-btn
          v-if="detalhe && detalhe.status !== 'aplicada' && editavel"
          variant="text"
          color="error"
          :disabled="acaoEmCurso !== null"
          @click="confirmando = 'cancelar'"
          >Cancelar importação</v-btn
        >
        <v-spacer />
        <v-btn variant="text" @click="aberto = false">Fechar</v-btn>
        <v-btn
          variant="tonal"
          :disabled="!editavel || acaoEmCurso !== null"
          :loading="acaoEmCurso === 'reparear'"
          @click="reparear"
          >Refazer pareamento</v-btn
        >
        <v-btn
          color="primary"
          :disabled="!editavel || !aplicavel || acaoEmCurso !== null"
          :loading="acaoEmCurso === 'aplicar'"
          @click="confirmando = 'aplicar'"
          >Aplicar</v-btn
        >
      </v-card-actions>
    </v-card>

    <v-dialog :model-value="confirmando !== null" max-width="480" @update:model-value="confirmando = null">
      <v-card>
        <v-card-title>
          {{
            confirmando === "aplicar"
              ? "Aplicar histórico"
              : confirmando === "cancelar"
                ? "Cancelar importação"
                : "Cadastrar fornecedor"
          }}
        </v-card-title>
        <v-card-text class="text-body-2">
          <template v-if="confirmando === 'aplicar'">
            As compras pareadas entram no histórico e o catálogo fornecedor–produto é atualizado como mostrado. O
            histórico gravado não se apaga, e aplicar de novo não duplica nada.
          </template>
          <template v-else-if="confirmando === 'cancelar'">
            A análise é encerrada e nada é gravado. Esta importação não poderá ser aplicada depois.
          </template>
          <template v-else-if="confirmando">
            Cria o fornecedor <strong>{{ confirmando.fornecedorInformado }}</strong> no cadastro (sem WhatsApp, ativo) e
            associa as {{ confirmando.linhas }} linha(s) a ele.
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmando = null">Voltar</v-btn>
          <v-btn
            color="primary"
            :loading="acaoEmCurso !== null"
            @click="
              confirmando === 'aplicar'
                ? aplicar()
                : confirmando === 'cancelar'
                  ? cancelar()
                  : confirmando && cadastrar(confirmando)
            "
            >Confirmar</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<style scoped>
.pendencia {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--cx-line-soft);
}
.pendencia__nome {
  display: flex;
  flex-direction: column;
  flex: 1 1 200px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.pendencia__campo {
  flex: 1 1 240px;
  min-width: 0;
}
</style>
