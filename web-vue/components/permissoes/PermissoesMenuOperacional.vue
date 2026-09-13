<script setup lang="ts">
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import {
  codigoRegraMenuOperacional,
  MODULOS_MENU_OPERACIONAL,
  REGRAS_MENU_OPERACIONAL
} from "~/utils/menu-operacional-permissoes";

const { estadoRegraPermissao, definirRegraPermissao } = useWorkspaceContext();
const ESTADOS = ["herdar", "permitir", "negar"] as const;

function proximoEstado(codigo: string) {
  const atual = estadoRegraPermissao(codigo);
  const indice = ESTADOS.indexOf(atual as (typeof ESTADOS)[number]);
  definirRegraPermissao(codigo, ESTADOS[(indice + 1) % ESTADOS.length] ?? "herdar");
}

function apresentacao(codigo: string) {
  const estado = estadoRegraPermissao(codigo);
  if (estado === "permitir") return { icone: "mdi-check", cor: "success", rotulo: "Ativa" };
  if (estado === "negar") return { icone: "mdi-close", cor: "error", rotulo: "Nega" };
  return { icone: "mdi-minus", cor: "medium-emphasis", rotulo: "Herda" };
}
</script>

<template>
  <div class="menu-operacional-grid">
    <v-sheet
      v-for="modulo in MODULOS_MENU_OPERACIONAL"
      :key="modulo.prefixo"
      class="menu-operacional-card pa-3 rounded-lg"
      border
    >
      <div class="text-body-2 font-weight-bold mb-2">{{ modulo.rotulo }}</div>
      <div v-for="regra in REGRAS_MENU_OPERACIONAL" :key="regra.sufixo" class="menu-operacional-regra">
        <div class="menu-operacional-texto">
          <span class="text-body-2">{{ regra.rotulo }}</span>
          <span class="text-caption text-medium-emphasis">{{ regra.descricao }}</span>
        </div>
        <v-btn
          :color="apresentacao(codigoRegraMenuOperacional(modulo, regra)).cor"
          variant="tonal"
          size="small"
          class="menu-operacional-estado"
          :aria-label="`${modulo.rotulo} — ${regra.rotulo}: ${apresentacao(codigoRegraMenuOperacional(modulo, regra)).rotulo}`"
          @click="proximoEstado(codigoRegraMenuOperacional(modulo, regra))"
        >
          <v-icon start>{{ apresentacao(codigoRegraMenuOperacional(modulo, regra)).icone }}</v-icon>
          {{ apresentacao(codigoRegraMenuOperacional(modulo, regra)).rotulo }}
        </v-btn>
      </div>
    </v-sheet>
  </div>
  <div class="d-flex flex-wrap ga-3 mt-2 text-caption text-medium-emphasis">
    <span><v-icon size="14" color="success">mdi-check</v-icon> ativa a regra</span>
    <span><v-icon size="14">mdi-minus</v-icon> herda do setor ou cargo</span>
    <span><v-icon size="14" color="error">mdi-close</v-icon> nega a regra herdada</span>
  </div>
</template>

<style scoped>
.menu-operacional-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.menu-operacional-card {
  min-width: 0;
  background: rgb(var(--v-theme-surface));
}

.menu-operacional-regra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.menu-operacional-texto {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.menu-operacional-estado {
  min-width: 92px;
  flex: 0 0 auto;
}

@media (width <= 768px) {
  .menu-operacional-grid {
    grid-template-columns: 1fr;
  }

  .menu-operacional-regra {
    align-items: flex-start;
  }
}
</style>
