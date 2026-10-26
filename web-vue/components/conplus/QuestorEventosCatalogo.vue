<script setup lang="ts">
import {
  questorEventosVariaveisCatalogoSchema,
  ROTAS_EXPORTACAO_QUESTOR,
  type QuestorEventoVariavelDto as EventoCatalogo
} from "@padaria/shared";
import QuestorEventosImportarCatalogo from "~/components/conplus/QuestorEventosImportarCatalogo.vue";
import { ErroApiCliente } from "~/composables/useApi";

const eventos = defineModel<EventoCatalogo[]>({ required: true });

const { apiGet, apiPost, apiPatch } = useApi();
const UNIDADES = [
  { title: "H — horas", value: "H" },
  { title: "V — valor", value: "V" },
  { title: "R — referência", value: "R" }
];
const novo = reactive({ codigo: "", descricao: "", unidades: [] as string[] });
const salvando = ref(false);
const erro = ref("");

async function carregar() {
  erro.value = "";
  try {
    eventos.value = await apiGet<EventoCatalogo[]>(ROTAS_EXPORTACAO_QUESTOR.eventos);
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Catálogo de eventos indisponível.";
  }
}

async function adicionar() {
  const dados = questorEventosVariaveisCatalogoSchema.safeParse(novo);
  if (!dados.success) {
    erro.value = dados.error.issues[0]?.message ?? "Evento inválido.";
    return;
  }
  salvando.value = true;
  erro.value = "";
  try {
    eventos.value = [
      ...eventos.value,
      await apiPost<EventoCatalogo>(ROTAS_EXPORTACAO_QUESTOR.eventos, dados.data)
    ].sort((a, b) => Number(a.codigo) - Number(b.codigo));
    Object.assign(novo, { codigo: "", descricao: "", unidades: [] });
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível cadastrar o evento.";
  } finally {
    salvando.value = false;
  }
}

async function alternar(evento: EventoCatalogo) {
  erro.value = "";
  try {
    const atualizado = await apiPatch<EventoCatalogo>(ROTAS_EXPORTACAO_QUESTOR.evento.replace(":id", evento.id), {
      ativo: !evento.ativo
    });
    eventos.value = eventos.value.map((item) => (item.id === atualizado.id ? atualizado : item));
  } catch (falha) {
    erro.value = falha instanceof ErroApiCliente ? falha.message : "Não foi possível alterar o evento.";
  }
}

onMounted(() => void carregar());
</script>

<template>
  <div class="catalogo">
    <div>
      <strong>Catálogo de eventos da empresa</strong>
      <p class="muted">
        Copie do Questor desta empresa o código do evento e as letras aceitas. O Pralís não cria código nenhum. Evento
        errado não se apaga: desative e cadastre o certo.
      </p>
    </div>
    <v-alert v-if="erro" type="warning" variant="tonal" density="compact">{{ erro }}</v-alert>
    <QuestorEventosImportarCatalogo @importado="carregar" />
    <div class="catalogo__form">
      <v-text-field
        v-model="novo.codigo"
        label="Código no Questor"
        inputmode="numeric"
        density="compact"
        hide-details
      />
      <v-text-field v-model="novo.descricao" label="Descrição" density="compact" hide-details />
      <v-select
        v-model="novo.unidades"
        :items="UNIDADES"
        label="Letras aceitas"
        multiple
        chips
        density="compact"
        hide-details
      />
      <v-btn color="primary" variant="tonal" :loading="salvando" @click="adicionar">Adicionar</v-btn>
    </div>
    <ul v-if="eventos.length" class="catalogo__lista">
      <li v-for="evento in eventos" :key="evento.id" :class="{ catalogo__inativo: !evento.ativo }">
        <span
          ><strong>{{ evento.codigo }}</strong> — {{ evento.descricao }}
          <small class="muted"
            >({{ evento.unidades.join(", ") }}{{ evento.natureza ? ` · ${evento.natureza}` : "" }})</small
          ></span
        >
        <v-btn variant="text" size="small" @click="alternar(evento)">{{
          evento.ativo ? "Desativar" : "Reativar"
        }}</v-btn>
      </li>
    </ul>
    <p v-else class="muted">Nenhum evento cadastrado para esta empresa.</p>
  </div>
</template>

<style scoped>
.catalogo {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.catalogo > * {
  min-width: 0;
}
.catalogo__form {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 220px auto;
  gap: 8px;
  align-items: center;
}
.catalogo__lista {
  list-style: none;
  padding: 0;
  margin: 0;
}
.catalogo__lista li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid rgba(var(--v-border-color), 0.2);
}
.catalogo__inativo {
  opacity: 0.55;
}
.muted {
  color: rgba(var(--v-theme-on-surface), 0.68);
  margin: 0;
}
@media (max-width: 900px) {
  .catalogo__form {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 600px) {
  .catalogo__form {
    grid-template-columns: 1fr;
  }
}
</style>
