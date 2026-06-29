<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import type {
  CampoVinculoIntegracao,
  IntegracaoCampoConfigDto,
  IntegracaoChaveDto,
  IntegracaoHistoricoDto,
  IntegracaoVinculoDto,
  TipoIntegracao,
  TipoRegistroIntegracao
} from "@padaria/shared/integracoes";
import type { ItemMenu, Opcao } from "~/types/padaria";
import { itemPorTela, mensagemErro, telasFuturas } from "~/utils/domain";

type IntegracoesResposta = {
  integracoes: Array<{ tipo: TipoIntegracao; nome: string }>;
  chaves: IntegracaoChaveDto[];
};

type DicionarioResposta = {
  configs: IntegracaoCampoConfigDto[];
  vinculos: IntegracaoVinculoDto[];
};

const router = useRouter();
const { apiGet, apiPost, apiPut, carregarSessao } = useApi();

const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const empresaId = ref("");
const carregando = ref(true);
const empresaCarregando = ref(false);
const saindo = ref(false);
const erro = ref("");
const aba = ref("chaves");
const tipoSelecionado = ref<TipoIntegracao>("vendas");
const integracoes = ref<Array<{ tipo: TipoIntegracao; nome: string }>>([]);
const chaves = ref<IntegracaoChaveDto[]>([]);
const historico = ref<IntegracaoHistoricoDto[]>([]);
const configs = ref<IntegracaoCampoConfigDto[]>([]);
const vinculos = ref<IntegracaoVinculoDto[]>([]);
const catalogos = reactive({
  pdvs: [] as Opcao[],
  clientes: [] as Opcao[],
  colaboradores: [] as Opcao[],
  produtos: [] as Opcao[],
  formasPagamento: [] as Opcao[]
});
const salvandoChave = ref(false);
const salvandoCampo = ref("");
const salvandoVinculo = ref("");
const dicionarioCarregando = ref(false);
const dicionarioSolicitacao = ref(0);
const snackbar = reactive({ show: false, text: "", color: "success" });

const permissoesUsuario = computed(() => sessao.value?.perfil?.permissoes ?? []);
const telasPermitidas = computed<ItemMenu[]>(() =>
  Object.values(itemPorTela).filter((item) => permissoesUsuario.value.includes(item.permissao))
);
const telasFuturasMenu = computed(() => [...telasFuturas].filter((tela) => telasPermitidas.value.some((item) => item.id === tela)));
const chavesDaEmpresa = computed(() => chaves.value.filter((chave) => chave.empresaId === empresaId.value));
const registrosDisponiveis = computed(() => ({
  pdv: catalogos.pdvs,
  cliente: catalogos.clientes,
  colaborador: catalogos.colaboradores,
  produto: catalogos.produtos,
  forma_pagamento: catalogos.formasPagamento,
  venda: [] as Opcao[]
}));

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
    vendedor: "Vendedor",
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
    colaborador: "Colaborador",
    produto: "Produto",
    forma_pagamento: "Forma de pagamento"
  };
  return mapa[tipo];
}

function itensVinculo(vinculo: IntegracaoVinculoDto) {
  return registrosDisponiveis.value[vinculo.tipoRegistro] ?? [];
}

function tituloOpcao(item: Opcao) {
  return item.nome || item.descricao || item.codigo || item.id;
}

async function sair() {
  saindo.value = true;
  try {
    await fetch(`${useRuntimeConfig().public.apiUrl || "http://localhost:4100"}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include"
    });
    await router.push("/login");
  } finally {
    saindo.value = false;
  }
}

async function carregarEmpresas() {
  empresas.value = await apiGet<Opcao[]>("/api/empresas");
  empresaId.value = sessao.value?.perfil?.empresaId ?? sessao.value?.perfil?.empresaIds?.[0] ?? empresas.value[0]?.id ?? "";
}

async function carregarCatalogos() {
  const query = `?empresaId=${empresaId.value}`;
  [catalogos.pdvs, catalogos.clientes, catalogos.colaboradores, catalogos.produtos, catalogos.formasPagamento] =
    await Promise.all([
      apiGet<Opcao[]>(`/api/pdvs${query}`),
      apiGet<Opcao[]>(`/api/clientes${query}`),
      apiGet<Opcao[]>(`/api/colaboradores${query}`),
      apiGet<Opcao[]>(`/api/produtos${query}`),
      apiGet<Opcao[]>(`/api/formas_pagamento${query}`)
    ]);
}

async function carregarDados() {
  if (!empresaId.value) return;
  empresaCarregando.value = true;
  try {
    const query = `?empresaId=${empresaId.value}`;
    const [integracoesResposta, historicoResposta] = await Promise.all([
      apiGet<IntegracoesResposta>(`/api/integracoes${query}`),
      apiGet<IntegracaoHistoricoDto[]>(`/api/integracoes/historico${query}`),
      carregarCatalogos()
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
    notificar("Configuracao salva.");
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
    notificar("Vinculo salvo.");
    await carregarDicionario();
  } catch (error) {
    notificar(mensagemErro(error), "error");
  } finally {
    salvandoVinculo.value = "";
  }
}

watch(tipoSelecionado, () => {
  if (empresaId.value) void carregarDicionario();
});

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!permissoesUsuario.value.includes("integracoes")) {
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
    tela-ativa="integracoes"
    :empresas="empresas"
    :empresa-id="empresaId"
    :telas-desabilitadas="telasFuturasMenu"
    :telas-futuras="telasFuturasMenu"
    :carregando-empresa="empresaCarregando"
    :saindo="saindo"
    @selecionar-empresa="trocarEmpresa"
    @logout="sair"
  >
    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

    <div v-else class="d-grid ga-4">
      <div class="d-flex flex-wrap align-center justify-space-between ga-3">
        <div>
          <h1 class="text-h5 font-weight-bold">Integracoes</h1>
          <div class="text-body-2 text-muted">Chaves, funcionamento e dicionario de conversao do PDV.</div>
        </div>
        <v-select
          v-model="tipoSelecionado"
          :items="integracoes"
          item-title="nome"
          item-value="tipo"
          label="Integracao"
          hide-details
          max-width="260"
        />
      </div>

      <v-tabs v-model="aba" density="comfortable">
        <v-tab value="chaves">Chaves</v-tab>
        <v-tab value="historico">Historico</v-tab>
        <v-tab value="dicionario">Dicionario</v-tab>
      </v-tabs>

      <v-window v-model="aba">
        <v-window-item value="chaves">
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between">
              <span>Chaves de {{ tituloTipo(tipoSelecionado) }}</span>
              <v-btn prepend-icon="mdi-plus" color="primary" :loading="salvandoChave" @click="criarChave">
                Criar chave
              </v-btn>
            </v-card-title>
            <div class="responsive-table-shell">
              <v-table>
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Status</th>
                  <th>Criada em</th>
                  <th class="text-right">Acoes</th>
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
            <v-card-title>Funcionamento diario</v-card-title>
            <div class="responsive-table-shell">
              <v-table>
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Integracao</th>
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
              <v-card-title>Regras automaticas</v-card-title>
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
              <v-card-title>Vinculos externos</v-card-title>
              <v-progress-linear v-if="dicionarioCarregando" indeterminate />
              <div class="responsive-table-shell">
                <v-table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Identificador externo</th>
                    <th>Descricao</th>
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
      </v-window>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">{{ snackbar.text }}</v-snackbar>
  </AppShell>
</template>
