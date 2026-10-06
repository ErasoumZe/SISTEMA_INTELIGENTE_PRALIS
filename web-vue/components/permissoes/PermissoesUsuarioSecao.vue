<script setup lang="ts">
import type { ItemPermissaoUsuario } from "~/utils/permissoes-usuario";

defineProps<{
  itens: ItemPermissaoUsuario[];
  cor: "entradas" | "transferencias" | "despesas" | "mercadorias" | "retiradas" | "resultado";
  bloqueado?: boolean;
}>();

const emit = defineEmits<{ (event: "alternar", codigo: string, permitido: boolean): void }>();
</script>

<template>
  <section class="permissoes-secao" :class="`permissoes-secao--${cor}`">
    <div class="permissoes-secao__itens">
      <div v-for="item in itens" :key="item.codigo" class="permissoes-secao__item">
        <div>
          <strong>{{ item.rotulo }}</strong>
          <small>{{ item.descricao }}</small>
        </div>
        <v-switch
          :model-value="item.permitido"
          :disabled="bloqueado"
          color="success"
          hide-details
          inset
          :aria-label="`${item.rotulo}: ${item.permitido ? 'permitido' : 'não permitido'}`"
          @update:model-value="emit('alternar', item.codigo, Boolean($event))"
        >
          <template #label>
            <span class="permissoes-secao__estado">{{ item.permitido ? "Permitido" : "Não permitido" }}</span>
          </template>
        </v-switch>
      </div>
    </div>
  </section>
</template>

<style scoped>
.permissoes-secao {
  padding: 16px;
  border: 1px solid var(--cx-line);
  border-radius: 14px;
  background: var(--cx-surface);
}
.permissoes-secao--entradas { background: color-mix(in srgb, var(--cat-entradas-base) 14%, var(--cx-surface)); }
.permissoes-secao--transferencias { background: color-mix(in srgb, var(--cat-transferencias-base) 14%, var(--cx-surface)); }
.permissoes-secao--despesas { background: color-mix(in srgb, var(--cat-despesas-base) 14%, var(--cx-surface)); }
.permissoes-secao--mercadorias { background: color-mix(in srgb, var(--cat-mercadorias-base) 14%, var(--cx-surface)); }
.permissoes-secao--retiradas { background: color-mix(in srgb, var(--cat-retiradas-base) 14%, var(--cx-surface)); }
.permissoes-secao--resultado { background: color-mix(in srgb, var(--cat-resultado-base) 14%, var(--cx-surface)); }
.permissoes-secao__itens { border-top: 1px solid color-mix(in srgb, var(--cx-ink) 12%, transparent); }
.permissoes-secao__item { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 62px; border-bottom: 1px solid color-mix(in srgb, var(--cx-ink) 12%, transparent); }
.permissoes-secao__item:last-child { border-bottom: 0; }
.permissoes-secao__item strong, .permissoes-secao__item small { display: block; }
.permissoes-secao__item strong { font-size: .9rem; }
.permissoes-secao__item small { max-width: 680px; margin-top: 3px; color: var(--cx-ink-soft); font-size: .78rem; line-height: 1.35; }
.permissoes-secao__estado { min-width: 112px; color: var(--cx-ink-soft); font-size: .8rem; }
@media (max-width: 560px) {
  .permissoes-secao__item { align-items: flex-start; flex-direction: column; gap: 6px; padding: 12px 0; }
  .permissoes-secao__item :deep(.v-switch) { margin-inline-start: -8px; }
}
</style>
