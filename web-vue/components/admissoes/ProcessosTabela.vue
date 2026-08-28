<script setup lang="ts">
import type { ProcessoListaDto } from "@padaria/shared";
import {
  corSituacaoExame,
  corStatusProcesso,
  rotuloIdentidadeProcesso,
  rotuloOrigemProcesso,
  rotuloSituacaoExame,
  rotuloStatusProcesso
} from "~/utils/admissoes";

/**
 * A lista de processos. Extraída da página quando ela passou de 400 linhas (AGENTS.md §4.5).
 *
 * É CONSULTA: não há aqui nenhuma ação de iniciar, efetivar ou criar. O único botão de criação é o
 * "+ Novo cadastro", que fica no cabeçalho da página.
 */
defineProps<{
  linhas: ProcessoListaDto[];
  carregando: boolean;
  pagina: number;
  totalPaginas: number;
}>();

const emit = defineEmits<{
  (event: "abrir", id: string): void;
  (event: "trocarPagina", pagina: number): void;
}>();

function dataExibida(data: string | null) {
  return data ? data.split("-").reverse().join("/") : "—";
}
</script>

<template>
  <v-table v-if="linhas.length" density="comfortable">
    <caption class="d-sr-only">
      Processos de admissão desta empresa
    </caption>
    <thead>
      <tr>
        <th scope="col">Candidato</th>
        <th scope="col">Origem</th>
        <th scope="col">Função</th>
        <th scope="col">Turno</th>
        <th scope="col">Admissão</th>
        <th scope="col">Exame</th>
        <th scope="col">Status</th>
        <th scope="col"><span class="d-sr-only">Ações</span></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="linha in linhas" :key="linha.id">
        <td>
          <!-- Processo direto ainda sem resposta do candidato não tem nome. A tela diz isso, em vez
               de mostrar um traço que parece defeito. -->
          <span :class="{ 'sem-nome': !linha.nomeCompleto }">
            {{ rotuloIdentidadeProcesso(linha.nomeCompleto) }}
          </span>
        </td>
        <td>{{ rotuloOrigemProcesso[linha.origem] }}</td>
        <td>{{ linha.funcaoNome ?? "—" }}</td>
        <td>{{ linha.turnoResumo ?? "—" }}</td>
        <td>{{ dataExibida(linha.dataAdmissao) }}</td>
        <td>
          <v-chip size="x-small" variant="tonal" :color="corSituacaoExame(linha.exameSituacao)">
            {{ rotuloSituacaoExame[linha.exameSituacao] }}
          </v-chip>
        </td>
        <td>
          <v-chip size="x-small" variant="tonal" :color="corStatusProcesso(linha.status)">
            {{ rotuloStatusProcesso[linha.status] }}
          </v-chip>
        </td>
        <td class="text-end">
          <v-btn
            variant="text"
            size="small"
            :aria-label="`Abrir processo de ${rotuloIdentidadeProcesso(linha.nomeCompleto)}`"
            @click="emit('abrir', linha.id)"
          >
            Abrir
          </v-btn>
        </td>
      </tr>
    </tbody>
  </v-table>

  <p v-else-if="!carregando" class="vazio">
    Nenhum processo de admissão nesta empresa ainda. Eles nascem ao efetivar um período de teste
    ou, aqui, por “+ Novo cadastro”.
  </p>

  <nav v-if="totalPaginas > 1" class="paginacao" aria-label="Paginação dos processos">
    <v-btn variant="text" size="small" :disabled="pagina <= 1" @click="emit('trocarPagina', pagina - 1)">
      Anterior
    </v-btn>
    <span aria-live="polite">{{ pagina }} de {{ totalPaginas }}</span>
    <v-btn
      variant="text"
      size="small"
      :disabled="pagina >= totalPaginas"
      @click="emit('trocarPagina', pagina + 1)"
    >
      Próxima
    </v-btn>
  </nav>
</template>

<style scoped>
.sem-nome {
  opacity: 0.7;
  font-style: italic;
}
.vazio {
  font-size: 0.9rem;
  opacity: 0.75;
  padding: 24px 0;
}
.paginacao {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
  font-size: 0.85rem;
}
.d-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (max-width: 768px) {
  /* A tabela rola em vez de espremer sete colunas num celular. */
  :deep(.v-table__wrapper) {
    overflow-x: auto;
  }
}
</style>
