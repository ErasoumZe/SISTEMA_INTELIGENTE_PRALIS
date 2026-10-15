<script setup lang="ts">
import type { AuthSession } from "@padaria/shared";
import { temPermissao } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import { formatarDataSomenteDia, mascararCpf } from "~/utils/formatacao";
import { mensagemErro } from "~/utils/domain";

const props = defineProps<{ colaboradorId: string }>();
type Vinculo = { id: string; matricula: string; status: "ativo" | "desligado"; admitidoEm: string; funcaoNome: string };
type Perfil = {
  id: string;
  nome: string;
  cpf: string | null;
  situacao: "ativo" | "inativo" | "conciliacao_pendente";
  vinculos: Vinculo[];
  eventos: Array<{ id: string; tipo: string; atorNome: string | null; ocorridoEm: string }>;
  onboarding: { etapa: string } | null;
  dadosPessoais: Record<string, string | null> | null;
  enderecoContato: Record<string, string | null> | null;
  dadosBancarios: Record<string, string | null> | null;
};
const router = useRouter();
const { apiGet, apiPut, carregarSessao } = useApi();
const sessao = ref<AuthSession | null>(null);
const perfil = ref<Perfil | null>(null);
const carregando = ref(true);
const salvando = ref(false);
const erro = ref("");
const aba = ref("resumo");
const nome = ref("");
const dadosPessoais = ref<Record<string, string | null>>({});
const enderecoContato = ref<Record<string, string | null>>({});
const dadosBancarios = ref<Record<string, string | null>>({});
const permissoes = computed(() => sessao.value?.perfil?.permissoes ?? []);
const podeEditar = computed(() => temPermissao(permissoes.value, "cadastro_colaboradores_editar"));
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(permissoes, () => false);
const empresas = computed(() =>
  (sessao.value?.empresas ?? []).map((empresa) => ({ id: empresa.id, nome: empresa.nome }))
);
const empresaId = computed(() => sessao.value?.perfil?.empresaId ?? empresas.value[0]?.id ?? "");
const vinculoAtivo = computed(() => perfil.value?.vinculos.find((item) => item.status === "ativo") ?? null);
async function carregar() {
  perfil.value = await apiGet<Perfil>(`/api/colaboradores/${props.colaboradorId}/perfil`);
  nome.value = perfil.value.nome;
  dadosPessoais.value = perfil.value.dadosPessoais ?? {};
  enderecoContato.value = perfil.value.enderecoContato ?? {};
  dadosBancarios.value = perfil.value.dadosBancarios ?? {};
}
async function salvar(bloco: "nome" | "dadosPessoais" | "enderecoContato" | "dadosBancarios") {
  if (salvando.value) return;
  salvando.value = true;
  erro.value = "";
  try {
    const payload =
      bloco === "nome"
        ? { nome: nome.value }
        : {
            [bloco]:
              bloco === "dadosPessoais"
                ? dadosPessoais.value
                : bloco === "enderecoContato"
                  ? enderecoContato.value
                  : dadosBancarios.value
          };
    await apiPut(`/api/colaboradores/${props.colaboradorId}/perfil`, payload);
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    salvando.value = false;
  }
}
onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) return void router.push("/login");
    await carregar();
  } catch (error) {
    erro.value = mensagemErro(error);
  } finally {
    carregando.value = false;
  }
});
</script>
<template>
  <v-progress-linear v-if="carregando" indeterminate color="primary" />
  <AppShell
    v-else-if="sessao"
    :sessao="sessao"
    :telas="telasPermitidas"
    tela-ativa="colaboradores"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="null"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <main class="perfil">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" @click="router.push('/colaboradores')">Voltar</v-btn
      ><v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
      <section v-if="perfil" class="perfil__hero">
        <div>
          <p>Departamento pessoal / Colaborador</p>
          <h1>{{ perfil.nome }}</h1>
          <span>{{ perfil.cpf ? mascararCpf(perfil.cpf) : "CPF não cadastrado" }}</span>
        </div>
        <v-chip :color="perfil.situacao === 'ativo' ? 'success' : 'warning'" variant="flat">{{
          perfil.situacao
        }}</v-chip>
      </section>
      <v-tabs v-model="aba" color="primary" show-arrows
        ><v-tab value="resumo">Visão geral</v-tab><v-tab value="cadastro">Dados cadastrais</v-tab
        ><v-tab value="vinculos">Vínculos</v-tab><v-tab value="historico">Histórico</v-tab></v-tabs
      >
      <v-window v-if="perfil" v-model="aba" class="mt-4"
        ><v-window-item value="resumo"
          ><v-card variant="outlined"
            ><v-card-title>Vínculo atual</v-card-title
            ><v-card-text v-if="vinculoAtivo"
              ><strong>{{ vinculoAtivo.funcaoNome }}</strong
              ><br />Matrícula {{ vinculoAtivo.matricula }} · Admitido em
              {{ formatarDataSomenteDia(vinculoAtivo.admitidoEm) }}<br /><small
                >Onboarding: {{ perfil.onboarding?.etapa ?? "não criado para vínculo legado" }}</small
              ></v-card-text
            ><v-card-text v-else>Não há vínculo ativo para este colaborador.</v-card-text></v-card
          ></v-window-item
        >
        <v-window-item value="cadastro"
          ><v-row
            ><v-col cols="12" md="6"
              ><v-card variant="outlined"
                ><v-card-title>Dados pessoais</v-card-title
                ><v-card-text
                  ><v-text-field v-model="nome" label="Nome" :disabled="!podeEditar" /><v-btn
                    v-if="podeEditar"
                    class="mb-4"
                    variant="text"
                    :loading="salvando"
                    @click="salvar('nome')"
                    >Salvar nome</v-btn
                  ><v-text-field
                    v-model="dadosPessoais.nomeSocial"
                    label="Nome social"
                    :disabled="!podeEditar"
                  /><v-text-field
                    v-model="dadosPessoais.nascimento"
                    label="Nascimento"
                    type="date"
                    :disabled="!podeEditar"
                  /><v-btn v-if="podeEditar" color="primary" :loading="salvando" @click="salvar('dadosPessoais')"
                    >Salvar dados pessoais</v-btn
                  ></v-card-text
                ></v-card
              ></v-col
            ><v-col cols="12" md="6"
              ><v-card variant="outlined"
                ><v-card-title>Contato e banco</v-card-title
                ><v-card-text
                  ><v-text-field v-model="enderecoContato.cep" label="CEP" :disabled="!podeEditar" /><v-text-field
                    v-model="enderecoContato.telefone"
                    label="Telefone"
                    :disabled="!podeEditar"
                  /><v-text-field v-model="enderecoContato.email" label="E-mail" :disabled="!podeEditar" /><v-text-field
                    v-model="dadosBancarios.banco"
                    label="Banco"
                    :disabled="!podeEditar"
                  /><v-text-field
                    v-model="dadosBancarios.agencia"
                    label="Agência"
                    :disabled="!podeEditar"
                  /><v-text-field v-model="dadosBancarios.conta" label="Conta" :disabled="!podeEditar" /><v-btn
                    v-if="podeEditar"
                    color="primary"
                    :loading="salvando"
                    @click="salvar('enderecoContato')"
                    >Salvar contato</v-btn
                  ><v-btn v-if="podeEditar" variant="text" :loading="salvando" @click="salvar('dadosBancarios')"
                    >Salvar banco</v-btn
                  ></v-card-text
                ></v-card
              ></v-col
            ></v-row
          ></v-window-item
        >
        <v-window-item value="vinculos"
          ><v-card v-for="vinculo in perfil.vinculos" :key="vinculo.id" class="mb-3" variant="outlined"
            ><v-card-title>{{ vinculo.funcaoNome }}</v-card-title
            ><v-card-text
              >{{ vinculo.matricula }} · {{ vinculo.status }} ·
              {{ formatarDataSomenteDia(vinculo.admitidoEm) }}</v-card-text
            ></v-card
          ></v-window-item
        ><v-window-item value="historico"
          ><v-list
            ><v-list-item
              v-for="evento in perfil.eventos"
              :key="evento.id"
              :title="evento.tipo.replaceAll('_', ' ')"
              :subtitle="`${evento.atorNome ?? 'Sistema'} · ${new Date(evento.ocorridoEm).toLocaleString('pt-BR')}`" /></v-list></v-window-item
      ></v-window>
    </main>
  </AppShell>
</template>
<style scoped>
.perfil {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}
.perfil__hero {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin: 8px 0 24px;
}
.perfil__hero p {
  color: #b7a3ff;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}
.perfil__hero h1 {
  font-size: clamp(1.5rem, 4vw, 2.2rem);
}
@media (max-width: 600px) {
  .perfil {
    padding: 16px 12px;
  }
  .perfil__hero {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
