<script setup lang="ts">
import AppWorkspace from "~/components/app/AppWorkspace.vue";

const router = useRouter();
const colunas = [
  { title: "Colaborador", key: "nome" },
  { title: "Situação", key: "situacao" },
  { title: "Função atual", key: "funcaoNome" },
  { title: "Matrícula", key: "matricula" },
  { title: "Ação", key: "acoes", sortable: false, align: "end" as const }
];

function situacaoDoColaborador(item: { vinculoAtivoId?: string | null; temVinculoHistorico?: boolean }) {
  if (item.vinculoAtivoId) return { texto: "Ativo", cor: "success" };
  if (item.temVinculoHistorico) return { texto: "Inativo", cor: "default" };
  return { texto: "Histórico a conciliar", cor: "warning" };
}
</script>

<template>
  <AppWorkspace tela-inicial="colaboradores" tipo-pagina="cadastro" v-slot="ctx">
    <section class="colaboradores-dp">
      <header class="colaboradores-dp__cabecalho">
        <div>
          <p>Departamento pessoal</p>
          <h1>Colaboradores</h1>
          <span>O cadastro nasce pela efetivação da admissão. Abra o perfil para acompanhar vínculos e histórico.</span>
        </div>
      </header>
      <v-data-table :headers="colunas" :items="ctx.linhasCadastro" item-value="id" class="colaboradores-dp__tabela">
        <template #item.situacao="{ item }"
          ><v-chip :color="situacaoDoColaborador(item).cor" size="small" variant="tonal">{{
            situacaoDoColaborador(item).texto
          }}</v-chip></template
        >
        <template #item.funcaoNome="{ item }">{{ item.funcaoNome || "Sem vínculo cadastrado" }}</template>
        <template #item.matricula="{ item }">{{ item.matricula || "—" }}</template>
        <template #item.acoes="{ item }"
          ><v-btn size="small" variant="tonal" @click="router.push(`/colaboradores/${item.id}`)"
            >Abrir perfil</v-btn
          ></template
        >
      </v-data-table>
    </section>
  </AppWorkspace>
</template>

<style scoped>
.colaboradores-dp {
  padding: 16px;
}
.colaboradores-dp__cabecalho {
  margin-bottom: 16px;
}
.colaboradores-dp__cabecalho p {
  color: rgb(var(--v-theme-primary));
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.colaboradores-dp__cabecalho h1 {
  font-size: clamp(1.4rem, 3vw, 2rem);
}
.colaboradores-dp__cabecalho span {
  color: rgba(var(--v-theme-on-surface), 0.68);
}
.colaboradores-dp__tabela {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: 12px;
  overflow: hidden;
}
@media (max-width: 700px) {
  .colaboradores-dp {
    padding: 12px;
  }
  .colaboradores-dp__tabela :deep(table) {
    min-width: 620px;
  }
  .colaboradores-dp__tabela {
    overflow-x: auto;
  }
  .colaboradores-dp__tabela :deep(.v-btn) {
    min-height: 44px;
  }
}
</style>
