<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { CargoAcesso, CargosAcessoResumo, ContaPostoCargo } from "@padaria/shared/permissoes";
import { mensagemErro } from "~/utils/domain";

// Aba "Cargos" de Permissoes (Marco, 13/11/2026). O cargo da o padrao de acesso; aqui o administrador
// restaura esse padrao, cria o cargo de referencia que falta (ex.: "Caixa Gerente") e troca o cargo das
// contas de posto do Caixa. O cargo de quem e do DP nao muda por aqui.
const props = defineProps<{ empresaId: string; podeEditar: boolean }>();
const { apiGet, apiPost, apiPut } = useApi();

type Confirmacao = { titulo: string; texto: string; botao: string; executar: () => Promise<string> };

const carregando = ref(false);
const executando = ref(false);
const erro = ref("");
const aviso = ref("");
const resumo = ref<CargosAcessoResumo | null>(null);
const confirmacao = ref<Confirmacao | null>(null);

const opcoesCargos = computed(() =>
  (resumo.value?.cargos ?? []).map((cargo) => ({ title: cargo.nome, value: cargo.id }))
);
const empresaBody = computed(() => ({ empresaId: props.empresaId }));

async function carregar() {
  if (!props.empresaId) return;
  carregando.value = true;
  erro.value = "";
  try {
    resumo.value = await apiGet<CargosAcessoResumo>(
      `/api/permissoes/cargos-acesso?empresaId=${encodeURIComponent(props.empresaId)}`
    );
  } catch (falha) {
    erro.value = mensagemErro(falha);
  } finally {
    carregando.value = false;
  }
}

async function confirmar() {
  const atual = confirmacao.value;
  if (!atual) return;
  executando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    aviso.value = await atual.executar();
    confirmacao.value = null;
    await carregar();
  } catch (falha) {
    erro.value = mensagemErro(falha);
    confirmacao.value = null;
  } finally {
    executando.value = false;
  }
}

function pedirRestaurar(cargo: CargoAcesso) {
  confirmacao.value = {
    titulo: `Restaurar o cargo "${cargo.nome}"?`,
    texto:
      "As permissões do cargo voltam a ser exatamente as do padrão do sistema. Ajustes feitos à mão neste cargo, inclusive os desligados, são substituídos.",
    botao: "Restaurar padrão",
    executar: async () => {
      await apiPost(`/api/permissoes/cargo/${cargo.id}/restaurar-padrao`, {});
      return `Cargo "${cargo.nome}" restaurado para o padrão.`;
    }
  };
}

function pedirCriar(nome: string) {
  confirmacao.value = {
    titulo: `Criar o cargo "${nome}"?`,
    texto: "O cargo nasce com as permissões do padrão do sistema. Depois é só passar as contas para ele.",
    botao: "Criar cargo",
    executar: async () => {
      await apiPost("/api/permissoes/cargos-acesso/padrao", { ...empresaBody.value, nome });
      return `Cargo "${nome}" criado com o padrão do sistema.`;
    }
  };
}

function pedirTrocar(conta: ContaPostoCargo, cargoId: string | null) {
  const cargo = resumo.value?.cargos.find((item) => item.id === cargoId);
  if (!cargo || cargo.id === conta.cargoId) return;
  confirmacao.value = {
    titulo: `Passar ${conta.posto} para "${cargo.nome}"?`,
    texto: conta.acessoIndividual
      ? `A conta tem acesso individual salvo em "Acessos por pessoa", que passa por cima do cargo. Para valer o cargo novo, use também "Seguir só o cargo".`
      : "A conta passa a ter as permissões do cargo novo no próximo clique que fizer no sistema.",
    botao: "Trocar cargo",
    executar: async () => {
      await apiPut(`/api/permissoes/contas-posto/${encodeURIComponent(conta.usuarioId)}/cargo`, {
        ...empresaBody.value,
        cargoId: cargo.id
      });
      return `${conta.posto} agora está no cargo "${cargo.nome}".`;
    }
  };
}

function pedirSeguirCargo(conta: ContaPostoCargo) {
  confirmacao.value = {
    titulo: `${conta.posto} seguir só o cargo?`,
    texto: `Os acessos salvos para esta conta em "Acessos por pessoa" saem, e ela passa a ter exatamente as permissões do cargo "${conta.cargoNome ?? "sem cargo"}".`,
    botao: "Seguir só o cargo",
    executar: async () => {
      await apiPost(
        `/api/permissoes/contas-posto/${encodeURIComponent(conta.usuarioId)}/seguir-cargo`,
        empresaBody.value
      );
      return `${conta.posto} agora segue só o cargo.`;
    }
  };
}

watch(
  () => props.empresaId,
  () => void carregar()
);
onMounted(() => void carregar());
</script>

<template>
  <section class="permissoes-cargos" aria-labelledby="permissoes-cargos-titulo">
    <header class="permissoes-cargos__cabecalho">
      <span>Padrão de acesso</span>
      <h2 id="permissoes-cargos-titulo">Cargos</h2>
      <p>
        O cargo dá o acesso padrão de quem está nele. Restaure o padrão do sistema ou troque o cargo das contas do
        Caixa.
      </p>
    </header>

    <v-alert v-if="erro" type="error" variant="tonal" class="mt-4" closable @click:close="erro = ''">{{
      erro
    }}</v-alert>
    <v-alert
      v-if="aviso"
      type="success"
      variant="tonal"
      class="mt-4"
      closable
      data-teste="cargos-aviso"
      @click:close="aviso = ''"
    >
      {{ aviso }}
    </v-alert>
    <v-progress-linear v-if="carregando" indeterminate color="primary" class="mt-4" />

    <template v-if="resumo">
      <div
        v-if="podeEditar && resumo.padroesFaltando.length"
        class="permissoes-cargos__faltando mt-4"
        data-teste="cargos-faltando"
      >
        <div>
          <strong>Cargos do padrão que ainda não existem nesta empresa</strong>
          <span>Crie para poder passar contas para eles.</span>
        </div>
        <v-btn
          v-for="nome in resumo.padroesFaltando"
          :key="nome"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-plus"
          @click="pedirCriar(nome)"
        >
          Criar {{ nome }}
        </v-btn>
      </div>

      <h3 class="permissoes-cargos__titulo">Cargos desta empresa</h3>
      <div class="permissoes-cargos__grade">
        <article
          v-for="cargo in resumo.cargos"
          :key="cargo.id"
          class="permissoes-cargos__cargo"
          data-teste="cargo-card"
        >
          <strong>{{ cargo.nome }}</strong>
          <span
            >{{ cargo.permitidas }} permissões · {{ cargo.pessoas }}
            {{ cargo.pessoas === 1 ? "pessoa" : "pessoas" }}</span
          >
          <v-btn
            v-if="podeEditar && cargo.temPadrao"
            size="small"
            variant="text"
            color="primary"
            prepend-icon="mdi-restore"
            @click="pedirRestaurar(cargo)"
          >
            Restaurar padrão
          </v-btn>
          <span v-else-if="!cargo.temPadrao" class="permissoes-cargos__sem-padrao"
            >Cargo próprio, sem padrão do sistema</span
          >
        </article>
      </div>

      <h3 class="permissoes-cargos__titulo">Contas de posto do Caixa</h3>
      <v-alert v-if="!resumo.contasPosto.length" type="info" variant="tonal"
        >Nenhuma conta de posto nesta empresa.</v-alert
      >
      <ul v-else class="permissoes-cargos__contas">
        <li v-for="conta in resumo.contasPosto" :key="conta.usuarioId" data-teste="conta-posto">
          <div class="permissoes-cargos__conta">
            <strong>{{ conta.posto }}</strong>
            <span>{{ conta.nome }} · {{ conta.email }}</span>
            <v-chip v-if="conta.acessoIndividual" color="warning" size="small" variant="tonal" class="mt-1">
              Acesso individual: o cargo não vale
            </v-chip>
          </div>
          <v-select
            :model-value="conta.cargoId"
            :items="opcoesCargos"
            :label="`Cargo de ${conta.posto}`"
            :disabled="!podeEditar"
            density="comfortable"
            hide-details
            class="permissoes-cargos__select"
            @update:model-value="pedirTrocar(conta, $event)"
          />
          <v-btn
            v-if="podeEditar && conta.acessoIndividual"
            color="warning"
            variant="tonal"
            prepend-icon="mdi-account-arrow-left-outline"
            @click="pedirSeguirCargo(conta)"
          >
            Seguir só o cargo
          </v-btn>
        </li>
      </ul>
    </template>

    <v-dialog :model-value="Boolean(confirmacao)" max-width="520" @update:model-value="confirmacao = null">
      <v-card v-if="confirmacao">
        <v-card-title class="text-wrap">{{ confirmacao.titulo }}</v-card-title>
        <v-card-text>{{ confirmacao.texto }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="executando" @click="confirmacao = null">Voltar</v-btn>
          <v-btn color="primary" variant="flat" :loading="executando" @click="confirmar">{{ confirmacao.botao }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.permissoes-cargos {
  max-width: 1160px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.permissoes-cargos__cabecalho > span {
  color: var(--cx-brand-text);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.permissoes-cargos h2 {
  margin: 2px 0 0;
}
.permissoes-cargos__cabecalho p {
  margin: 6px 0 0;
  color: var(--cx-ink-soft);
}
.permissoes-cargos__titulo {
  margin: 28px 0 12px;
  font-size: 1rem;
}
.permissoes-cargos__faltando {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--cx-brand) 40%, var(--cx-line));
  border-radius: 12px;
  background: color-mix(in srgb, var(--cx-brand) 12%, var(--cx-surface));
}
.permissoes-cargos__faltando > div {
  flex: 1 1 260px;
}
.permissoes-cargos__faltando span,
.permissoes-cargos__cargo span,
.permissoes-cargos__conta span {
  display: block;
  color: var(--cx-ink-soft);
  font-size: 0.82rem;
}
.permissoes-cargos__grade {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.permissoes-cargos__cargo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface);
}
.permissoes-cargos__cargo :deep(.v-btn) {
  margin-left: -8px;
}
.permissoes-cargos__sem-padrao {
  font-style: italic;
}
.permissoes-cargos__contas {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.permissoes-cargos__contas li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(200px, 260px) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--cx-line);
  border-radius: 12px;
  background: var(--cx-surface);
}
.permissoes-cargos__conta {
  min-width: 0;
}
.permissoes-cargos__conta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .permissoes-cargos__contas li {
    grid-template-columns: 1fr;
  }
  .permissoes-cargos__faltando :deep(.v-btn),
  .permissoes-cargos__contas :deep(.v-btn) {
    width: 100%;
  }
}
</style>
