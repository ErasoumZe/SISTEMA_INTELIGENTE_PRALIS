<script setup lang="ts">
import type { GrupoCentral, LojaCentral } from "~/types/produtos-central";

defineProps<{
  grupos: GrupoCentral[];
  total: number;
  pageSize: number;
  processando: boolean;
  cargaId: string;
}>();
const busca = defineModel<string>("busca", { required: true });
const loja = defineModel<LojaCentral>("loja", { required: true });
const pagina = defineModel<number>("pagina", { required: true });
const emit = defineEmits<{
  decidir: [grupo: GrupoCentral, acao: "nao_e_o_mesmo" | "ignorado"];
}>();
</script>

<template>
  <section class="central-grupos__filtros">
    <v-text-field
      v-model="busca"
      label="Buscar nome ou chave"
      prepend-inner-icon="mdi-magnify"
      clearable
      hide-details
    />
    <v-select
      v-model="loja"
      :items="[
        { title: 'Todas as lojas', value: '' },
        { title: 'LI', value: 'LI' },
        { title: 'TNP', value: 'TNP' },
        { title: 'BASE', value: 'BASE' },
        { title: 'HORA', value: 'HORA' }
      ]"
      label="Loja"
      hide-details
    />
  </section>
  <v-alert v-if="cargaId && !grupos.length && !processando" type="info" variant="tonal" class="mt-4">
    Nenhum grupo nesta página. Crie uma carga e valide as fontes para gerar a prévia.
  </v-alert>
  <v-expansion-panels class="mt-4">
    <v-expansion-panel v-for="grupo in grupos" :key="grupo.id">
      <v-expansion-panel-title>
        <div class="central-grupos__titulo">
          <strong>{{ grupo.nome || "Produto sem descrição" }}</strong>
          <span>{{ grupo.lojas.join(" · ") }} · {{ grupo.fontes.length }} fonte(s)</span>
          <v-chip v-if="grupo.decisao" size="small" color="info">{{ grupo.decisao.acao }}</v-chip>
          <v-chip v-if="grupo.alertaBarrasConflitantes" size="small" color="error">EAN conflitante</v-chip>
          <v-chip v-if="grupo.alertaNomeDivergente" size="small" color="warning">Nome divergente</v-chip>
          <v-chip v-if="grupo.alertaSemFiscalTnp" size="small" color="warning">Sem fiscal TNP</v-chip>
          <v-chip v-if="grupo.alertaSemGrupo" size="small" color="warning">Sem grupo</v-chip>
          <v-chip v-if="grupo.alertaJaNaBase" size="small" color="secondary">Já na base</v-chip>
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <p class="text-caption">Chave: {{ grupo.chave }} · Motivo do agrupamento: {{ grupo.motivo }}</p>
        <div class="central-grupos__decisoes">
          <v-btn
            size="small"
            variant="outlined"
            :disabled="processando"
            @click="emit('decidir', grupo, 'nao_e_o_mesmo')"
          >
            Não é o mesmo produto
          </v-btn>
          <v-btn
            size="small"
            variant="outlined"
            color="warning"
            :disabled="processando"
            @click="emit('decidir', grupo, 'ignorado')"
          >
            Ignorar grupo
          </v-btn>
        </div>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Fonte / loja</th>
              <th>Cód. interno</th>
              <th>EAN</th>
              <th>Nome</th>
              <th>Custo</th>
              <th>Venda</th>
              <th>NCM</th>
              <th>CST</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, indice) in grupo.itens" :key="`${item.fonte}-${indice}`">
              <td>{{ item.fonte }} · {{ item.loja }}</td>
              <td>{{ item.codigoInterno || "—" }}</td>
              <td>{{ item.codigoBarras || "—" }}</td>
              <td>{{ item.nome || "—" }}</td>
              <td>{{ item.custo ?? "—" }}</td>
              <td>{{ item.venda ?? "—" }}</td>
              <td>{{ item.fiscal?.ncm ?? "—" }}</td>
              <td>{{ item.fiscal?.cstPisCofins ?? "—" }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
  <div v-if="total > pageSize" class="d-flex justify-center mt-5">
    <v-pagination v-model="pagina" :length="Math.ceil(total / pageSize)" :total-visible="5" />
  </div>
  <p class="text-caption text-medium-emphasis mt-3">
    {{ total }} grupos · criação e atualização do cadastro dependem de validar a fonte e as regras oficiais.
  </p>
</template>

<style scoped>
.central-grupos__filtros {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 16px;
}
.central-grupos__titulo,
.central-grupos__decisoes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.central-grupos__decisoes {
  margin-bottom: 12px;
}
@media (max-width: 768px) {
  .central-grupos__filtros {
    grid-template-columns: 1fr;
  }
}
</style>
