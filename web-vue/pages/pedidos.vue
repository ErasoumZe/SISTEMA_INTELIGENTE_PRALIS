<script setup lang="ts">
import type { AuthSession, PedidoDto, PedidoRecorrencia } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";

const router = useRouter();
const { apiGet, apiPost, carregarSessao } = useApi();

const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregando = ref(true);
const empresaCarregando = ref(false);
const erro = ref("");
const snackbar = reactive({ show: false, text: "", color: "success" });

const pedidos = ref<PedidoDto[]>([]);
const detalhe = ref<PedidoDto | null>(null);
const dialogDetalhe = ref(false);
const gerando = ref(false);
const salvandoManual = ref(false);
const aprovandoId = ref("");

const recorrencias: Array<{ value: PedidoRecorrencia; label: string }> = [
  { value: "nenhuma", label: "Sem recorrencia" },
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" }
];

const formManual = reactive({
  recorrencia: "nenhuma" as PedidoRecorrencia,
  dataAgendada: "",
  observacao: "",
  itens: [{ produtoId: "", quantidade: "1" }]
});
const gerarConfig = reactive({ recorrencia: "nenhuma" as PedidoRecorrencia, dataAgendada: "" });

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeCriar = computed(() => temPermissao("pedidos_criar"));
const podeAprovar = computed(() => temPermissao("pedidos_aprovar"));

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

function corStatus(status: string) {
  if (status === "aprovado") return "success";
  if (status === "cancelado") return "error";
  return "warning";
}

async function carregarEmpresas() {
  empresas.value = await apiGet<Opcao[]>("/api/empresas");
  empresaId.value =
    sessao.value?.perfil?.empresaId ?? sessao.value?.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
}

async function carregarDados() {
  if (!empresaId.value) return;
  empresaCarregando.value = true;
  try {
    // Produtos NAO sao mais carregados aqui: o ProdutoAutocomplete busca no servidor conforme se
    // digita, em vez de depender de uma lista pre-carregada (que vinha cortada na primeira pagina).
    const query = `?empresaId=${empresaId.value}`;
    pedidos.value = await apiGet<PedidoDto[]>(`/api/pedidos${query}`);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    empresaCarregando.value = false;
  }
}

async function trocarEmpresa(id: string) {
  empresaId.value = id;
  await carregarDados();
}

function payloadAgendamento(config: { recorrencia: PedidoRecorrencia; dataAgendada: string }) {
  return {
    recorrencia: config.recorrencia,
    dataAgendada: config.dataAgendada || null
  };
}

async function gerarAutomatico() {
  gerando.value = true;
  try {
    const resposta = await apiPost<{ id: string; totalItens: number }>("/api/pedidos/gerar-automatico", {
      empresaId: empresaId.value,
      ...payloadAgendamento(gerarConfig)
    });
    notificar(`Pedido automatico gerado com ${resposta.totalItens} item(ns).`);
    await carregarDados();
    await verPedido(resposta.id);
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    gerando.value = false;
  }
}

function adicionarItem() {
  formManual.itens.push({ produtoId: "", quantidade: "1" });
}
function removerItem(indice: number) {
  formManual.itens.splice(indice, 1);
  if (!formManual.itens.length) adicionarItem();
}

async function salvarManual() {
  const itens = formManual.itens
    .filter((item) => item.produtoId && Number(item.quantidade) > 0)
    .map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade) }));
  if (!itens.length) {
    notificar("Adicione ao menos um produto com quantidade.", "error");
    return;
  }
  salvandoManual.value = true;
  try {
    await apiPost<{ id: string }>("/api/pedidos", {
      empresaId: empresaId.value,
      observacao: formManual.observacao || null,
      ...payloadAgendamento(formManual),
      itens
    });
    notificar("Pedido manual criado.");
    formManual.itens = [{ produtoId: "", quantidade: "1" }];
    formManual.observacao = "";
    await carregarDados();
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoManual.value = false;
  }
}

async function verPedido(id: string) {
  try {
    detalhe.value = await apiGet<PedidoDto>(`/api/pedidos/${id}`);
    dialogDetalhe.value = true;
  } catch (error) {
    notificar(mensagemErro(error), "error");
  }
}

async function aprovar(id: string) {
  aprovandoId.value = id;
  try {
    await apiPost(`/api/pedidos/${id}/aprovar`, {});
    notificar("Pedido aprovado.");
    await carregarDados();
    if (detalhe.value?.id === id) detalhe.value = { ...detalhe.value, status: "aprovado" };
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    aprovandoId.value = "";
  }
}

// (Edicao de itens em rascunho: PUT /api/pedidos/:id existe no back; UI fica para o V2.)

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!temPermissao("pedidos_visualizar")) {
      erro.value = "Sem permissao para acessar esta pagina.";
      return;
    }
    await carregarEmpresas();
    await carregarDados();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <v-progress-linear v-if="carregando" indeterminate />

  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="pedidos"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="empresaCarregando"
    @selecionar-empresa="trocarEmpresa"
  >
    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

    <div v-else class="d-grid ga-4">
      <div class="d-flex flex-wrap align-center justify-space-between ga-3">
        <div>
          <h1 class="text-h5 font-weight-bold">Pedidos de reposicao</h1>
          <p class="text-body-2 text-medium-emphasis">Compra/reposicao de estoque (manual e automatico).</p>
        </div>
      </div>

      <v-card v-if="podeCriar" variant="tonal">
        <v-card-title class="text-subtitle-1">Gerar pedido automatico</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            Cria um pedido com os produtos que atingiram o estoque minimo, na quantidade que enche ate o maximo.
          </p>
          <v-row dense align="center">
            <v-col cols="12" md="4">
              <v-select
                v-model="gerarConfig.recorrencia"
                :items="recorrencias"
                item-title="label"
                item-value="value"
                label="Recorrencia"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                v-model="gerarConfig.dataAgendada"
                type="datetime-local"
                label="Data/hora agendada (opcional)"
                density="comfortable"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-btn color="primary" :loading="gerando" prepend-icon="mdi-cog-sync" @click="gerarAutomatico">
                Gerar automatico
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card v-if="podeCriar">
        <v-card-title class="text-subtitle-1">Novo pedido manual</v-card-title>
        <v-card-text>
          <v-row v-for="(item, indice) in formManual.itens" :key="`item-${indice}`" dense align="center">
            <v-col cols="12" md="7">
              <!-- Busca remota: o seletor deixou de depender da lista pre-carregada, que estava
                   presa a primeira pagina da API. -->
              <ProdutoAutocomplete v-model="item.produtoId" :empresa-id="empresaId" />
            </v-col>
            <v-col cols="8" md="4">
              <v-text-field v-model="item.quantidade" type="number" min="0" label="Quantidade" density="comfortable" />
            </v-col>
            <v-col cols="4" md="1" class="d-flex justify-end">
              <v-btn icon="mdi-delete" variant="text" @click="removerItem(indice)" />
            </v-col>
          </v-row>
          <div class="d-flex flex-wrap ga-3 mt-2">
            <v-btn variant="outlined" size="small" prepend-icon="mdi-plus" @click="adicionarItem">Adicionar item</v-btn>
            <v-spacer />
            <v-select
              v-model="formManual.recorrencia"
              :items="recorrencias"
              item-title="label"
              item-value="value"
              label="Recorrencia"
              density="comfortable"
              style="max-width: 200px"
            />
            <v-text-field
              v-model="formManual.dataAgendada"
              type="datetime-local"
              label="Data/hora (opcional)"
              density="comfortable"
              style="max-width: 220px"
            />
            <v-btn color="primary" :loading="salvandoManual" prepend-icon="mdi-content-save" @click="salvarManual">
              Criar pedido
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-title class="text-subtitle-1">Pedidos</v-card-title>
        <v-card-text>
          <div class="responsive-table-shell">
            <v-table density="comfortable">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th class="text-right">Itens</th>
                  <th>Recorrencia</th>
                  <th>Agendado</th>
                  <th class="text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!pedidos.length">
                  <td colspan="6" class="text-center text-medium-emphasis">Nenhum pedido encontrado.</td>
                </tr>
                <tr v-for="pedido in pedidos" :key="pedido.id">
                  <td>{{ pedido.tipo === "automatico" ? "Automatico" : "Manual" }}</td>
                  <td>
                    <v-chip size="small" :color="corStatus(pedido.status)" variant="flat">{{ pedido.status }}</v-chip>
                  </td>
                  <td class="text-right">{{ pedido.totalItens }}</td>
                  <td>{{ pedido.recorrencia === "nenhuma" ? "-" : pedido.recorrencia }}</td>
                  <td>{{ pedido.dataAgendada ? new Date(pedido.dataAgendada).toLocaleString("pt-BR") : "-" }}</td>
                  <td class="text-right">
                    <v-btn size="small" variant="text" icon="mdi-eye" @click="verPedido(pedido.id)" />
                    <v-btn
                      v-if="podeAprovar && pedido.status === 'rascunho'"
                      size="small"
                      variant="text"
                      color="success"
                      icon="mdi-check"
                      :loading="aprovandoId === pedido.id"
                      @click="aprovar(pedido.id)"
                    />
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="dialogDetalhe" max-width="720">
      <v-card v-if="detalhe">
        <v-card-title class="d-flex align-center justify-space-between">
          <span>Pedido {{ detalhe.tipo === "automatico" ? "automatico" : "manual" }}</span>
          <v-chip size="small" :color="corStatus(detalhe.status)" variant="flat">{{ detalhe.status }}</v-chip>
        </v-card-title>
        <v-card-text>
          <div class="responsive-table-shell">
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th class="text-right">Quantidade</th>
                  <th class="text-right">Estoque (atual/min/max)</th>
                  <th>Fornecedor</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in detalhe.itens ?? []" :key="item.id">
                  <td>{{ item.descricaoProduto }}</td>
                  <td class="text-right">{{ item.quantidade }}</td>
                  <td class="text-right">
                    {{ item.estoqueAtual ?? "-" }} / {{ item.estoqueMin ?? "-" }} / {{ item.estoqueMax ?? "-" }}
                  </td>
                  <td>{{ item.fornecedorNome ?? "-" }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn
            v-if="podeAprovar && detalhe.status === 'rascunho'"
            color="success"
            :loading="aprovandoId === detalhe.id"
            @click="aprovar(detalhe.id)"
          >
            Aprovar
          </v-btn>
          <v-spacer />
          <v-btn variant="text" @click="dialogDetalhe = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
