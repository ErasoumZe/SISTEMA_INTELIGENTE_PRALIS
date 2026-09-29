<script setup lang="ts">
import type { ProcessoDetalheDto, RespostaExamesComplementares, TipoExameOcupacional } from "@padaria/shared";
import { computed } from "vue";
import { formatarDataHora } from "~/utils/formatacao";

const props = defineProps<{
  aberto: boolean;
  processo: ProcessoDetalheDto | null;
  cpf: string | null;
  empresaNome: string;
  empresaCnpj: string;
}>();

const emit = defineEmits<{ (event: "fechar"): void }>();

const rotulosTipoExame: Record<TipoExameOcupacional, string> = {
  admissional: "Admissional",
  periodico: "Periódico",
  mudanca_funcao: "Mudança de função",
  retorno_trabalho: "Retorno ao trabalho",
  demissional: "Demissional",
  pcd: "Pessoa com deficiência"
};

const rotulosComplementares: Record<RespostaExamesComplementares, string> = {
  sim: "Sim",
  nao: "Não",
  nao_sabe: "Não sabe"
};

const tipoExame = computed(() => {
  const tipo = props.processo?.internos.exameTipo;
  return tipo ? rotulosTipoExame[tipo] : "Não informado";
});

const complementares = computed(() => {
  const resposta = props.processo?.internos.exameComplementares;
  return resposta ? rotulosComplementares[resposta] : "Não informado";
});

function data(valor: string | null | undefined) {
  return valor ? valor.split("-").reverse().join("/") : "Não informado";
}

function valor(valor: string | null | undefined) {
  return valor || "Não informado";
}

function escaparHtml(valor: string) {
  return valor.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * A prévia é a fonte da impressão. Abrir uma janela isolada impede que menu, modal e dados vizinhos
 * entrem no PDF; o browser continua sendo quem oferece "Imprimir" ou "Salvar como PDF".
 */
function imprimir() {
  const processo = props.processo;
  if (!processo) return;
  const janela = window.open("", "_blank");
  if (!janela) return;
  janela.opener = null;
  const linhas: Array<[string, string]> = [
    ["Empresa", valor(props.empresaNome)],
    ["CNPJ", valor(props.empresaCnpj)],
    ["Clínica", valor(processo.internos.exameClinica)],
    ["Colaborador", valor(processo.nomeCompleto)],
    ["CPF", valor(props.cpf)],
    ["Função", valor(processo.funcaoNome)],
    ["Data de admissão", data(processo.internos.dataAdmissao)],
    ["Tipo de exame", tipoExame.value],
    ["Exames complementares", complementares.value],
    ["Unidade", valor(processo.internos.exameUnidade)],
    [
      "Agendado para",
      processo.internos.exameAgendadoPara ? formatarDataHora(processo.internos.exameAgendadoPara) : "Não informado"
    ],
    ["Responsável", valor(processo.internos.exameResponsavelNome)],
    ["Telefone", valor(processo.internos.exameResponsavelTelefone)]
  ]
    .map(([rotulo, conteudo]) => `<tr><th>${escaparHtml(rotulo)}</th><td>${escaparHtml(conteudo)}</td></tr>`)
    .join("");

  janela.document
    .write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Guia de exame ocupacional</title><style>
    @page { size: A4; margin: 18mm; } body { font: 12pt Arial, sans-serif; color: #18231d; }
    h1 { font-size: 18pt; margin: 0 0 4px; } .subtitulo { color: #56705e; margin: 0 0 24px; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #9ca9a0; padding: 10px; text-align: left; vertical-align: top; }
    th { width: 35%; background: #edf4ee; } .nota { margin-top: 28px; font-size: 9pt; color: #526057; }
    .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 55px; } .linha { border-top: 1px solid #27352d; padding-top: 6px; }
  </style></head><body><h1>Guia de encaminhamento de exame ocupacional</h1><p class="subtitulo">Gerada pelo Sistema Pralis</p><table>${linhas}</table><p class="nota">Nascimento, RG, setor e CBO não são impressos sem terem sido conferidos no cadastro. Esta guia não substitui o ASO.</p><div class="assinaturas"><div class="linha">Responsável pelo encaminhamento</div><div class="linha">Data de encaminhamento</div></div><script>window.onload = () => window.print();<\/script></body></html>`);
  janela.document.close();
}
</script>

<template>
  <v-dialog :model-value="aberto" max-width="860" scrollable @update:model-value="(valor) => !valor && emit('fechar')">
    <v-card v-if="processo">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Guia de exame ocupacional</span>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="emit('fechar')" />
      </v-card-title>
      <v-card-text>
        <v-alert v-if="!cpf" type="warning" variant="tonal" density="compact" class="mb-4">
          O CPF não foi revelado para esta guia. Revele-o no detalhe do processo antes de imprimir.
        </v-alert>
        <article class="guia-a4">
          <p class="marca">PRALIS · DP</p>
          <h1>Guia de encaminhamento de exames</h1>
          <p class="clinica">{{ processo.internos.exameClinica || "Clínica não informada" }}</p>
          <dl>
            <dt>Empresa / CNPJ</dt>
            <dd>{{ empresaNome || "Não informado" }} · {{ empresaCnpj || "Não informado" }}</dd>
            <dt>Colaborador / CPF</dt>
            <dd>{{ processo.nomeCompleto || "Não informado" }} · {{ cpf || "CPF não revelado" }}</dd>
            <dt>Função / admissão</dt>
            <dd>{{ processo.funcaoNome || "Não informado" }} · {{ data(processo.internos.dataAdmissao) }}</dd>
            <dt>Tipo / complementares</dt>
            <dd>{{ tipoExame }} · {{ complementares }}</dd>
            <dt>Unidade / agendamento</dt>
            <dd>
              {{ processo.internos.exameUnidade || "Não informado" }} ·
              {{
                processo.internos.exameAgendadoPara
                  ? formatarDataHora(processo.internos.exameAgendadoPara)
                  : "Não agendado"
              }}
            </dd>
            <dt>Responsável / telefone</dt>
            <dd>
              {{ processo.internos.exameResponsavelNome || "Não informado" }} ·
              {{ processo.internos.exameResponsavelTelefone || "Não informado" }}
            </dd>
          </dl>
          <p class="observacao">
            Nascimento, RG, setor e CBO serão incluídos somente após conferência na ficha/cadastro.
          </p>
        </article>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('fechar')">Fechar</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!cpf" @click="imprimir">Imprimir / salvar PDF</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.guia-a4 {
  max-width: 680px;
  margin: 0 auto;
  border: 1px solid #9ca9a0;
  padding: 32px;
  color: #18231d;
  background: #fff;
}
.marca {
  color: #37764a;
  font-size: 0.78rem;
  font-weight: 700;
  margin: 0;
}
.guia-a4 h1 {
  font-size: 1.4rem;
  margin: 4px 0;
}
.clinica {
  margin: 0 0 22px;
  color: #4e6254;
}
.guia-a4 dl {
  display: grid;
  grid-template-columns: minmax(150px, 0.8fr) 1.6fr;
  margin: 0;
}
.guia-a4 dt,
.guia-a4 dd {
  border: 1px solid #b8c2ba;
  padding: 10px;
  margin: 0;
}
.guia-a4 dt {
  font-weight: 700;
  background: #edf4ee;
}
.observacao {
  font-size: 0.78rem;
  color: #526057;
  margin: 20px 0 0;
}
@media (max-width: 600px) {
  .guia-a4 {
    padding: 16px;
  }
  .guia-a4 dl {
    grid-template-columns: 1fr;
  }
  .guia-a4 dt {
    border-bottom: 0;
  }
  .guia-a4 dd {
    border-top: 0;
  }
}
</style>
