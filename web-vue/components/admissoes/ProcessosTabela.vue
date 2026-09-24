<script setup lang="ts">
// Idem: import explicito para o componente montar fora do runtime do Nuxt, no teste.
import { computed } from "vue";
import type { ProcessoListaDto } from "@padaria/shared";
import {
  corSituacaoExame,
  corSituacaoFicha,
  corStatusProcesso,
  fichaPedeAtencao,
  iconeSituacaoFicha,
  rotuloIdentidadeProcesso,
  rotuloOrigemProcesso,
  rotuloSituacaoExame,
  rotuloSituacaoFicha,
  rotuloStatusProcesso
} from "~/utils/admissoes";

/**
 * A lista de processos. Extraída da página quando ela passou de 400 linhas (AGENTS.md §4.5).
 *
 * É CONSULTA: não há aqui nenhuma ação de iniciar, efetivar ou criar. O único botão de criação é o
 * "+ Novo cadastro", que fica no cabeçalho da página.
 */
const props = defineProps<{
  linhas: ProcessoListaDto[];
  carregando: boolean;
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  /** Ha recorte aplicado? Muda o que o estado vazio diz — "nao ha nada" e "nada NESTE recorte". */
  filtrado: boolean;
}>();

const emit = defineEmits<{
  (event: "abrir", id: string): void;
  (event: "trocarPagina", pagina: number): void;
}>();

function dataExibida(data: string | null) {
  return data ? data.split("-").reverse().join("/") : "—";
}

/**
 * A faixa exibida, para a regiao viva anunciar o RESULTADO depois de filtrar ou paginar.
 *
 * Calculada a partir do que chegou, e nao de `pagina * porPagina`: na ultima pagina a conta cheia
 * anunciaria itens que nao existem.
 */
const inicioFaixa = computed(() => (props.linhas.length ? (props.pagina - 1) * props.porPagina + 1 : 0));
const fimFaixa = computed(() => inicioFaixa.value + Math.max(0, props.linhas.length - 1));
</script>

<template>
  <!-- A casca responsiva da casa (`main.css`): rolagem horizontal com barra visivel, largura minima
       e — o que faltava aqui — a coluna de acoes GRUDADA na direita em <=768px. Sem ela, o botao
       "Abrir" saia da tela no celular e so era alcancado rolando a tabela inteira (`67` §13.2). -->
  <div v-if="linhas.length" class="responsive-table-shell">
    <v-table density="comfortable">
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
            <!--
              O sinal da ficha mora AQUI, e nao numa nona coluna: a tabela ja tem oito, e uma coluna
              a mais passaria de duas telas de rolagem em 390px. E o mesmo lugar em que a tela de
              Testes poe o alerta de prazo — dentro da celula que ja identifica a pessoa.

              So aparece quando PEDE ACAO. Estado normal repetido em toda linha vira ruido, e ruido
              esconde a excecao. Os demais estados se alcancam pelo filtro.

              Chip com icone E texto: a cor nunca e o unico sinal.
            -->
            <div v-if="fichaPedeAtencao(linha.fichaSituacao)" class="ficha-sinal">
              <span class="d-sr-only">Ficha do candidato:</span>
              <v-chip
                size="x-small"
                variant="tonal"
                :color="corSituacaoFicha(linha.fichaSituacao!)"
                :prepend-icon="iconeSituacaoFicha[linha.fichaSituacao!]"
              >
                {{ rotuloSituacaoFicha[linha.fichaSituacao!] }}
              </v-chip>
            </div>
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
            <!-- UMA acao por linha, e ela abre o processo. A revisao da ficha continua sendo alcancada
                 de dentro do modal: um atalho daqui seria a segunda porta para o mesmo ato. -->
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
  </div>

  <!-- FORA da casca: com `min-width: 680px`, um estado vazio dentro dela ficaria fora da area
       visivel em 390px. Mesma correcao ja aplicada na tela de Testes. -->
  <p v-else-if="!carregando" class="vazio">
    <template v-if="filtrado">
      Nenhum processo neste recorte. Limpe o filtro para ver todos os processos desta empresa.
    </template>
    <template v-else>
      Nenhum processo de admissão nesta empresa ainda. Eles nascem ao efetivar um período de teste ou, aqui, por “+ Novo
      cadastro”.
    </template>
  </p>

  <!--
    Regiao viva SEMPRE montada, com o texto por dentro: regiao que nasce junto com o conteudo
    costuma nao ser anunciada, e anunciar e o ponto — quem filtra precisa saber quantos sobraram
    sem ir procurar com os olhos.
  -->
  <p class="resultado" role="status" aria-live="polite">
    <template v-if="linhas.length">Mostrando {{ inicioFaixa }}–{{ fimFaixa }} de {{ total }}</template>
  </p>

  <nav v-if="totalPaginas > 1" class="paginacao" aria-label="Paginação dos processos">
    <v-btn variant="text" size="small" :disabled="pagina <= 1" @click="emit('trocarPagina', pagina - 1)">
      Anterior
    </v-btn>
    <span aria-live="polite">{{ pagina }} de {{ totalPaginas }}</span>
    <v-btn variant="text" size="small" :disabled="pagina >= totalPaginas" @click="emit('trocarPagina', pagina + 1)">
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
.ficha-sinal {
  margin-top: 4px;
}
.resultado {
  min-height: 1.25rem;
  margin-top: 8px;
  font-size: 0.85rem;
  opacity: 0.75;
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
/* A rolagem, a largura minima e as acoes grudadas vem da `.responsive-table-shell` global
   (`main.css`), que substitui o `overflow-x` solto que existia aqui e nao prendia a coluna de
   acoes. Nada de media query local: a regra e da casa, num lugar so. */
</style>
