<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { CampoProntidaoQuestor, OrigemPendenciaQuestor, ProntidaoQuestorDto } from "@padaria/shared";

const props = defineProps<{ processoId: string }>();

const { apiGet } = useApi();
const dados = ref<ProntidaoQuestorDto | null>(null);
const carregando = ref(true);
const erro = ref("");

const rotulosOrigem: Record<OrigemPendenciaQuestor, string> = {
  candidato: "Candidato",
  dp: "Departamento Pessoal",
  empresa: "Empresa",
  codigo_questor: "Código Questor",
  externo: "Dependência externa"
};

const campos = computed(() => dados.value?.registros.flatMap((registro) => registro.campos) ?? []);
const prontos = computed(() => campos.value.filter((campo) => campo.situacao === "pronto").length);

const pendenciasPorOrigem = computed(() => {
  const grupos = new Map<OrigemPendenciaQuestor, CampoProntidaoQuestor[]>();
  for (const campo of campos.value) {
    if (campo.situacao === "pronto" || !campo.origem) continue;
    const grupo = grupos.get(campo.origem) ?? [];
    grupo.push(campo);
    grupos.set(campo.origem, grupo);
  }
  return [...grupos.entries()].map(([origem, itens]) => ({ origem, itens }));
});

function situacao(campo: CampoProntidaoQuestor): string {
  if (campo.situacao === "invalido") return "Inválido";
  if (campo.situacao === "bloqueado") return "Bloqueado";
  return "Pendente";
}

function registro(campo: CampoProntidaoQuestor): string {
  return campo.nomeCurto || campo.campo;
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    dados.value = await apiGet<ProntidaoQuestorDto>(`/api/admissoes/processos/${props.processoId}/questor/prontidao`);
  } catch (erroApi) {
    dados.value = null;
    erro.value = erroApi instanceof Error ? erroApi.message : "Não foi possível carregar a prontidão Questor.";
  } finally {
    carregando.value = false;
  }
}

onMounted(carregar);
watch(() => props.processoId, carregar);
</script>

<template>
  <section class="questor-prontidao" aria-labelledby="questor-prontidao-titulo">
    <div class="questor-prontidao__cabecalho">
      <div>
        <p class="questor-prontidao__eyebrow">Prévia somente leitura</p>
        <h2 id="questor-prontidao-titulo">Prontidão para o Questor</h2>
      </div>
      <v-chip v-if="dados" :color="dados.aptoParaExportacao ? 'success' : 'warning'" variant="tonal">
        {{ dados.aptoParaExportacao ? "Sem pendências" : "Requer complementação" }}
      </v-chip>
    </div>

    <v-progress-linear v-if="carregando" indeterminate color="primary" aria-label="Carregando prontidão Questor" />
    <v-alert v-else-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>

    <template v-else-if="dados">
      <div class="questor-prontidao__resumo" aria-label="Resumo da prontidão">
        <div>
          <strong>{{ prontos }}</strong
          ><span>Prontos</span>
        </div>
        <div>
          <strong>{{ dados.resumo.pendentes }}</strong
          ><span>Pendentes</span>
        </div>
        <div>
          <strong>{{ dados.resumo.invalidos }}</strong
          ><span>Inválidos</span>
        </div>
        <div>
          <strong>{{ dados.resumo.bloqueados }}</strong
          ><span>Bloqueados</span>
        </div>
      </div>

      <p class="questor-prontidao__nota">{{ dados.motivoBloqueio }}</p>

      <div v-if="pendenciasPorOrigem.length" class="questor-prontidao__grupos">
        <article v-for="grupo in pendenciasPorOrigem" :key="grupo.origem" class="questor-prontidao__grupo">
          <h3>{{ rotulosOrigem[grupo.origem] }}</h3>
          <ul>
            <li v-for="campo in grupo.itens" :key="`${grupo.origem}-${campo.campo}-${campo.coluna}`">
              <div class="questor-prontidao__campo">
                <strong>{{ registro(campo) }}</strong>
                <v-chip size="small" variant="tonal" :color="campo.situacao === 'invalido' ? 'error' : 'warning'">
                  {{ situacao(campo) }}
                </v-chip>
              </div>
              <span>{{ campo.motivo ?? "Necessita conferência antes da exportação." }}</span>
            </li>
          </ul>
        </article>
      </div>
      <p v-else class="questor-prontidao__vazia">Todos os campos avaliados estão prontos para conferência.</p>

      <v-alert type="info" variant="tonal" density="compact">
        A exportação para TXT ainda não está disponível. Esta seção não altera a ficha nem envia dados.
      </v-alert>
    </template>
  </section>
</template>

<style scoped>
.questor-prontidao {
  display: grid;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}

.questor-prontidao__cabecalho,
.questor-prontidao__campo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
}

.questor-prontidao__cabecalho h2,
.questor-prontidao__grupo h3,
.questor-prontidao__eyebrow,
.questor-prontidao__nota,
.questor-prontidao__vazia {
  margin: 0;
}

.questor-prontidao__eyebrow {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.questor-prontidao__resumo {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}

.questor-prontidao__resumo div {
  display: grid;
  gap: 2px;
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-soft);
}

.questor-prontidao__resumo strong {
  font-size: var(--cx-fs-h2);
}

.questor-prontidao__resumo span,
.questor-prontidao__grupo li span {
  color: var(--cx-ink-soft);
}

.questor-prontidao__grupos {
  display: grid;
  gap: var(--cx-sp-4);
}

.questor-prontidao__grupo {
  display: grid;
  gap: var(--cx-sp-2);
}

.questor-prontidao__grupo ul {
  display: grid;
  gap: var(--cx-sp-2);
  margin: 0;
  padding-left: 1.25rem;
}

.questor-prontidao__grupo li {
  display: grid;
  gap: 2px;
}

@media (max-width: 600px) {
  .questor-prontidao {
    padding: var(--cx-sp-4);
  }

  .questor-prontidao__cabecalho,
  .questor-prontidao__campo {
    align-items: flex-start;
    flex-direction: column;
  }

  .questor-prontidao__resumo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
