<script setup lang="ts">
import type { FuncaoOpcaoDto, TurnoOpcaoDto } from "@padaria/shared";
import { cpfValido, normalizarCpf } from "@padaria/shared";
import {
  rotuloEtiquetaTurno,
  rotuloDiaSemanaCurto,
  diagnosticoTurnos,
  mensagemDiagnosticoTurnos,
  motivoTurnoIndisponivel
} from "~/utils/admissoes";

/**
 * "+ Novo cadastro" — a UNICA entrada de admissao direta.
 *
 * O DP preenche o pre-cadastro ANTES de qualquer link: nome, CPF, data de admissao, funcao e turno.
 * Nao pergunta empresa nem CNPJ — vem do perfil, e aparecem so para conferencia.
 *
 * Quem veio de um periodo de teste NAO passa por aqui: efetivar o teste ja cria o processo, na
 * propria tela de Testes. Nao existe segundo caminho para o mesmo ato.
 */
const props = defineProps<{
  aberto: boolean;
  funcoes: FuncaoOpcaoDto[];
  // Sem este sinal, lista vazia por erro e lista vazia por cadastro vazio sao indistinguiveis.
  funcoesFalharam: boolean;
  turnos: TurnoOpcaoDto[];
  // Sem este sinal, lista vazia por erro e lista vazia por cadastro vazio sao indistinguiveis.
  turnosFalharam: boolean;
  empresaNome: string;
  empresaCnpj: string;
  salvando: boolean;
  erro: string;
}>();

const emit = defineEmits<{
  (event: "fechar"): void;
  (
    event: "salvar",
    dados: { nomeCompleto: string; cpf: string; funcaoId: string; turnoId: string; dataAdmissao: string }
  ): void;
}>();

const formulario = reactive({ nomeCompleto: "", cpf: "", funcaoId: "", turnoId: "", dataAdmissao: "" });

watch(
  () => props.aberto,
  (aberto) => {
    if (!aberto) return;
    formulario.nomeCompleto = "";
    formulario.cpf = "";
    formulario.funcaoId = "";
    formulario.turnoId = "";
    formulario.dataAdmissao = "";
  }
);

// So as funcoes ATIVAS: este e um cadastro NOVO, e apontar para catalogo fora de uso ja nasceria errado.
const funcoesAtivas = computed(() => props.funcoes.filter((funcao) => funcao.ativo));
const avisoFuncoes = computed(() => {
  if (props.funcoesFalharam) return "Não foi possível carregar as funções. Feche e tente novamente.";
  if (funcoesAtivas.value.length === 0) return "Cadastre uma função operacional ativa antes de iniciar a admissão.";
  return "";
});

/**
 * Turno INCOMPLETO aparece na lista, desabilitado, dizendo o que falta.
 *
 * Esconder seria pior: o DP procuraria um turno que existe no cadastro e nao acharia, sem entender
 * por quê. O servidor recusa de qualquer forma — isto é a explicação, não a garantia.
 */
const opcoesTurno = computed(() =>
  props.turnos.map((turno) => {
    const motivo = motivoTurnoIndisponivel(turno);
    return {
      ...turno,
      // "inativo" e "incompleto" sao motivos DIFERENTES. Chamar os dois de incompleto mandava
      // o DP procurar etiqueta e dias num turno que ja os tinha — e so estava desativado.
      titulo: motivo
        ? `${turno.nome} — ${motivo}`
        : `${rotuloEtiquetaTurno[turno.etiqueta as "M" | "T" | "I"] ?? turno.etiqueta} · ${(turno.diasSemana ?? []).map(rotuloDiaSemanaCurto).join(", ")} · ${turno.horaInicio.slice(0, 5)}–${turno.horaFim.slice(0, 5)}`
    };
  })
);
const temTurnoIndisponivel = computed(() => props.turnos.some((turno) => !turno.completo));

// Quatro causas, quatro frases. A regra e pura e testada em `utils/admissoes`.
const diagnostico = computed(() => diagnosticoTurnos(props.turnos, props.turnosFalharam));
const avisoTurnos = computed(() => (diagnostico.value === "ok" ? "" : mensagemDiagnosticoTurnos[diagnostico.value]));

const cpfNormalizado = computed(() => normalizarCpf(formulario.cpf));
const cpfErro = computed(() => {
  if (!formulario.cpf.trim()) return "";
  return cpfValido(formulario.cpf) ? "" : "CPF inválido";
});

const podeSalvar = computed(
  () =>
    formulario.nomeCompleto.trim().length > 0 &&
    cpfValido(formulario.cpf) &&
    Boolean(formulario.funcaoId) &&
    Boolean(formulario.turnoId) &&
    Boolean(formulario.dataAdmissao)
);

function salvar() {
  if (!podeSalvar.value) return;
  emit("salvar", {
    nomeCompleto: formulario.nomeCompleto.trim(),
    cpf: cpfNormalizado.value,
    funcaoId: formulario.funcaoId,
    turnoId: formulario.turnoId,
    dataAdmissao: formulario.dataAdmissao
  });
}
</script>

<template>
  <v-dialog
    :model-value="aberto"
    max-width="720"
    scrollable
    persistent
    @update:model-value="(valor) => !valor && emit('fechar')"
  >
    <v-card role="dialog" aria-labelledby="titulo-novo-cadastro">
      <v-card-title id="titulo-novo-cadastro" class="d-flex align-center justify-space-between">
        <span>Novo cadastro de admissão</span>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="emit('fechar')" />
      </v-card-title>
      <v-card-subtitle>Admissão direta, sem período de teste.</v-card-subtitle>

      <v-card-text>
        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4" role="alert">
          {{ erro }}
        </v-alert>

        <v-alert v-if="avisoFuncoes" type="warning" variant="tonal" density="compact" class="mb-4" role="alert">
          {{ avisoFuncoes }}
        </v-alert>

        <!-- Empresa e CNPJ vêm do perfil. Não há seletor, e não há como digitá-los. -->
        <div class="empresa">
          <span class="empresa-rotulo">Empresa</span>
          <strong>{{ empresaNome || "—" }}</strong>
          <span v-if="empresaCnpj" class="empresa-cnpj">CNPJ {{ empresaCnpj }}</span>
        </div>

        <v-alert
          v-if="avisoTurnos"
          :type="diagnostico === 'falha_carregamento' ? 'error' : 'warning'"
          variant="tonal"
          density="compact"
          class="mb-4"
          role="alert"
        >
          {{ avisoTurnos }}
        </v-alert>

        <form class="formulario" @submit.prevent="salvar">
          <v-text-field
            v-model="formulario.nomeCompleto"
            label="Nome completo *"
            density="comfortable"
            autofocus
            maxlength="200"
          />
          <v-text-field
            v-model="formulario.cpf"
            label="CPF *"
            density="comfortable"
            inputmode="numeric"
            placeholder="000.000.000-00"
            :error-messages="cpfErro"
          />
          <v-select
            v-model="formulario.funcaoId"
            :items="funcoesAtivas"
            item-title="nome"
            item-value="id"
            label="Função operacional *"
            density="comfortable"
          />
          <v-select
            v-model="formulario.turnoId"
            :items="opcoesTurno"
            item-title="titulo"
            item-value="id"
            :item-props="(item) => ({ disabled: !item.completo })"
            label="Turno *"
            density="comfortable"
            :hint="temTurnoIndisponivel ? 'Turnos incompletos ou inativos aparecem desabilitados.' : ''"
            persistent-hint
          />
          <v-text-field
            v-model="formulario.dataAdmissao"
            label="Data de admissão *"
            type="date"
            density="comfortable"
          />
        </form>

        <p class="nota">
          Endereço, dependentes e documentos chegam depois, com a resposta do candidato — não são preenchidos aqui.
        </p>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="salvando" @click="emit('fechar')">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!podeSalvar || salvando" @click="salvar">
          Criar processo
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.formulario {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}
.formulario > :first-child {
  grid-column: 1 / -1;
}
.empresa {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: 10px 12px;
  margin-bottom: 16px;
  border: 1px solid rgb(var(--v-border-color), 0.25);
  border-radius: 8px;
  font-size: 0.9rem;
}
.empresa-rotulo,
.empresa-cnpj {
  font-size: 0.78rem;
  opacity: 0.7;
}
.nota {
  font-size: 0.8rem;
  opacity: 0.75;
  margin-top: 10px;
}
@media (max-width: 768px) {
  .formulario {
    grid-template-columns: 1fr;
  }
}
</style>
