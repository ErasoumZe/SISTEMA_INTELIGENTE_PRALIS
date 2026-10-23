<script setup lang="ts">
import { ROTAS_EXPORTACAO_QUESTOR, type QuestorExportacaoHistoricoDto } from "@padaria/shared";
import { ErroApiCliente } from "~/composables/useApi";
import { useArquivoQuestor } from "~/composables/useArquivoQuestor";

const { apiGet } = useApi();
const { baixar } = useArquivoQuestor();
const itens = ref<QuestorExportacaoHistoricoDto[]>([]);
const carregando = ref(false);
const baixando = ref("");
const erro = ref("");

const ROTULO_RESULTADO: Record<QuestorExportacaoHistoricoDto["resultado"], string> = {
  previa: "Técnico (não importar)",
  gerado: "Oficial",
  bloqueado: "Recusado",
  falhou: "Falhou"
};
const COR_RESULTADO: Record<QuestorExportacaoHistoricoDto["resultado"], string> = {
  previa: "info",
  gerado: "success",
  bloqueado: "warning",
  falhou: "error"
};

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    itens.value = await apiGet<QuestorExportacaoHistoricoDto[]>(`${ROTAS_EXPORTACAO_QUESTOR.historico}?limite=30`);
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Histórico de exportações indisponível.";
  } finally {
    carregando.value = false;
  }
}

async function baixarDeNovo(item: QuestorExportacaoHistoricoDto) {
  baixando.value = item.id;
  erro.value = "";
  try {
    await baixar(ROTAS_EXPORTACAO_QUESTOR.arquivo.replace(":id", item.id));
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível baixar o arquivo.";
  } finally {
    baixando.value = "";
  }
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

defineExpose({ carregar });
onMounted(() => void carregar());
</script>

<template>
  <v-card variant="outlined">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
      Histórico de exportações
      <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="carregando" @click="carregar"
        >Atualizar</v-btn
      >
    </v-card-title>
    <v-card-text>
      <v-alert v-if="erro" type="warning" variant="tonal" class="mb-3">{{ erro }}</v-alert>
      <ul v-if="itens.length" class="historico">
        <li v-for="item in itens" :key="item.id" class="historico__item">
          <div class="historico__quem">
            <strong>{{
              item.tipo === "admissao" ? "TXT de admissão" : `CSV de eventos ${item.competencia?.slice(0, 7) ?? ""}`
            }}</strong>
            <v-chip size="x-small" :color="COR_RESULTADO[item.resultado]" variant="tonal">{{
              ROTULO_RESULTADO[item.resultado]
            }}</v-chip>
          </div>
          <small class="muted">
            {{ dataHora(item.geradoEm) }} · {{ item.geradoPorNome ?? "—" }} · SHA-256 {{ item.sha256.slice(0, 12) }}…
          </small>
          <small v-if="item.motivoRegeracao" class="muted">Regerado: {{ item.motivoRegeracao }}</small>
          <details v-if="item.diagnosticos.length" class="historico__motivos">
            <summary>{{ item.diagnosticos.length }} motivo(s) da recusa</summary>
            <ul>
              <li v-for="motivo in item.diagnosticos.slice(0, 30)" :key="motivo">{{ motivo }}</li>
            </ul>
          </details>
          <v-btn
            v-if="item.temArquivo"
            size="small"
            variant="outlined"
            prepend-icon="mdi-download"
            class="historico__baixar"
            :loading="baixando === item.id"
            @click="baixarDeNovo(item)"
            >Baixar</v-btn
          >
        </li>
      </ul>
      <p v-else-if="!erro && !carregando" class="muted">Nenhuma exportação registrada.</p>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.historico {
  display: grid;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}
.historico__item {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid rgba(var(--v-border-color), 0.2);
}
.historico__quem {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.historico__motivos {
  font-size: 0.85rem;
}
.historico__baixar {
  justify-self: start;
}
.muted {
  color: rgba(var(--v-theme-on-surface), 0.68);
  overflow-wrap: anywhere;
}
</style>
