<script setup lang="ts">
import type {
  AuthSession,
  CampoVinculoIntegracao,
  IntegracaoCampoConfigDto,
  IntegracaoChaveDto,
  IntegracaoHistoricoDto,
  IntegracaoVinculoDto,
  TipoIntegracao,
  TipoRegistroIntegracao
} from "@padaria/shared";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import AppShell from "~/components/app/AppShell.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { mensagemErro } from "~/utils/domain";

type IntegracoesResposta = {
  integracoes: Array<{ tipo: TipoIntegracao; nome: string }>;
  chaves: IntegracaoChaveDto[];
};

type DicionarioResposta = {
  configs: IntegracaoCampoConfigDto[];
  vinculos: IntegracaoVinculoDto[];
};

type TipoRegistroManual = Exclude<TipoRegistroIntegracao, "venda">;

const router = useRouter();
const { apiGet, apiPost, apiPut, carregarSessao } = useApi();

const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const caixaStatus = ref<CaixaStatus | null>(null);
const carregando = ref(true);
const empresaCarregando = ref(false);
const erro = ref("");
const aba = ref("chaves");
const tipoSelecionado = ref<TipoIntegracao>("vendas");
const integracoes = ref<Array<{ tipo: TipoIntegracao; nome: string }>>([]);
const chaves = ref<IntegracaoChaveDto[]>([]);
const historico = ref<IntegracaoHistoricoDto[]>([]);
const configs = ref<IntegracaoCampoConfigDto[]>([]);
const vinculos = ref<IntegracaoVinculoDto[]>([]);
const opcoesVinculo = reactive({
  pdvs: [] as Opcao[],
  clientes: [] as Opcao[],
  produtos: [] as Opcao[],
  formasPagamento: [] as Opcao[],
  colaboradores: [] as Opcao[]
});
type RegistrosDisponiveis = Record<TipoRegistroIntegracao, Opcao[]>;
const salvandoChave = ref(false);
const salvandoCampo = ref("");
const salvandoVinculo = ref("");
const salvandoVinculoManual = ref(false);
const dicionarioCarregando = ref(false);
const dicionarioSolicitacao = ref(0);
const snackbar = reactive({ show: false, text: "", color: "success" });
const tiposRegistroManual: Array<{ tipo: TipoRegistroManual; nome: string }> = [
  { tipo: "cliente", nome: "Cliente" },
  { tipo: "colaborador", nome: "Colaborador" },
  { tipo: "forma_pagamento", nome: "Forma de pagamento" },
  { tipo: "pdv", nome: "PDV" },
  { tipo: "produto", nome: "Produto" }
];
const tiposFiltroPendente: Array<{ tipo: TipoRegistroManual | "todos"; nome: string }> = [
  { tipo: "produto", nome: "Produto" },
  { tipo: "todos", nome: "Todos" },
  ...tiposRegistroManual.filter((item) => item.tipo !== "produto")
];
const filtroTipoPendente = ref<TipoRegistroManual | "todos">("produto");
const formVinculoManual = reactive<{
  tipoRegistro: TipoRegistroManual;
  identificadorExterno: string;
  descricaoExterna: string;
  registroSistemaId: string;
}>({
  tipoRegistro: "cliente",
  identificadorExterno: "",
  descricaoExterna: "",
  registroSistemaId: ""
});

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { temPermissao, telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesUsuario,
  () => Boolean(caixaStatus.value?.caixaAberto)
);
const chavesDaEmpresa = computed(() => chaves.value.filter((chave) => chave.empresaId === empresaId.value));
const registrosDisponiveis = computed<RegistrosDisponiveis>(() => ({
  pdv: opcoesVinculo.pdvs,
  cliente: opcoesVinculo.clientes,
  produto: opcoesVinculo.produtos,
  forma_pagamento: opcoesVinculo.formasPagamento,
  colaborador: opcoesVinculo.colaboradores,
  venda: [] as Opcao[]
}));
const registrosVinculoManual = computed(() => registrosDisponiveis.value[formVinculoManual.tipoRegistro]);
const vinculosSemConversao = computed(() =>
  vinculos.value.filter((vinculo) => vinculo.pendente || !vinculo.registroSistemaId)
);
const vinculosSemConversaoFiltrados = computed(() =>
  filtroTipoPendente.value === "todos"
    ? vinculosSemConversao.value
    : vinculosSemConversao.value.filter((vinculo) => vinculo.tipoRegistro === filtroTipoPendente.value)
);
const podeSalvarVinculoManual = computed(
  () =>
    Boolean(empresaId.value) &&
    Boolean(formVinculoManual.tipoRegistro) &&
    Boolean(formVinculoManual.identificadorExterno.trim()) &&
    Boolean(formVinculoManual.registroSistemaId)
);

function notificar(text: string, color = "success") {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

function tituloTipo(tipo: TipoIntegracao) {
  return integracoes.value.find((item) => item.tipo === tipo)?.nome ?? tipo;
}

function tituloCampo(campo: CampoVinculoIntegracao) {
  const mapa: Record<CampoVinculoIntegracao, string> = {
    pdv: "PDV",
    cliente: "Cliente",
    produto: "Produto",
    forma_pagamento: "Forma de pagamento"
  };
  return mapa[campo];
}

function tituloRegistro(tipo: TipoRegistroIntegracao) {
  const mapa: Record<TipoRegistroIntegracao, string> = {
    venda: "Venda",
    pdv: "PDV",
    cliente: "Cliente",
    produto: "Produto",
    forma_pagamento: "Forma de pagamento",
    colaborador: "Colaborador"
  };
  return mapa[tipo];
}

function itensVinculo(vinculo: IntegracaoVinculoDto) {
  return registrosDisponiveis.value[vinculo.tipoRegistro] ?? [];
}

function tituloOpcao(item: Opcao) {
  return item.nome || item.descricao || item.codigo || item.id;
}

async function carregarEmpresas() {
  empresas.value = await apiGet<Opcao[]>("/api/empresas");
  empresaId.value =
    sessao.value?.perfil?.empresaId ?? sessao.value?.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
}

async function carregarOpcoesVinculo() {
  const query = `?empresaId=${empresaId.value}`;
  [
    opcoesVinculo.pdvs,
    opcoesVinculo.clientes,
    opcoesVinculo.produtos,
    opcoesVinculo.formasPagamento,
    opcoesVinculo.colaboradores
  ] = await Promise.all([
    apiGet<Opcao[]>(`/api/pdvs${query}`),
    apiGet<Opcao[]>(`/api/clientes${query}`),
    apiGet<Opcao[]>(`/api/produtos/opcoes${query}`),
    apiGet<Opcao[]>(`/api/formas_pagamento${query}`),
    apiGet<Opcao[]>(`/api/colaboradores${query}`)
  ]);
}

async function carregarStatusCaixa() {
  if (!empresaId.value || !temPermissao("caixa_operar")) {
    caixaStatus.value = null;
    return;
  }
  caixaStatus.value = await apiGet<CaixaStatus>(`/api/caixa/status?empresaId=${empresaId.value}`);
}

async function carregarDados() {
  if (!empresaId.value) return;
  empresaCarregando.value = true;
  try {
    const query = `?empresaId=${empresaId.value}`;
    const [integracoesResposta, historicoResposta] = await Promise.all([
      apiGet<IntegracoesResposta>(`/api/integracoes${query}`),
      apiGet<IntegracaoHistoricoDto[]>(`/api/integracoes/historico${query}`),
      carregarStatusCaixa(),
      carregarOpcoesVinculo()
    ]);
    integracoes.value = integracoesResposta.integracoes;
    chaves.value = integracoesResposta.chaves;
    historico.value = historicoResposta;
    await carregarDicionario();
  } finally {
    empresaCarregando.value = false;
  }
}

async function carregarDicionario(tipo = tipoSelecionado.value) {
  if (!empresaId.value) return;
  const solicitacao = ++dicionarioSolicitacao.value;
  dicionarioCarregando.value = true;
  configs.value = [];
  vinculos.value = [];
  try {
    const query = `?empresaId=${empresaId.value}&tipo=${tipo}`;
    const resposta = await apiGet<DicionarioResposta>(`/api/integracoes/dicionario${query}`);
    if (solicitacao !== dicionarioSolicitacao.value || tipo !== tipoSelecionado.value) return;
    configs.value = resposta.configs;
    vinculos.value = resposta.vinculos;
  } finally {
    if (solicitacao === dicionarioSolicitacao.value) dicionarioCarregando.value = false;
  }
}

async function trocarEmpresa(id: string) {
  empresaId.value = id;
  await carregarDados();
}

async function criarChave() {
  salvandoChave.value = true;
  try {
    await apiPost("/api/integracoes/chaves", { empresaId: empresaId.value, tipo: tipoSelecionado.value });
    notificar("Chave criada.");
    await carregarDados();
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoChave.value = false;
  }
}

async function inativarChave(id: string) {
  salvandoChave.value = true;
  try {
    await apiPost(`/api/integracoes/chaves/${id}/inativar`, {});
    notificar("Chave inativada.");
    await carregarDados();
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoChave.value = false;
  }
}

async function salvarCampo(config: IntegracaoCampoConfigDto) {
  salvandoCampo.value = config.campo;
  try {
    await apiPut("/api/integracoes/campos", config);
    notificar("Configuração salva.");
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoCampo.value = "";
  }
}

async function salvarVinculo(vinculo: IntegracaoVinculoDto, registroSistemaId: string) {
  if (!registroSistemaId) return;
  salvandoVinculo.value = vinculo.id;
  try {
    await apiPut("/api/integracoes/vinculos", {
      empresaId: empresaId.value,
      tipo: vinculo.tipo,
      tipoRegistro: vinculo.tipoRegistro,
      identificadorExterno: vinculo.identificadorExterno,
      descricaoExterna: vinculo.descricaoExterna,
      registroSistemaId
    });
    notificar("Vínculo salvo.");
    await carregarDicionario();
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoVinculo.value = "";
  }
}

async function criarVinculoManual() {
  if (!podeSalvarVinculoManual.value) return;
  salvandoVinculoManual.value = true;
  try {
    await apiPut("/api/integracoes/vinculos", {
      empresaId: empresaId.value,
      tipo: tipoSelecionado.value,
      tipoRegistro: formVinculoManual.tipoRegistro,
      identificadorExterno: formVinculoManual.identificadorExterno.trim(),
      descricaoExterna: formVinculoManual.descricaoExterna.trim() || null,
      registroSistemaId: formVinculoManual.registroSistemaId
    });
    notificar("Vínculo criado.");
    formVinculoManual.identificadorExterno = "";
    formVinculoManual.descricaoExterna = "";
    formVinculoManual.registroSistemaId = "";
    await carregarDicionario();
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoVinculoManual.value = false;
  }
}

watch(tipoSelecionado, () => {
  if (empresaId.value) void carregarDicionario();
});

watch(
  () => formVinculoManual.tipoRegistro,
  () => {
    formVinculoManual.registroSistemaId = "";
  }
);

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!temPermissao("integracoes_visualizar")) {
      erro.value = "Sem permissão para acessar esta página.";
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
    tela-ativa="integracoes"
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
          <h1 class="text-h5 font-weight-bold">Integrações</h1>
          <div class="text-body-2 text-muted">Chaves, funcionamento e dicionário de conversão do PDV.</div>
        </div>
        <v-select
          v-model="tipoSelecionado"
          :items="integracoes"
          item-title="nome"
          item-value="tipo"
          label="Integração"
          hide-details
          max-width="260"
        />
      </div>

      <v-tabs v-model="aba" density="comfortable">
        <v-tab value="chaves">Chaves</v-tab>
        <v-tab value="historico">Histórico</v-tab>
        <v-tab value="dicionario">Dicionário</v-tab>
        <v-tab value="pendentes">Sem conversão ({{ vinculosSemConversao.length }})</v-tab>
      </v-tabs>

      <v-window v-model="aba">
        <v-window-item value="chaves">
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
              <span>Chaves de {{ tituloTipo(tipoSelecionado) }}</span>
              <v-btn prepend-icon="mdi-plus" color="primary" :loading="salvandoChave" @click="criarChave">
                Criar chave
              </v-btn>
            </v-card-title>
            <div class="responsive-table-shell">
              <v-table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Status</th>
                    <th>Criada em</th>
                    <th class="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="chave in chavesDaEmpresa.filter((item) => item.tipo === tipoSelecionado)" :key="chave.id">
                    <td class="font-monospace">{{ chave.codigo }}</td>
                    <td>
                      <v-chip :color="chave.ativa ? 'success' : 'default'" size="small">
                        {{ chave.ativa ? "Ativa" : "Inativa" }}
                      </v-chip>
                    </td>
                    <td>{{ new Date(chave.criadoEm).toLocaleString("pt-BR") }}</td>
                    <td class="text-right">
                      <v-btn
                        v-if="chave.ativa"
                        size="small"
                        variant="outlined"
                        prepend-icon="mdi-close"
                        :loading="salvandoChave"
                        @click="inativarChave(chave.id)"
                      >
                        Inativar
                      </v-btn>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-card>
        </v-window-item>

        <v-window-item value="historico">
          <v-card>
            <v-card-title>Funcionamento diário</v-card-title>
            <div class="responsive-table-shell">
              <v-table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Integração</th>
                    <th>Recebidos</th>
                    <th>Novos</th>
                    <th>Atualizados</th>
                    <th>Sem novidade</th>
                    <th>Erros</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="linha in historico" :key="`${linha.dia}-${linha.tipo}`">
                    <td>{{ linha.dia }}</td>
                    <td>{{ tituloTipo(linha.tipo) }}</td>
                    <td>{{ linha.recebidos }}</td>
                    <td>{{ linha.novos }}</td>
                    <td>{{ linha.atualizados }}</td>
                    <td>{{ linha.semNovidade }}</td>
                    <td>{{ linha.erros }}</td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-card>
        </v-window-item>

        <v-window-item value="dicionario">
          <div class="d-grid ga-4">
            <v-card>
              <v-card-title>Regras automáticas</v-card-title>
              <v-progress-linear v-if="dicionarioCarregando" indeterminate />
              <div class="responsive-table-shell">
                <v-table>
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Criar automaticamente</th>
                      <th>Vincular automaticamente</th>
                      <th class="text-right">Salvar</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="config in configs" :key="`${config.tipo}:${config.campo}`">
                      <td>{{ tituloCampo(config.campo) }}</td>
                      <td><v-switch v-model="config.criarAutomaticamente" color="primary" hide-details /></td>
                      <td><v-switch v-model="config.vincularAutomaticamente" color="primary" hide-details /></td>
                      <td class="text-right">
                        <v-btn
                          size="small"
                          variant="outlined"
                          :loading="salvandoCampo === config.campo"
                          @click="salvarCampo(config)"
                        >
                          Salvar
                        </v-btn>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
            </v-card>

            <v-card>
              <v-card-title>Vínculos externos</v-card-title>
              <v-card-text>
                <v-row dense>
                  <v-col cols="12" md="3">
                    <v-select
                      v-model="formVinculoManual.tipoRegistro"
                      :items="tiposRegistroManual"
                      item-title="nome"
                      item-value="tipo"
                      label="Tipo"
                    />
                  </v-col>
                  <v-col cols="12" md="3">
                    <v-text-field v-model="formVinculoManual.identificadorExterno" label="Identificador externo" />
                  </v-col>
                  <v-col cols="12" md="3">
                    <v-text-field v-model="formVinculoManual.descricaoExterna" label="Descrição externa" />
                  </v-col>
                  <v-col cols="12" md="3">
                    <v-select
                      v-model="formVinculoManual.registroSistemaId"
                      :items="registrosVinculoManual"
                      :item-title="tituloOpcao"
                      item-value="id"
                      label="Registro do sistema"
                      clearable
                    />
                  </v-col>
                  <v-col cols="12" class="d-flex justify-end">
                    <v-btn
                      color="primary"
                      prepend-icon="mdi-link-plus"
                      :disabled="!podeSalvarVinculoManual"
                      :loading="salvandoVinculoManual"
                      @click="criarVinculoManual"
                    >
                      Criar vínculo
                    </v-btn>
                  </v-col>
                </v-row>
              </v-card-text>
              <v-progress-linear v-if="dicionarioCarregando" indeterminate />
              <div class="responsive-table-shell">
                <v-table>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Identificador externo</th>
                      <th>Descrição</th>
                      <th>Registro do sistema</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="vinculo in vinculos" :key="vinculo.id">
                      <td>{{ tituloRegistro(vinculo.tipoRegistro) }}</td>
                      <td class="font-monospace">{{ vinculo.identificadorExterno }}</td>
                      <td>{{ vinculo.descricaoExterna || "-" }}</td>
                      <td>
                        <v-select
                          :model-value="vinculo.registroSistemaId"
                          :items="itensVinculo(vinculo)"
                          :item-title="tituloOpcao"
                          item-value="id"
                          density="compact"
                          hide-details
                          clearable
                          :loading="salvandoVinculo === vinculo.id"
                          @update:model-value="salvarVinculo(vinculo, String($event || ''))"
                        />
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
            </v-card>
          </div>
        </v-window-item>

        <v-window-item value="pendentes">
          <v-card>
            <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-3">
              <span>Itens sem conversão</span>
              <v-select
                v-model="filtroTipoPendente"
                :items="tiposFiltroPendente"
                item-title="nome"
                item-value="tipo"
                label="Tipo"
                hide-details
                max-width="260"
              />
            </v-card-title>
            <v-progress-linear v-if="dicionarioCarregando" indeterminate />
            <div class="responsive-table-shell">
              <v-table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Identificador externo</th>
                    <th>Descrição</th>
                    <th>Registro do sistema</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="vinculo in vinculosSemConversaoFiltrados" :key="vinculo.id">
                    <td>{{ tituloRegistro(vinculo.tipoRegistro) }}</td>
                    <td class="font-monospace">{{ vinculo.identificadorExterno }}</td>
                    <td>{{ vinculo.descricaoExterna || "-" }}</td>
                    <td>
                      <v-select
                        :model-value="vinculo.registroSistemaId"
                        :items="itensVinculo(vinculo)"
                        :item-title="tituloOpcao"
                        item-value="id"
                        density="compact"
                        hide-details
                        clearable
                        :loading="salvandoVinculo === vinculo.id"
                        @update:model-value="salvarVinculo(vinculo, String($event || ''))"
                      />
                    </td>
                  </tr>
                  <tr v-if="!vinculosSemConversaoFiltrados.length">
                    <td colspan="4" class="text-center text-muted">
                      <span class="tabela-vazio">
                        {{ dicionarioCarregando ? "Carregando..." : "Nenhum item encontrado." }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-card>
        </v-window-item>
      </v-window>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
