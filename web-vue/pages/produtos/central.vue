<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import CentralProdutosGrupos from "~/components/produtos/CentralProdutosGrupos.vue";
import type { CaixaStatus, Opcao } from "~/types/padaria";
import type {
  CargaCentral,
  FonteCentral,
  GrupoCentral,
  LojaCentral,
  ResumoCargaCentral
} from "~/types/produtos-central";

const { apiGet, apiPost, apiUpload, carregarSessao } = useApi();
const router = useRouter();
const sessao = ref<AuthSession | null>(null);
const empresas = ref<Opcao[]>([]);
const caixaStatus = ref<CaixaStatus | null>(null);
const cargas = ref<CargaCentral[]>([]);
const cargaId = ref("");
const grupos = ref<GrupoCentral[]>([]);
const resumo = ref<ResumoCargaCentral | null>(null);
const indicadoresResumo = computed(() =>
  Object.entries(resumo.value ?? {}).filter((item): item is [string, number] => typeof item[1] === "number")
);
const pagina = ref(1);
const total = ref(0);
const pageSize = 30;
const busca = ref("");
const loja = ref<LojaCentral>("");
const carregando = ref(true);
const processando = ref(false);
const erro = ref("");
const sucesso = ref("");
const arquivos = ref<Partial<Record<FonteCentral, File>>>({});
const fontes: Array<{ id: FonteCentral; nome: string }> = [
  { id: "sia_li", nome: "SIA · Lisboa" },
  { id: "compilart_tnp", nome: "Compilart · TNP" },
  { id: "planilha_tnp", nome: "Planilha antiga · TNP" },
  { id: "fiscal_tnp", nome: "Fiscal · TNP" },
  { id: "planilha_nova", nome: "Planilha nova · BASE" },
  { id: "vendidos_tnp", nome: "Produtos vendidos · TNP" }
];
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  computed(() => sessao.value?.perfil?.permissoes ?? []),
  () => Boolean(caixaStatus.value?.caixaAberto)
);

function mensagemFalha(falha: unknown) {
  return falha instanceof Error ? falha.message : "Falha ao comunicar com a API.";
}
async function carregarCargas() {
  cargas.value = await apiGet<CargaCentral[]>("/api/produtos/central/cargas");
  if (!cargaId.value && cargas.value[0]) cargaId.value = cargas.value[0].id;
  if (cargaId.value) await carregarGrupos();
}
async function carregarGrupos() {
  if (!cargaId.value) return;
  const query = new URLSearchParams({ page: String(pagina.value), pageSize: String(pageSize) });
  if (busca.value.trim()) query.set("busca", busca.value.trim());
  if (loja.value) query.set("loja", loja.value);
  const resposta = await apiGet<{ grupos: GrupoCentral[]; total: number; resumo?: ResumoCargaCentral }>(
    `/api/produtos/central/cargas/${cargaId.value}/grupos?${query}`
  );
  grupos.value = resposta.grupos;
  total.value = resposta.total;
  const carga = cargas.value.find((item) => item.id === cargaId.value);
  resumo.value = carga?.resumo as ResumoCargaCentral | null;
}
async function executar(acao: () => Promise<void>, mensagem?: string) {
  processando.value = true;
  erro.value = "";
  sucesso.value = "";
  try {
    await acao();
    if (mensagem) sucesso.value = mensagem;
  } catch (falha) {
    erro.value = mensagemFalha(falha);
  } finally {
    processando.value = false;
  }
}
async function novaCarga() {
  await executar(async () => {
    const criada = await apiPost<{ id: string }>("/api/produtos/central/cargas", {});
    cargaId.value = criada.id;
    arquivos.value = {};
    grupos.value = [];
    resumo.value = null;
    await carregarCargas();
  }, "Carga criada. Anexe cada arquivo de origem e valide a prévia.");
}
async function anexarArquivos() {
  if (!cargaId.value) return;
  await executar(async () => {
    for (const fonte of fontes) {
      const arquivo = arquivos.value[fonte.id];
      if (!arquivo) continue;
      const form = new FormData();
      form.append("arquivo", arquivo);
      await apiUpload(`/api/produtos/central/cargas/${cargaId.value}/fontes?fonte=${fonte.id}`, form);
    }
    arquivos.value = {};
    await carregarCargas();
  }, "Arquivos enviados. A prévia só calcula correspondências; não altera o cadastro de produtos.");
}
async function validar() {
  if (!cargaId.value) return;
  await executar(async () => {
    resumo.value = await apiPost<ResumoCargaCentral>(`/api/produtos/central/cargas/${cargaId.value}/validar`, {});
    await carregarCargas();
    await carregarGrupos();
  }, "Prévia calculada. Nenhum produto foi criado ou alterado.");
}
async function decidir(grupo: GrupoCentral, acao: "nao_e_o_mesmo" | "ignorado") {
  const rotulo = acao === "ignorado" ? "ignorar este grupo" : "marcar que os itens não são o mesmo produto";
  if (!window.confirm(`Confirma ${rotulo}? A decisão ficará registrada com seu usuário.`)) return;
  await executar(async () => {
    await apiPost(`/api/produtos/central/cargas/${cargaId.value}/grupos/${grupo.id}/decisao`, { acao });
    await carregarGrupos();
  }, "Decisão registrada no histórico da Central.");
}
watch([cargaId, pagina], () => void executar(carregarGrupos));
watch([busca, loja], () => {
  pagina.value = 1;
  void executar(carregarGrupos);
});
onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return await router.push("/login");
    if (sessao.value.perfil?.role !== "usuario_admin") {
      erro.value = "A Central de produtos está disponível somente para Administrador total.";
      return;
    }
    empresas.value = sessao.value.empresas ?? [];
    await carregarCargas();
  } catch (falha) {
    erro.value = mensagemFalha(falha);
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
    tela-ativa="produtos"
    :empresas="empresas"
    :empresa-id="sessao.perfil?.empresaId ?? ''"
    :caixa-status="caixaStatus"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <main class="central-produtos">
      <header class="central-produtos__cabecalho">
        <div>
          <h1>Central de produtos</h1>
          <p>Reconcilie fontes oficiais em uma prévia auditável. Nenhuma ação altera o catálogo.</p>
        </div>
        <v-btn variant="outlined" prepend-icon="mdi-arrow-left" to="/produtos">Voltar ao catálogo</v-btn>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
      <v-alert v-if="sucesso" type="success" variant="tonal" class="mb-4">{{ sucesso }}</v-alert>

      <v-card class="mb-5" rounded="lg">
        <v-card-title>Importar arquivos para uma prévia</v-card-title>
        <v-card-text>
          <div class="central-produtos__acoes">
            <v-select
              v-model="cargaId"
              :items="cargas"
              item-title="id"
              item-value="id"
              label="Carga"
              clearable
              hide-details
            />
            <v-btn color="primary" prepend-icon="mdi-plus" :disabled="processando" @click="novaCarga">Nova carga</v-btn>
          </div>
          <p class="text-body-2 mt-3">
            Envie cada fonte separadamente. Use exportações atuais do sistema oficial; arquivos antigos não são aceitos
            como confirmação de catálogo.
          </p>
          <div class="central-produtos__fontes">
            <v-file-input
              v-for="fonte in fontes"
              :key="fonte.id"
              :label="fonte.nome"
              accept=".csv,text/csv"
              prepend-icon="mdi-file-delimited-outline"
              show-size
              hide-details
              :disabled="!cargaId || processando || cargas.find((item) => item.id === cargaId)?.estado !== 'recebida'"
              @update:model-value="
                (valor) => {
                  arquivos[fonte.id] = Array.isArray(valor) ? valor[0] : valor || undefined;
                }
              "
            />
          </div>
          <div class="central-produtos__acoes mt-4">
            <v-btn
              variant="tonal"
              :disabled="!Object.values(arquivos).some(Boolean) || processando"
              :loading="processando"
              @click="anexarArquivos"
              >Enviar fontes selecionadas</v-btn
            >
            <v-btn
              color="primary"
              :disabled="!cargaId || processando || cargas.find((item) => item.id === cargaId)?.estado !== 'recebida'"
              :loading="processando"
              @click="validar"
              >Validar prévia</v-btn
            >
            <v-chip
              v-if="cargas.find((item) => item.id === cargaId)"
              :color="cargas.find((item) => item.id === cargaId)?.estado === 'validada' ? 'success' : 'secondary'"
            >
              {{ cargas.find((item) => item.id === cargaId)?.estado }}
            </v-chip>
          </div>
        </v-card-text>
      </v-card>

      <section v-if="resumo" class="central-produtos__resumo" aria-label="Resumo da prévia">
        <v-card v-for="[chave, valor] in indicadoresResumo" :key="chave" variant="tonal" rounded="lg">
          <v-card-text
            ><strong>{{ valor }}</strong
            ><span>{{ chave }}</span></v-card-text
          >
        </v-card>
      </section>

      <CentralProdutosGrupos
        v-model:busca="busca"
        v-model:loja="loja"
        v-model:pagina="pagina"
        :grupos="grupos"
        :total="total"
        :page-size="pageSize"
        :processando="processando"
        :carga-id="cargaId"
        @decidir="decidir"
      />
    </main>
  </AppShell>
</template>

<style scoped>
.central-produtos {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px;
}
.central-produtos__cabecalho,
.central-produtos__acoes {
  display: flex;
  align-items: center;
  gap: 16px;
}
.central-produtos__cabecalho {
  justify-content: space-between;
  margin-bottom: 24px;
}
.central-produtos__cabecalho h1 {
  font-size: 1.7rem;
}
.central-produtos__cabecalho p {
  color: rgb(var(--v-theme-on-surface-variant));
}
.central-produtos__acoes > :first-child {
  max-width: 480px;
}
.central-produtos__fontes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
}
.central-produtos__resumo {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.central-produtos__resumo strong,
.central-produtos__resumo span {
  display: block;
}
.central-produtos__resumo strong {
  font-size: 1.4rem;
}
.central-produtos__resumo span {
  text-transform: capitalize;
}
@media (max-width: 768px) {
  .central-produtos {
    padding: 16px;
  }
  .central-produtos__cabecalho,
  .central-produtos__acoes {
    align-items: stretch;
    flex-direction: column;
  }
  .central-produtos__cabecalho > *,
  .central-produtos__acoes > :first-child {
    max-width: none;
    width: 100%;
  }
  .central-produtos__fontes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .central-produtos__resumo {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 390px) {
  .central-produtos__fontes {
    grid-template-columns: 1fr;
  }
  .central-produtos__resumo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
