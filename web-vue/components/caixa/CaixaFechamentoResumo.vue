<script setup lang="ts">
import type { CaixaOperacional } from "~/types/padaria";
import { formatarDataHora } from "~/utils/formatacao";

type Fechamento = {
  caixaResponsavelNome: string;
  supervisorResponsavelNome: string;
};

defineProps<{ caixa: CaixaOperacional; fechamento: Fechamento; responsaveisPendentes: boolean }>();
</script>

<template>
  <section id="fechamento-painel-1" class="fechamento-resumo" aria-labelledby="resumo-turno-titulo">
    <span class="fechamento-resumo__sobretitulo">Etapa 1 · identificação</span>
    <h3 id="resumo-turno-titulo">Identificação do fechamento</h3>
    <p class="text-body-2 text-medium-emphasis">Informe os responsáveis antes de seguir.</p>

    <section class="fechamento-resumo__responsaveis" aria-label="Responsáveis pelo fechamento">
      <div class="fechamento-resumo__responsaveis-cabecalho">
        <v-icon icon="mdi-account-check-outline" size="22" />
        <div>
          <span>Responsáveis do encerramento</span>
          <strong>Quem está conferindo este caixa?</strong>
        </div>
      </div>
      <v-row dense>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="fechamento.caixaResponsavelNome"
            data-teste="responsavel-fechamento-wizard"
            label="Responsável pelo caixa"
            prepend-inner-icon="mdi-account-cash-outline"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="fechamento.supervisorResponsavelNome"
            data-teste="supervisor-fechamento-wizard"
            label="Supervisor responsável"
            prepend-inner-icon="mdi-account-supervisor-outline"
          />
        </v-col>
      </v-row>
      <p v-if="responsaveisPendentes" class="fechamento-resumo__ajuda mb-0">
        Preencha os dois responsáveis para continuar.
      </p>
    </section>

    <section class="fechamento-resumo__turno" aria-label="Resumo do turno">
      <header>
        <div>
          <span>Resumo do turno</span>
          <strong>Dados definidos na abertura</strong>
        </div>
      </header>
      <dl class="fechamento-resumo__dados">
        <div>
          <dt>PDV</dt>
          <dd>{{ caixa.pdvNome }}</dd>
        </div>
        <div>
          <dt>Turno</dt>
          <dd>{{ caixa.turnoNome ?? "Não informado" }}</dd>
        </div>
        <div>
          <dt>Aberto em</dt>
          <dd>{{ formatarDataHora(caixa.dataHoraAbertura) }}</dd>
        </div>
        <div>
          <dt>Fechamento iniciado</dt>
          <dd>{{ caixa.fechamentoIniciadoEm ? formatarDataHora(caixa.fechamentoIniciadoEm) : "Não informado" }}</dd>
        </div>
        <div>
          <dt>Responsável na abertura</dt>
          <dd>{{ caixa.caixaResponsavelNomeAbertura ?? caixa.usuarioCaixaNome }}</dd>
        </div>
        <div>
          <dt>Maquininha</dt>
          <dd>
            {{ caixa.maquininhaApelido ?? "Não selecionada"
            }}<template v-if="caixa.maquininhaNumeroSerie"> · {{ caixa.maquininhaNumeroSerie }} </template>
          </dd>
        </div>
      </dl>
    </section>
  </section>
</template>

<style scoped>
.fechamento-resumo {
  padding: clamp(16px, 3vw, 28px);
  border: 1px solid var(--cx-line);
  border-radius: 16px;
  background: var(--cx-surface);
}
.fechamento-resumo h3 {
  margin: 0 0 4px;
}
.fechamento-resumo__sobretitulo {
  display: block;
  margin-bottom: 4px;
  color: var(--cx-positive);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.fechamento-resumo__dados {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0 0;
}
.fechamento-resumo__dados div {
  min-width: 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--cx-surface-sunken);
}
.fechamento-resumo__dados dt {
  color: var(--cx-ink-soft);
  font-size: 0.72rem;
  font-weight: 700;
}
.fechamento-resumo__dados dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}
.fechamento-resumo__ajuda {
  color: var(--cx-negative);
  font-size: 0.82rem;
  font-weight: 700;
}
.fechamento-resumo__responsaveis {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--cx-positive) 45%, var(--cx-line));
  border-radius: 12px;
  background: color-mix(in srgb, var(--cx-positive) 9%, var(--cx-surface));
}
.fechamento-resumo__responsaveis-cabecalho {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.fechamento-resumo__responsaveis-cabecalho :deep(.v-icon) {
  color: var(--cx-positive);
}
.fechamento-resumo__responsaveis-cabecalho span,
.fechamento-resumo__turno header span {
  display: block;
  color: var(--cx-positive);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.fechamento-resumo__responsaveis-cabecalho strong,
.fechamento-resumo__turno header strong {
  display: block;
  margin-top: 2px;
}
.fechamento-resumo__turno {
  margin-top: 20px;
}
@media (max-width: 720px) {
  .fechamento-resumo__dados {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 420px) {
  .fechamento-resumo__dados {
    grid-template-columns: 1fr;
  }
}
</style>
