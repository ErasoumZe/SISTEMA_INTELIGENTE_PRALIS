<script setup lang="ts">
// Tela de Malotes fiel ao mockup (docs/mockups/TODAS-AS-TELAS-mockup.html, tela 4): card-list por
// lacre. O malote E o lacre (D3): badge do numero + "Lacre X" + subtitulo por status + valor +
// status colorido + Editar. Sem codigo, sem "saco".
import { chipStatusMalote } from "~/utils/malote";

defineProps<{
  linhas: Array<Record<string, string | undefined>>;
  editarCarregandoId?: string;
}>();

const emit = defineEmits<{
  (event: "acionar"): void;
  (event: "editar", linha: Record<string, string | undefined>): void;
}>();

const SUBTITULO: Record<string, string> = {
  disponivel: "pronto para abrir um caixa",
  em_uso: "em uso num caixa",
  devolvido: "devolvido ao cofre"
};
function subtitulo(status: string | undefined) {
  return (status && SUBTITULO[status]) || "—";
}
function disponivel(status: string | undefined) {
  return status === "disponivel";
}
</script>

<template>
  <div class="malotes-wrap">
    <div class="malotes-head">
      <div class="malotes-head-txt">
        <div class="malotes-title">Malotes</div>
        <div class="malotes-sub">cada malote é o seu lacre</div>
      </div>
      <button type="button" class="malotes-novo" @click="emit('acionar')">
        <v-icon size="15">mdi-plus</v-icon> Novo malote
      </button>
    </div>

    <div class="malotes-card">
      <div v-for="linha in linhas" :key="linha.id ?? linha.lacre" class="malote-row">
        <span class="malote-badge" :class="{ inativo: !disponivel(linha.status) }">{{ linha.lacre }}</span>
        <div class="malote-info">
          <div class="malote-lacre" :class="{ muted: !disponivel(linha.status) }">Lacre {{ linha.lacre }}</div>
          <div class="malote-subtitulo">{{ subtitulo(linha.status) }}</div>
        </div>
        <div class="malote-valor-bloco">
          <div class="malote-valor" :class="{ muted: !disponivel(linha.status) }">{{ linha.valor }}</div>
          <div class="malote-status" :style="{ color: chipStatusMalote(linha.status)?.cor }">
            {{ chipStatusMalote(linha.status)?.label ?? linha.status }}
          </div>
        </div>
        <button
          type="button"
          class="malote-editar"
          :disabled="editarCarregandoId === linha.id"
          @click="emit('editar', linha)"
        >
          Editar
        </button>
      </div>
      <div v-if="!linhas.length" class="malote-vazio">Nenhum malote cadastrado.</div>
    </div>

    <div class="malotes-nota">
      O lacre é a identidade — vem impresso, de fonte externa, e não se repete. Não há código nem campo de “saco”.
    </div>
  </div>
</template>

<style scoped>
/* Valores exatos do mockup (tela 4). Laranja = token de categoria "transferencias" do V1. */
.malotes-wrap {
  max-width: 470px;
}
.malotes-head {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}
.malotes-head-txt {
  flex: 1;
  min-width: 0;
}
.malotes-title {
  font-size: 16px;
  font-weight: 500;
  color: #1f2733;
}
.malotes-sub {
  font-size: 12px;
  color: #64748b;
}
.malotes-novo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--cat-transferencias-base, #c2410c);
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: filter 0.15s ease;
}
.malotes-novo:hover {
  filter: brightness(0.94);
}
.malotes-card {
  background: #fff;
  border: 0.5px solid #e4e8ef;
  border-radius: 12px;
  overflow: hidden;
}
.malote-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 0.5px solid #e4e8ef;
}
.malote-row:last-child {
  border-bottom: 0;
}
.malote-badge {
  display: flex;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--cat-transferencias-soft, #fff1e8);
  color: var(--cat-transferencias-base, #c2410c);
  font-size: 14px;
  font-weight: 500;
}
.malote-badge.inativo {
  background: #f4f6fa;
  color: #94a3b8;
}
.malote-info {
  flex: 1;
  min-width: 0;
}
.malote-lacre {
  font-size: 15px;
  font-weight: 500;
  color: #1f2733;
}
.malote-lacre.muted {
  color: #64748b;
}
.malote-subtitulo {
  font-size: 11px;
  color: #64748b;
}
.malote-valor-bloco {
  margin-right: 14px;
  text-align: right;
}
.malote-valor {
  font-size: 15px;
  font-weight: 500;
  color: #1f2733;
}
.malote-valor.muted {
  color: #64748b;
}
.malote-status {
  font-size: 11px;
}
.malote-editar {
  border: 0;
  background: none;
  padding: 0;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s ease;
}
.malote-editar:hover {
  color: #64748b;
}
.malote-editar:disabled {
  opacity: 0.5;
  cursor: default;
}
.malote-vazio {
  padding: 24px 16px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}
.malotes-nota {
  margin-top: 10px;
  color: #94a3b8;
  font-size: 11px;
}
</style>
