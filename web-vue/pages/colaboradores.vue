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
function situacaoDoColaborador(item: { vinculoAtivoId?: string; temVinculoHistorico?: boolean }) {
  if (item.vinculoAtivoId) return { texto: "Ativo", cor: "success" };
  if (item.temVinculoHistorico) return { texto: "Inativo", cor: "default" };
  return { texto: "Histórico a conciliar", cor: "warning" };
}
</script>
<template>
  <AppWorkspace tela-inicial="colaboradores" tipo-pagina="cadastro" v-slot="ctx">
    <section class="colaboradores-dp">
      <header class="colaboradores-dp__cabecalho">
        <p>Departamento pessoal</p>
        <h1>Colaboradores</h1>
        <span>O cadastro nasce pela efetivação da admissão. Abra o perfil para acompanhar vínculos e histórico.</span>
      </header>
      <v-data-table
        :headers="colunas"
        :items="ctx.linhasCadastro"
        item-value="id"
        class="colaboradores-dp__tabela"
        hover
      >
        <template #item.situacao="{ item }"
          ><v-chip :color="situacaoDoColaborador(item).cor" size="small" variant="flat">{{
            situacaoDoColaborador(item).texto
          }}</v-chip></template
        >
        <template #item.funcaoNome="{ item }">{{ item.funcaoNome || "Sem vínculo cadastrado" }}</template>
        <template #item.matricula="{ item }">{{ item.matricula || "—" }}</template>
        <template #item.acoes="{ item }"
          ><v-btn
            color="primary"
            size="small"
            min-height="44"
            variant="flat"
            @click="router.push(`/colaboradores/${item.id}`)"
            >Abrir perfil</v-btn
          ></template
        >
        <template #no-data
          ><div class="colaboradores-dp__vazio">
            <v-icon icon="mdi-account-group-outline" size="32" /><strong>Nenhum colaborador cadastrado</strong
            ><span>Os colaboradores aparecem aqui após a efetivação de uma admissão.</span>
          </div></template
        >
      </v-data-table>
    </section>
  </AppWorkspace>
</template>
<style scoped>
.colaboradores-dp {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 24px 48px;
}
.colaboradores-dp__cabecalho {
  margin-bottom: 20px;
}
.colaboradores-dp__cabecalho p {
  color: #b7a3ff;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.colaboradores-dp__cabecalho h1 {
  font-size: clamp(1.4rem, 3vw, 2rem);
}
.colaboradores-dp__cabecalho span,
.colaboradores-dp__vazio {
  color: rgba(var(--v-theme-on-surface), 0.68);
}
.colaboradores-dp__tabela {
  background: #1b2128;
  border: 1px solid #303943;
  border-radius: 12px;
  overflow: hidden;
}
.colaboradores-dp__tabela :deep(.v-data-table__thead) {
  background: #252c34;
}
.colaboradores-dp__vazio {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
  min-height: 150px;
  padding: 24px;
  text-align: center;
}
.colaboradores-dp__vazio strong {
  color: #f5f7fa;
}
@media (max-width: 700px) {
  .colaboradores-dp {
    padding: 16px 12px 32px;
  }
  .colaboradores-dp__tabela {
    overflow-x: auto;
  }
  .colaboradores-dp__tabela :deep(table) {
    min-width: 620px;
  }
}
</style>
