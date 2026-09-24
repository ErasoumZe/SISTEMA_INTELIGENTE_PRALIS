<script setup lang="ts">
import { computed } from "vue";
import type { DependenteRevisaoDto } from "@padaria/shared";
import { rotuloDeclaracaoDependentes } from "~/utils/admissoes";
import { formatarDataSomenteDia } from "~/utils/formatacao";

/**
 * ADM-003 V5 — quem o candidato declarou, como o DP ve.
 *
 * O CPF do dependente NAO aparece — nem mascarado. O servidor manda so `cpfInformado`, e a tela
 * mostra "CPF informado" ou "Sem CPF". Revelar o documento de um terceiro (muitas vezes uma
 * crianca) exigiria decisao propria e trilha por dependente, que nao existem; enquanto nao
 * existirem, o numero nao sai do banco.
 *
 * A declaracao tem TRES estados e os tres sao mostrados: `null` e "nao respondeu", e nao "nao tem".
 */
const props = defineProps<{
  dependentes: DependenteRevisaoDto[];
  semDependentes: boolean | null;
}>();

const textoVazio = computed(() => {
  if (props.semDependentes === true) return "Nenhum dependente a informar.";
  if (props.semDependentes === false) return "Declarou que tem dependentes, mas nenhum foi cadastrado.";
  return "O candidato ainda não respondeu se tem dependentes.";
});
</script>

<template>
  <section class="bloco" aria-labelledby="revisao-dependentes">
    <div class="bloco__cabecalho">
      <h2 id="revisao-dependentes" class="bloco__titulo">Dependentes</h2>
      <span class="bloco__declaracao">{{ rotuloDeclaracaoDependentes(semDependentes) }}</span>
    </div>

    <ol v-if="dependentes.length" class="dependentes">
      <li v-for="dependente in dependentes" :key="dependente.id" class="dependente">
        <div class="dependente__quem">
          <strong class="dependente__nome">{{ dependente.nomeCompleto }}</strong>
          <span class="dependente__detalhe">
            {{ dependente.parentesco }} · nascimento {{ formatarDataSomenteDia(dependente.nascimento) }}
          </span>
        </div>
        <!-- Pilula com TEXTO, nao bolinha colorida: o estado precisa ser lido, nao adivinhado. -->
        <v-chip
          size="small"
          :variant="dependente.cpfInformado ? 'tonal' : 'outlined'"
          :color="dependente.cpfInformado ? 'success' : undefined"
          class="dependente__documento"
        >
          {{ dependente.cpfInformado ? "CPF informado" : "Sem CPF" }}
        </v-chip>
        <p class="dependente__finalidades">
          {{ dependente.finalidades.length ? dependente.finalidades.join(" · ") : "Finalidade não informada" }}
        </p>
      </li>
    </ol>

    <p v-else class="bloco__vazio">{{ textoVazio }}</p>

    <p class="bloco__nota">O número do CPF dos dependentes não é exibido: esta tela mostra apenas se foi informado.</p>
  </section>
</template>

<style scoped>
.bloco {
  display: grid;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-4) var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
  min-width: 0;
}

.bloco__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}

.bloco__titulo {
  margin: 0;
  font-size: var(--cx-fs-title);
  font-weight: 600;
  color: var(--cx-ink);
}

.bloco__declaracao {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.dependentes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--cx-sp-2);
}

.dependente {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cx-sp-1) var(--cx-sp-3);
  align-items: center;
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  min-width: 0;
}

.dependente__quem {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dependente__nome {
  overflow-wrap: anywhere;
}

.dependente__detalhe {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.dependente__finalidades {
  grid-column: 1 / -1;
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.bloco__vazio,
.bloco__nota {
  margin: 0;
  color: var(--cx-ink-soft);
}

.bloco__nota {
  font-size: var(--cx-fs-caption);
}

@media (max-width: 768px) {
  .bloco {
    padding: var(--cx-sp-4);
  }

  .dependente {
    grid-template-columns: minmax(0, 1fr);
  }

  .dependente__documento {
    justify-self: start;
  }
}
</style>
