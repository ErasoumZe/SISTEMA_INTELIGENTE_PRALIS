<script setup lang="ts">
import type { AuthSession, PedidoDto, PedidoStatus, ProdutoEstoqueDto } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import PedidoDetalheDialog from "~/components/pedidos/PedidoDetalheDialog.vue";
import PedidoFormDialog, { type PedidoFormEdicao } from "~/components/pedidos/PedidoFormDialog.vue";
import PedidoRecebimentoDialog from "~/components/pedidos/PedidoRecebimentoDialog.vue";
import PedidosFila from "~/components/pedidos/PedidosFila.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { itemPorTela, mensagemErro } from "~/utils/domain";
import { normalizarWhatsappParaLink } from "~/utils/formatacao";
import { obterTentativaRecebimento, type TentativaRecebimento } from "~/utils/recebimento-idempotencia";

const router = useRouter();
const { apiGet, apiPost, apiPut, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const fornecedores = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregando = ref(true);
const empresaCarregando = ref(false);
const erro = ref("");
const snackbar = reactive({ show: false, text: "", color: "success" });
const pedidos = ref<PedidoDto[]>([]);
const detalhe = ref<PedidoDto | null>(null);
const dialogDetalhe = ref(false);
const dialogForm = ref(false);
const dialogRecebimento = ref(false);
const pedidoEditandoId = ref("");
const salvando = ref(false);
const gerando = ref(false);
const transicionando = ref(false);
const recebendo = ref(false);
const tentativaRecebimento = ref<TentativaRecebimento | null>(null);
const sugestaoFornecedorId = ref("");
const estoquePorProduto = ref<Record<string, ProdutoEstoqueDto>>({});

function formVazio(): PedidoFormEdicao {
  return {
    fornecedorId: "",
    recorrencia: "nenhuma",
    dataAgendada: "",
    observacao: "",
    itens: [{ produtoId: "", quantidade: "1" }]
  };
}
const form = reactive<PedidoFormEdicao>(formVazio());
const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const podeCriar = computed(() => temPermissao("pedidos_criar"));
const podeEditar = computed(() => temPermissao("pedidos_editar"));
const podeReceber = computed(() => temPermissao("pedidos_aprovar"));

const rotulosStatus: Record<PedidoStatus, string> = {
  rascunho: "Legado: rascunho",
  aprovado: "Legado: aprovado",
  a_fazer: "A fazer",
  enviado: "Enviado",
  retornado: "Retornado",
  confirmado: "Confirmado",
  recebido_parcial: "Recebido parcialmente",
  recebido: "Recebido",
  cancelado: "Cancelado"
};
function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}
function query() {
  return `?empresaId=${empresaId.value}`;
}
function limparForm() {
  Object.assign(form, formVazio());
  pedidoEditandoId.value = "";
}
function payloadDoForm() {
  return {
    fornecedorId: form.fornecedorId,
    recorrencia: form.recorrencia,
    dataAgendada: form.dataAgendada || null,
    observacao: form.observacao || null,
    itens: form.itens
      .filter((item) => item.produtoId && Number(item.quantidade) > 0)
      .map((item) => ({ produtoId: item.produtoId, quantidade: Number(item.quantidade) }))
  };
}
/**
 * Traz TODOS os fornecedores da empresa para o seletor.
 *
 * `/api/fornecedores` pagina em 10 por padrao e aceita no maximo 100 por pagina. Sem paginar, do
 * 11o fornecedor em diante o cadastro existia e simplesmente nao aparecia na hora de montar o
 * pedido — o comprador nao tinha como escolher e nada na tela dizia por que.
 */
async function carregarFornecedores(): Promise<Opcao[]> {
  const todos: Opcao[] = [];
  // Teto de seguranca: 20 paginas de 100. Mais que isso e cadastro fora da realidade da operacao e
  // viraria laco infinito se a API mudasse de contrato.
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const lote = await apiGet<Opcao[]>(`/api/fornecedores${query()}&page=${pagina}&pageSize=100`);
    todos.push(...lote);
    if (lote.length < 100) break;
  }
  return todos;
}

/**
 * Posicao de estoque por produto, para o formulario mostrar saldo, minimo e maximo e antecipar o
 * teto. Vem da rota de Compras, que exige `estoque_produtos_visualizar`; quem nao tem a permissao
 * segue criando pedido normalmente, so sem o contexto na tela. O servidor valida o teto de todo jeito.
 */
async function carregarEstoque(): Promise<Record<string, ProdutoEstoqueDto>> {
  if (!temPermissao("estoque_produtos_visualizar")) return {};
  try {
    const linhas = await apiGet<ProdutoEstoqueDto[]>(`/api/compras/estoque${query()}`);
    return Object.fromEntries(linhas.map((linha) => [linha.id, linha]));
  } catch {
    // Falha aqui nao pode derrubar a tela de Pedidos: o contexto e um apoio, nao um pre-requisito.
    return {};
  }
}

async function carregarDados() {
  if (!empresaId.value) return;
  empresaCarregando.value = true;
  try {
    [pedidos.value, fornecedores.value, estoquePorProduto.value] = await Promise.all([
      apiGet<PedidoDto[]>(`/api/pedidos${query()}`),
      carregarFornecedores(),
      carregarEstoque()
    ]);
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    empresaCarregando.value = false;
  }
}
async function trocarEmpresa(id: string) {
  empresaId.value = id;
  await carregarDados();
}
function abrirNovo() {
  limparForm();
  dialogForm.value = true;
}
function adicionarItem() {
  form.itens.push({ produtoId: "", quantidade: "1" });
}
function removerItem(indice: number) {
  form.itens.splice(indice, 1);
  if (!form.itens.length) adicionarItem();
}
async function salvarPedido() {
  const payload = payloadDoForm();
  if (!payload.fornecedorId || !payload.itens.length)
    return notificar("Informe fornecedor e ao menos um item válido.", "error");
  salvando.value = true;
  try {
    if (pedidoEditandoId.value) await apiPut(`/api/pedidos/${pedidoEditandoId.value}`, payload);
    else await apiPost("/api/pedidos", { empresaId: empresaId.value, ...payload });
    notificar(pedidoEditandoId.value ? "Pedido atualizado." : "Pedido criado em A fazer.");
    dialogForm.value = false;
    await carregarDados();
    if (detalhe.value?.id === pedidoEditandoId.value) await verPedido(detalhe.value.id);
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    salvando.value = false;
  }
}
async function gerarSugestao() {
  if (!sugestaoFornecedorId.value) return notificar("Selecione o fornecedor da sugestão.", "error");
  gerando.value = true;
  try {
    const resposta = await apiPost<{ id: string; totalItens: number }>("/api/pedidos/gerar-sugestao", {
      empresaId: empresaId.value,
      fornecedorId: sugestaoFornecedorId.value,
      recorrencia: "nenhuma",
      dataAgendada: null
    });
    notificar(`Sugestão criada com ${resposta.totalItens} item(ns), em A fazer.`);
    await carregarDados();
    await verPedido(resposta.id);
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    gerando.value = false;
  }
}
async function verPedido(id: string) {
  try {
    detalhe.value = await apiGet<PedidoDto>(`/api/pedidos/${id}`);
    dialogDetalhe.value = true;
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  }
}
function editarPedido(pedido: PedidoDto) {
  pedidoEditandoId.value = pedido.id;
  Object.assign(form, {
    fornecedorId: pedido.fornecedorId ?? "",
    recorrencia: pedido.recorrencia,
    dataAgendada: pedido.dataAgendada ? pedido.dataAgendada.slice(0, 16) : "",
    observacao: pedido.observacao ?? "",
    itens: (pedido.itens ?? []).map((item) => ({ produtoId: item.produtoId ?? "", quantidade: item.quantidade }))
  });
  // Fecha o detalhe antes de abrir o formulario. Dois modais empilhados deixam o operador sem saber
  // em qual esta, e o de tras segue interceptando clique. Ao salvar, o detalhe reabre sozinho.
  dialogDetalhe.value = false;
  dialogForm.value = true;
}

/** Mesma razao do `editarPedido`: a conferencia substitui o detalhe em vez de cobri-lo. */
function abrirRecebimento() {
  dialogDetalhe.value = false;
  dialogRecebimento.value = true;
}
async function mudarSituacao(status: "enviado" | "retornado" | "confirmado" | "cancelado") {
  if (!detalhe.value) return false;
  transicionando.value = true;
  try {
    await apiPost(`/api/pedidos/${detalhe.value.id}/situacao`, { status });
    notificar(`Pedido marcado como ${rotulosStatus[status]}.`);
    await carregarDados();
    await verPedido(detalhe.value.id);
    return true;
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
    return false;
  } finally {
    transicionando.value = false;
  }
}
async function enviarWhatsapp() {
  if (!detalhe.value?.fornecedorWhatsapp)
    return notificar("Cadastre o WhatsApp do fornecedor antes de enviar.", "error");
  const numero = normalizarWhatsappParaLink(detalhe.value.fornecedorWhatsapp);
  if (numero.length < 12 || numero.length > 15)
    return notificar("WhatsApp do fornecedor invalido. Informe DDD e numero.", "error");
  const itens = (detalhe.value.itens ?? []).map((item) => `• ${item.descricaoProduto}: ${item.quantidade}`).join("\n");
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(`Pedido Pralis\n${itens}`)}`;
  const janela = window.open("about:blank", "_blank");
  if (!janela) return notificar("O navegador bloqueou o WhatsApp. Libere pop-ups e tente novamente.", "error");
  janela.opener = null;
  if (!(await mudarSituacao("enviado"))) return void janela.close();
  janela.location.replace(url);
}
function chaveIdempotencia() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/gu, (caractere) => {
    const numero = Math.floor(Math.random() * 16);
    return (caractere === "x" ? numero : (numero & 3) | 8).toString(16);
  });
}
async function confirmarRecebimento(
  itens: Array<{ pedidoItemId: string; quantidadeConferida: number }>,
  observacao: string
) {
  if (!detalhe.value || !itens.length) return notificar("Informe ao menos uma quantidade conferida.", "error");
  tentativaRecebimento.value = obterTentativaRecebimento(
    tentativaRecebimento.value,
    detalhe.value.id,
    itens,
    observacao,
    chaveIdempotencia
  );
  recebendo.value = true;
  try {
    const resposta = await apiPost<{ status: "recebido" | "recebido_parcial" }>(
      `/api/pedidos/${detalhe.value.id}/recebimentos`,
      { idempotenciaChave: tentativaRecebimento.value.chave, observacao: observacao.trim() || null, itens }
    );
    notificar(
      resposta.status === "recebido"
        ? "Recebimento concluído e estoque atualizado."
        : "Recebimento parcial registrado e estoque atualizado."
    );
    dialogRecebimento.value = false;
    tentativaRecebimento.value = null;
    await carregarDados();
    await verPedido(detalhe.value.id);
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    recebendo.value = false;
  }
}

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void (await router.push("/login"));
    if (!temPermissao("pedidos_visualizar")) return void (erro.value = "Sem permissão para acessar pedidos.");
    empresas.value = sessao.value.empresas?.length ? sessao.value.empresas : await apiGet<Opcao[]>("/api/empresas");
    empresaId.value =
      sessao.value.perfil?.empresaId ?? sessao.value.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
    await carregarDados();
  } catch (causa) {
    erro.value = mensagemErro(causa);
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
    <div class="d-grid ga-4">
      <AppCabecalhoTela
        :titulo="itemPorTela.pedidos?.titulo ?? ''"
        subtitulo="Fluxo único: sugestão, pedido, fornecedor, negociação e recebimento físico."
      /><v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
      <!-- Os dois unicos jeitos de gerar pedido ficam lado a lado e com o mesmo peso visual: antes a
      sugestao era um cartao largo e o pedido manual um botao solto no canto, o que fazia parecer
      que havia um caminho principal e um atalho escondido. -->
      <div v-if="podeCriar" class="pedidos-acoes">
        <v-card class="pedidos-acao" variant="outlined">
          <v-card-text class="pedidos-acao__corpo">
            <div class="pedidos-acao__cabecalho">
              <v-avatar color="primary" variant="tonal" size="36"><v-icon icon="mdi-auto-fix" /></v-avatar>
              <div>
                <h3 class="text-subtitle-1 font-weight-medium">Sugestão de reposição</h3>
                <p class="text-caption text-medium-emphasis mb-0">
                  Produto no mínimo é sugerido até o máximo. Você revisa antes de enviar.
                </p>
              </div>
            </div>
            <div class="pedidos-acao__controles">
              <v-select
                v-model="sugestaoFornecedorId"
                :items="fornecedores"
                item-title="nome"
                item-value="id"
                label="Fornecedor"
                density="comfortable"
                hide-details
              />
              <v-btn color="primary" variant="flat" :loading="gerando" @click="gerarSugestao">Gerar sugestão</v-btn>
            </div>
          </v-card-text>
        </v-card>

        <v-card class="pedidos-acao" variant="outlined">
          <v-card-text class="pedidos-acao__corpo">
            <div class="pedidos-acao__cabecalho">
              <v-avatar color="primary" variant="tonal" size="36"><v-icon icon="mdi-playlist-plus" /></v-avatar>
              <div>
                <h3 class="text-subtitle-1 font-weight-medium">Pedido manual</h3>
                <p class="text-caption text-medium-emphasis mb-0">
                  Você escolhe fornecedor, produtos e quantidades, com saldo e teto à vista.
                </p>
              </div>
            </div>
            <div class="pedidos-acao__controles">
              <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="abrirNovo"
                >Novo pedido manual</v-btn
              >
            </div>
          </v-card-text>
        </v-card>
      </div>
      <PedidosFila :pedidos="pedidos" @abrir="verPedido" />
    </div>
    <PedidoFormDialog
      v-model="dialogForm"
      :titulo="pedidoEditandoId ? 'Ajustar pedido manual' : 'Novo pedido manual'"
      :empresa-id="empresaId"
      :fornecedores="fornecedores"
      :form="form"
      :salvando="salvando"
      :estoque-por-produto="estoquePorProduto"
      @salvar="salvarPedido"
      @adicionar="adicionarItem"
      @remover="removerItem"
    />
    <PedidoRecebimentoDialog
      v-model="dialogRecebimento"
      :pedido="detalhe"
      :salvando="recebendo"
      @confirmar="confirmarRecebimento"
    />
    <PedidoDetalheDialog
      v-model="dialogDetalhe"
      :pedido="detalhe"
      :pode-editar="podeEditar"
      :pode-receber="podeReceber"
      :transicionando="transicionando"
      @editar="editarPedido"
      @enviar-whatsapp="enviarWhatsapp"
      @situacao="mudarSituacao"
      @receber="abrirRecebimento"
    />
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>

<style scoped>
.pedidos-acoes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-4, 16px);
}

.pedidos-acao {
  border-radius: var(--cx-r-lg, 16px);
}

.pedidos-acao__corpo {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-4, 16px);
  height: 100%;
}

.pedidos-acao__cabecalho {
  display: flex;
  align-items: flex-start;
  gap: var(--cx-sp-3, 12px);
}

.pedidos-acao__controles {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3, 12px);
  margin-top: auto;
}

.pedidos-acao__controles :deep(.v-input) {
  flex: 1 1 auto;
  min-width: 0;
}

/* Abaixo de 960px os dois cartoes empilham; o botao ocupa a largura toda para virar alvo de polegar. */
@media (max-width: 959px) {
  .pedidos-acoes {
    grid-template-columns: minmax(0, 1fr);
  }

  .pedidos-acao__controles {
    flex-wrap: wrap;
  }

  .pedidos-acao__controles :deep(.v-btn) {
    width: 100%;
  }
}
</style>
