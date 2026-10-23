<script setup lang="ts">
import type { AuthSession, QuestorEstadoExportacaoDto } from "@padaria/shared";
import { ROTAS_EXPORTACAO_QUESTOR, temPermissao } from "@padaria/shared";
import AppShell from "~/components/app/AppShell.vue";
import QuestorExportacaoAdmissoes from "~/components/conplus/QuestorExportacaoAdmissoes.vue";
import QuestorEventosVariaveis from "~/components/conplus/QuestorEventosVariaveis.vue";
import QuestorExportacoesHistorico from "~/components/conplus/QuestorExportacoesHistorico.vue";
import { usePermissoes } from "~/composables/usePermissoes";
import type { Opcao } from "~/types/padaria";
import { mensagemErro } from "~/utils/domain";

/**
 * Exportações Questor: TXT de admissão, CSV de eventos variáveis e o histórico auditado. Cada seção
 * aparece só para quem tem a permissão dela; a regra de verdade está no servidor.
 */
const { carregarSessao, apiGet } = useApi();
const estado = ref<QuestorEstadoExportacaoDto | null>(null);
const router = useRouter();
const sessao = ref<AuthSession | null>(null);
const carregando = ref(true);
const erro = ref("");
const historico = ref<InstanceType<typeof QuestorExportacoesHistorico> | null>(null);
const permissoesAtuais = computed(() => sessao.value?.perfil?.permissoes ?? []);
const { telasPermitidas, telasDesabilitadasMenu, motivosTelasDesabilitadas } = usePermissoes(
  permissoesAtuais,
  () => false
);
const empresas = computed<Opcao[]>(() =>
  (sessao.value?.empresas ?? []).map((empresa) => ({ id: empresa.id, nome: empresa.nome }))
);
const empresaId = computed(() => sessao.value?.perfil?.empresaId ?? empresas.value[0]?.id ?? "");
const podeAdmissoes = computed(() => temPermissao(permissoesAtuais.value, "conplus_exportar_admissoes"));
const podeEventos = computed(() => temPermissao(permissoesAtuais.value, "conplus_exportar_eventos"));

const atualizarHistorico = () => void historico.value?.carregar();

onMounted(async () => {
  try {
    sessao.value = await carregarSessao();
    if (!sessao.value) {
      await router.push("/login");
      return;
    }
    if (!podeAdmissoes.value && !podeEventos.value) erro.value = "Sem permissão para as exportações Questor.";
    else estado.value = await apiGet<QuestorEstadoExportacaoDto>(ROTAS_EXPORTACAO_QUESTOR.estado);
  } catch (falha) {
    erro.value = mensagemErro(falha);
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
    tela-ativa="departamento_pessoal"
    :empresas="empresas"
    :empresa-id="empresaId"
    :caixa-status="null"
    :telas-desabilitadas="telasDesabilitadasMenu"
    :motivos-telas-desabilitadas="motivosTelasDesabilitadas"
    :carregando-empresa="false"
  >
    <v-alert v-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>
    <main v-else class="questor-exportacao">
      <header>
        <p class="questor-exportacao__eyebrow">Departamento pessoal · Conplus</p>
        <h1>Exportações Questor</h1>
        <p class="questor-exportacao__texto">
          Arquivos montados a partir dos dados gravados no Pralís, com auditoria (SHA-256) e histórico. Nada é enviado à
          Conplus automaticamente; os arquivos oficiais ficam bloqueados até a homologação.
        </p>
      </header>
      <section v-if="estado" class="questor-exportacao__estado" aria-label="Situação das exportações">
        <v-chip :color="estado.oficialLiberado ? 'success' : 'error'" variant="flat" size="small">
          {{ estado.oficialLiberado ? "Oficial liberado (homologado)" : "Oficial bloqueado" }}
        </v-chip>
        <v-chip :color="estado.tecnicoDisponivel ? 'warning' : 'default'" variant="tonal" size="small">
          {{ estado.tecnicoDisponivel ? "Técnico disponível — não importar" : "Técnico encerrado" }}
        </v-chip>
        <v-chip variant="tonal" size="small">Prévia: sempre disponível, não grava</v-chip>
        <v-chip variant="tonal" size="small">API Conplus: ainda não disponível</v-chip>
        <p v-if="estado.motivoBloqueio" class="questor-exportacao__texto">{{ estado.motivoBloqueio }}</p>
      </section>
      <QuestorExportacaoAdmissoes v-if="podeAdmissoes" :estado="estado" @gerado="atualizarHistorico" />
      <QuestorEventosVariaveis v-if="podeEventos" :estado="estado" @gerado="atualizarHistorico" />
      <QuestorExportacoesHistorico v-if="podeAdmissoes || podeEventos" ref="historico" />
    </main>
  </AppShell>
</template>

<style scoped>
.questor-exportacao {
  display: grid;
  gap: var(--cx-sp-5);
  max-width: 1180px;
  margin: 0 auto;
  padding-bottom: var(--cx-sp-8);
  min-width: 0;
}
.questor-exportacao header {
  display: grid;
  gap: var(--cx-sp-2);
}
.questor-exportacao h1 {
  margin: 0;
}
.questor-exportacao__texto {
  margin: 0;
  color: var(--cx-ink-soft);
}
.questor-exportacao__estado {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.questor-exportacao__estado p {
  flex-basis: 100%;
}
.questor-exportacao__eyebrow {
  margin: 0;
  font-size: var(--cx-fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
</style>
