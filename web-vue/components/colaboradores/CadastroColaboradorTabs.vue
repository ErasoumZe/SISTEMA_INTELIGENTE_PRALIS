<script setup lang="ts">
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{ colaboradorId: string; podeEditar: boolean }>();

type TextoNulo = string | null;
type DadosPessoais = {
  nomeSocial: TextoNulo;
  nascimento: TextoNulo;
  sexo: TextoNulo;
  estadoCivil: TextoNulo;
  racaCor: TextoNulo;
  grauInstrucao: TextoNulo;
  nacionalidade: TextoNulo;
  naturalidade: TextoNulo;
  nomeMae: TextoNulo;
  nomePai: TextoNulo;
  rgNumero: TextoNulo;
  rgOrgao: TextoNulo;
  rgUf: TextoNulo;
  rgEmissao: TextoNulo;
  tituloEleitor: TextoNulo;
  tituloZona: TextoNulo;
  tituloSecao: TextoNulo;
};
type Endereco = {
  cep: TextoNulo;
  logradouro: TextoNulo;
  numero: TextoNulo;
  complemento: TextoNulo;
  bairro: TextoNulo;
  municipio: TextoNulo;
  uf: TextoNulo;
  telefone: TextoNulo;
  email: TextoNulo;
};
type Bancarios = {
  banco: TextoNulo;
  agencia: TextoNulo;
  conta: TextoNulo;
  contaDigito: TextoNulo;
  contaTipo: TextoNulo;
};
type Onboarding = {
  etapa:
    | "em_cadastro"
    | "cadastro_completo"
    | "aguardando_contabilidade"
    | "retorno_contabilidade"
    | "pendente_configuracao"
    | "configurado";
  versao: number;
  cadastroCompletoEm: string | null;
  enviadoContabilidadeEm: string | null;
  retornoContabilidadeEm: string | null;
  observacaoRetorno: string | null;
  configuradoEm: string | null;
};
// Mesmo recurso do perfil: não existe uma segunda rota de edição para o mesmo cadastro.
// A projeção ampla continua protegida pela permissão `cadastro_colaboradores_visualizar` no servidor.
type DadosCadastrais = {
  dadosPessoais: DadosPessoais | null;
  enderecoContato: Endereco | null;
  dadosBancarios: Bancarios | null;
  onboarding: Onboarding | null;
};

const vazioPessoais = (): DadosPessoais => ({
  nomeSocial: null,
  nascimento: null,
  sexo: null,
  estadoCivil: null,
  racaCor: null,
  grauInstrucao: null,
  nacionalidade: null,
  naturalidade: null,
  nomeMae: null,
  nomePai: null,
  rgNumero: null,
  rgOrgao: null,
  rgUf: null,
  rgEmissao: null,
  tituloEleitor: null,
  tituloZona: null,
  tituloSecao: null
});
const vazioEndereco = (): Endereco => ({
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  municipio: null,
  uf: null,
  telefone: null,
  email: null
});
const vazioBancarios = (): Bancarios => ({
  banco: null,
  agencia: null,
  conta: null,
  contaDigito: null,
  contaTipo: null
});

const { apiGet, apiPut } = useApi();
const aba = ref("dados");
const carregando = ref(true);
const salvando = ref(false);
const erro = ref("");
const salvo = ref("");
const pessoais = ref<DadosPessoais>(vazioPessoais());
const endereco = ref<Endereco>(vazioEndereco());
const bancarios = ref<Bancarios>(vazioBancarios());
const onboarding = ref<Onboarding | null>(null);

const etapas: Record<Onboarding["etapa"], string> = {
  em_cadastro: "Em cadastro",
  cadastro_completo: "Cadastro completo",
  aguardando_contabilidade: "Aguardando contabilidade",
  retorno_contabilidade: "Retorno da contabilidade",
  pendente_configuracao: "Pendente de configuração",
  configurado: "Configurado"
};
const corEtapa: Record<Onboarding["etapa"], string> = {
  em_cadastro: "primary",
  cadastro_completo: "info",
  aguardando_contabilidade: "warning",
  retorno_contabilidade: "secondary",
  pendente_configuracao: "orange",
  configurado: "success"
};

function limparTexto(valor: TextoNulo) {
  const texto = valor?.trim();
  return texto ? texto : null;
}
function limparRegistro<T extends Record<string, TextoNulo>>(dados: T) {
  return Object.fromEntries(Object.entries(dados).map(([campo, valor]) => [campo, limparTexto(valor)])) as T;
}
function hidratar<T extends Record<string, TextoNulo>>(base: T, dados: Partial<T> | null | undefined) {
  return { ...base, ...dados };
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const dados = await apiGet<DadosCadastrais>(`/api/colaboradores/${props.colaboradorId}/perfil`);
    pessoais.value = hidratar(vazioPessoais(), dados.dadosPessoais);
    endereco.value = hidratar(vazioEndereco(), dados.enderecoContato);
    bancarios.value = hidratar(vazioBancarios(), dados.dadosBancarios);
    onboarding.value = dados.onboarding;
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
}

async function salvar() {
  if (!props.podeEditar || salvando.value) return;
  salvando.value = true;
  erro.value = "";
  salvo.value = "";
  try {
    await apiPut(`/api/colaboradores/${props.colaboradorId}/perfil`, {
      dadosPessoais: limparRegistro(pessoais.value),
      enderecoContato: limparRegistro(endereco.value),
      dadosBancarios: limparRegistro(bancarios.value)
    });
    salvo.value = "Dados cadastrais salvos.";
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    salvando.value = false;
  }
}

onMounted(carregar);
</script>

<template>
  <section class="cadastro" aria-label="Cadastro completo do colaborador">
    <div class="cadastro__titulo">
      <div>
        <p class="cadastro__contexto">Departamento pessoal</p>
        <h2>Cadastro do colaborador</h2>
      </div>
      <v-chip v-if="onboarding" :color="corEtapa[onboarding.etapa]" variant="flat" size="small">
        {{ etapas[onboarding.etapa] }}
      </v-chip>
    </div>

    <v-alert v-if="erro" type="error" variant="flat" class="mb-4">{{ erro }}</v-alert>
    <v-alert v-if="salvo" type="success" variant="flat" class="mb-4">{{ salvo }}</v-alert>
    <v-progress-linear v-if="carregando" indeterminate color="primary" class="mb-4" />

    <v-card v-if="!carregando" variant="outlined">
      <v-tabs v-model="aba" class="cadastro__abas" color="primary">
        <v-tab value="dados" prepend-icon="mdi-account-card-outline">Dados</v-tab>
        <v-tab value="bancarios" prepend-icon="mdi-bank-outline">Bancários</v-tab>
        <v-tab value="onboarding" prepend-icon="mdi-progress-check">Onboarding</v-tab>
      </v-tabs>
      <v-divider />

      <v-window v-model="aba">
        <v-window-item value="dados">
          <v-card-text class="cadastro__formulario">
            <section class="cadastro__bloco">
              <header class="cadastro__bloco-cabecalho">
                <h3>Dados pessoais</h3>
                <p>Identificação básica e informações usadas no cadastro do colaborador.</p>
              </header>
              <div class="cadastro__campos cadastro__campos--tres">
                <v-text-field v-model="pessoais.nomeSocial" label="Nome social" :disabled="!podeEditar" />
                <v-text-field
                  v-model="pessoais.nascimento"
                  type="date"
                  label="Data de nascimento"
                  :disabled="!podeEditar"
                />
                <v-select
                  v-model="pessoais.sexo"
                  label="Sexo"
                  :items="['Masculino', 'Feminino']"
                  :disabled="!podeEditar"
                />
                <v-text-field v-model="pessoais.estadoCivil" label="Estado civil" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.racaCor" label="Raça/cor" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.grauInstrucao" label="Grau de instrução" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.nacionalidade" label="Nacionalidade" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.naturalidade" label="Naturalidade" :disabled="!podeEditar" />
              </div>
              <div class="cadastro__campos cadastro__campos--dois">
                <v-text-field v-model="pessoais.nomeMae" label="Nome da mãe" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.nomePai" label="Nome do pai" :disabled="!podeEditar" />
              </div>
            </section>
            <section class="cadastro__bloco">
              <header class="cadastro__bloco-cabecalho">
                <h3>Documentos</h3>
                <p>Registre os documentos conferidos pelo Departamento Pessoal.</p>
              </header>
              <h3 class="cadastro__subtitulo">Identidade e título eleitoral</h3>
              <div class="cadastro__campos cadastro__campos--quatro">
                <v-text-field v-model="pessoais.rgNumero" label="RG" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.rgOrgao" label="Órgão emissor" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.rgUf" label="UF do RG" maxlength="2" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.rgEmissao" type="date" label="Emissão do RG" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.tituloEleitor" label="Título de eleitor" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.tituloZona" label="Zona" :disabled="!podeEditar" />
                <v-text-field v-model="pessoais.tituloSecao" label="Seção" :disabled="!podeEditar" />
              </div>
            </section>
            <section class="cadastro__bloco">
              <header class="cadastro__bloco-cabecalho">
                <h3>Endereço e contato</h3>
                <p>Use estes dados para comunicação e documentos do vínculo.</p>
              </header>
              <div class="cadastro__campos cadastro__campos--quatro">
                <v-text-field v-model="endereco.cep" label="CEP" inputmode="numeric" :disabled="!podeEditar" />
                <v-text-field
                  v-model="endereco.logradouro"
                  label="Logradouro"
                  class="cadastro__campo--duplo"
                  :disabled="!podeEditar"
                />
                <v-text-field v-model="endereco.numero" label="Número" :disabled="!podeEditar" />
                <v-text-field v-model="endereco.complemento" label="Complemento" :disabled="!podeEditar" />
                <v-text-field v-model="endereco.bairro" label="Bairro" :disabled="!podeEditar" />
                <v-text-field v-model="endereco.municipio" label="Município" :disabled="!podeEditar" />
                <v-text-field v-model="endereco.uf" label="UF" maxlength="2" :disabled="!podeEditar" />
                <v-text-field v-model="endereco.telefone" label="Telefone" inputmode="tel" :disabled="!podeEditar" />
                <v-text-field
                  v-model="endereco.email"
                  label="E-mail"
                  type="email"
                  class="cadastro__campo--duplo"
                  :disabled="!podeEditar"
                />
              </div>
            </section>
          </v-card-text>
        </v-window-item>

        <v-window-item value="bancarios">
          <v-card-text class="cadastro__formulario">
            <v-alert type="info" variant="tonal" class="mb-4"
              >Dados bancários são privados e usados somente no fluxo de DP e folha.</v-alert
            >
            <div class="cadastro__campos cadastro__campos--tres">
              <v-text-field v-model="bancarios.banco" label="Banco" :disabled="!podeEditar" />
              <v-text-field v-model="bancarios.agencia" label="Agência" :disabled="!podeEditar" />
              <v-select
                v-model="bancarios.contaTipo"
                label="Tipo de conta"
                :items="['Corrente', 'Poupança', 'Salário']"
                :disabled="!podeEditar"
              />
              <v-text-field v-model="bancarios.conta" label="Conta" :disabled="!podeEditar" />
              <v-text-field v-model="bancarios.contaDigito" label="Dígito" :disabled="!podeEditar" />
            </div>
          </v-card-text>
        </v-window-item>

        <v-window-item value="onboarding">
          <v-card-text class="cadastro__formulario">
            <template v-if="onboarding">
              <v-alert type="info" variant="tonal" class="mb-4">
                Esta etapa é controlada pelo fluxo. O envio para a contabilidade será liberado após a conferência do
                cadastro.
              </v-alert>
              <dl class="cadastro__resumo">
                <div>
                  <dt>Etapa atual</dt>
                  <dd>{{ etapas[onboarding.etapa] }}</dd>
                </div>
                <div>
                  <dt>Versão</dt>
                  <dd>{{ onboarding.versao }}</dd>
                </div>
                <div>
                  <dt>Cadastro completo em</dt>
                  <dd>
                    {{
                      onboarding.cadastroCompletoEm
                        ? new Date(onboarding.cadastroCompletoEm).toLocaleString("pt-BR")
                        : "Ainda não concluído"
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Enviado à contabilidade</dt>
                  <dd>
                    {{
                      onboarding.enviadoContabilidadeEm
                        ? new Date(onboarding.enviadoContabilidadeEm).toLocaleString("pt-BR")
                        : "Ainda não enviado"
                    }}
                  </dd>
                </div>
                <div v-if="onboarding.observacaoRetorno">
                  <dt>Retorno</dt>
                  <dd>{{ onboarding.observacaoRetorno }}</dd>
                </div>
              </dl>
            </template>
            <v-alert v-else type="warning" variant="tonal"
              >Este vínculo ainda não possui onboarding. A criação será conciliada pela API nesta etapa.</v-alert
            >
          </v-card-text>
        </v-window-item>
      </v-window>

      <v-card-actions v-if="podeEditar && aba !== 'onboarding'" class="cadastro__acoes">
        <v-spacer />
        <v-btn color="primary" variant="flat" :loading="salvando" prepend-icon="mdi-content-save" @click="salvar"
          >Salvar cadastro</v-btn
        >
      </v-card-actions>
    </v-card>
  </section>
</template>

<style scoped>
.cadastro {
  margin-top: 0;
}
.cadastro__titulo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.cadastro__titulo h2 {
  font-size: 1.1rem;
}
.cadastro__contexto {
  color: #b7a3ff;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.cadastro__abas {
  border-bottom: 1px solid #303943;
  padding: 0 8px;
}
.cadastro__abas :deep(.v-tab) {
  min-height: 48px;
  text-transform: none;
  font-weight: 700;
}
.cadastro__formulario {
  display: grid;
  gap: 14px;
}
.cadastro__bloco {
  background: #171c22;
  border: 1px solid #303943;
  border-radius: 10px;
  display: grid;
  gap: 16px;
  padding: 18px;
}
.cadastro__bloco-cabecalho {
  display: grid;
  gap: 4px;
}
.cadastro__bloco-cabecalho h3,
.cadastro__subtitulo {
  font-size: 1rem;
  margin: 0;
}
.cadastro__bloco-cabecalho p {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.84rem;
  margin: 0;
}
.cadastro__subtitulo {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.9rem;
}
.cadastro__campos {
  display: grid;
  gap: 12px;
}
.cadastro__campos--dois {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.cadastro__campos--tres,
.cadastro__campos--quatro {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.cadastro__campo--duplo {
  grid-column: span 2;
}
.cadastro :deep(.v-card) {
  background: #1b2128;
  border-color: #303943;
  border-radius: 12px;
  box-shadow: none;
}
.cadastro :deep(.v-field) {
  min-height: 48px;
}
.cadastro__acoes {
  background: #1b2128;
  border-top: 1px solid #303943;
  padding: 16px 24px;
  position: sticky;
  bottom: 0;
  z-index: 2;
}
.cadastro__resumo {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.cadastro__resumo div {
  display: grid;
  gap: 3px;
}
.cadastro__resumo dt {
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 0.82rem;
}
.cadastro__resumo dd {
  margin: 0;
  font-weight: 600;
}
@media (max-width: 800px) {
  .cadastro__campos--quatro,
  .cadastro__campos--tres {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .cadastro__campos--quatro,
  .cadastro__campos--tres,
  .cadastro__campos--dois,
  .cadastro__resumo {
    grid-template-columns: 1fr;
  }
  .cadastro__campo--duplo {
    grid-column: auto;
  }
  .cadastro__acoes {
    padding: 12px 16px;
  }
  .cadastro__acoes .v-btn {
    width: 100%;
    min-height: 44px;
  }
}
</style>
