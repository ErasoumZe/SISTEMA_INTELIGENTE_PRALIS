<script setup lang="ts">
const aberto = defineModel<boolean>({ default: false });
</script>

<template>
  <div class="tr-checks">
    <slot name="controles" />
    <label class="tr-check">
      <input v-model="aberto" data-testid="retorno-toggle" type="checkbox" />
      <span>Transf. Retorno / Sangria</span>
    </label>
  </div>
  <div v-if="aberto" class="tr-retorno" data-testid="retorno-campos">
    <slot />
  </div>
</template>

<style scoped>
.tr-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #1f2733;
  cursor: pointer;
}
.tr-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--cat-transferencias-base, #c2410c);
}
.tr-checks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 6px 0 12px;
  padding: 10px 12px;
  border: 0.5px solid #e4e8ef;
  border-radius: 10px;
  background: #fbfcfe;
}
.tr-retorno {
  margin: 4px 0 12px;
  padding: 10px 12px;
  border: 0.5px solid var(--cat-transferencias-base, #c2410c);
  border-radius: 10px;
  background: var(--cat-transferencias-soft, #fff1e8);
}
</style>
