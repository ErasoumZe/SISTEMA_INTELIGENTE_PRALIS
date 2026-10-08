<script setup lang="ts">
import type { AuthSession, PedidoDto, PedidoStatus } from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import type { PedidoFormEdicao } from "~/components/pedidos/PedidoFormDialog.vue";
import AppShell from "~/components/app/AppShell.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { itemPorTela, mensagemErro } from "~/utils/domain";

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
const sugestaoFornecedorId = ref("");

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
function corStatus(status: PedidoStatus) {
  if (status === "recebido") return "success";
  if (status === "recebido_parcial" || status === "confirmado") return "info";
  if (status === "cancelado") return "error";
  if (status === "retornado") return "warning";
  return "secondary";
}
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
async function carregarDados() {
  if (!empresaId.value) return;
  empresaCarregando.value = true;
  try {
    [pedidos.value, fornecedores.value] = await Promise.all([
      apiGet<PedidoDto[]>(`/api/pedidos${query()}`),
      apiGet<Opcao[]>(`/api/fornecedores${query()}`)
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
  dialogForm.value = true;
}
async function mudarSituacao(status: "enviado" | "retornado" | "confirmado" | "cancelado") {
  if (!detalhe.value) return;
  transicionando.value = true;
  try {
    await apiPost(`/api/pedidos/${detalhe.value.id}/situacao`, { status });
    notificar(`Pedido marcado como ${rotulosStatus[status]}.`);
    await carregarDados();
    await verPedido(detalhe.value.id);
  } catch (causa) {
    notificar(mensagemErro(causa), "error");
  } finally {
    transicionando.value = false;
  }
}
async function enviarWhatsapp() {
  if (!detalhe.value?.fornecedorWhatsapp)
    return notificar("Cadastre o WhatsApp do fornecedor antes de enviar.", "error");
  await mudarSituacao("enviado");
  const numero = detalhe.value.fornecedorWhatsapp.replace(/\D/gu, "");
  const itens = (detalhe.value.itens ?? []).map((item) => `• ${item.descricaoProduto}: ${item.quantidade}`).join("\n");
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(`Pedido Pralis\n${itens}`)}`, "_blank", "noopener");
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
  recebendo.value = true;
  try {
    const resposta = await apiPost<{ status: "recebido" | "recebido_parcial" }>(
      `/api/pedidos/${detalhe.value.id}/recebimentos`,
      { idempotenciaChave: chaveIdempotencia(), observacao: observacao || null, itens }
    );
    notificar(
      resposta.status === "recebido"
        ? "Recebimento concluído e estoque atualizado."
        : "Recebimento parcial registrado e estoque atualizado."
    );
    dialogRecebimento.value = false;
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
    empresas.value = await apiGet<Opcao[]>("/api/empresas");
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
      <v-card v-if="podeCriar" variant="tonal"
        ><v-card-title>Gerar sugestão de reposição</v-card-title
        ><v-card-text
          ><v-row dense align="center"
            ><v-col cols="12" md="7"
              ><p class="text-body-2">
                Produtos no mínimo são sugeridos até o máximo. O comprador revisa antes de enviar.
              </p></v-col
            ><v-col cols="12" md="3"
              ><v-select
                v-model="sugestaoFornecedorId"
                :items="fornecedores"
                item-title="nome"
                item-value="id"
                label="Fornecedor" /></v-col
            ><v-col cols="12" md="2"
              ><v-btn block color="primary" :loading="gerando" @click="gerarSugestao">Gerar sugestão</v-btn></v-col
            ></v-row
          ></v-card-text
        ></v-card
      >
      <div v-if="podeCriar" class="d-flex justify-end">
        <v-btn color="primary" prepend-icon="mdi-plus" @click="abrirNovo">Novo pedido manual</v-btn>
      </div>
      <v-card
        ><v-card-title>Pedidos</v-card-title
        ><v-card-text
          ><div class="responsive-table-shell">
            <v-table
              ><thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Tipo</th>
                  <th>Situação</th>
                  <th>Itens</th>
                  <th>Agendado</th>
                  <th class="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!pedidos.length">
                  <td colspan="6" class="text-center text-medium-emphasis">Nenhum pedido encontrado.</td>
                </tr>
                <tr v-for="pedido in pedidos" :key="pedido.id">
                  <td>{{ pedido.fornecedorNome ?? "Histórico sem fornecedor" }}</td>
                  <td>{{ pedido.tipo === "automatico" ? "Sugestão" : "Manual" }}</td>
                  <td>
                    <v-chip :color="corStatus(pedido.status)" size="small">{{ rotulosStatus[pedido.status] }}</v-chip>
                  </td>
                  <td>{{ pedido.totalItens }}</td>
                  <td>{{ pedido.dataAgendada ? new Date(pedido.dataAgendada).toLocaleString("pt-BR") : "—" }}</td>
                  <td class="text-right">
                    <v-btn icon="mdi-eye" size="small" variant="text" @click="verPedido(pedido.id)" />
                  </td>
                </tr></tbody
            ></v-table></div></v-card-text
      ></v-card>
    </div>
    <PedidoFormDialog
      v-model="dialogForm"
      :titulo="pedidoEditandoId ? 'Ajustar pedido manual' : 'Novo pedido manual'"
      :empresa-id="empresaId"
      :fornecedores="fornecedores"
      :form="form"
      :salvando="salvando"
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
      @receber="dialogRecebimento = true"
    />
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
