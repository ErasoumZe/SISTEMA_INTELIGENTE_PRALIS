<script setup lang="ts">
// Permissoes em grade fiel ao mockup (docs/mockups/TODAS-AS-TELAS-mockup.html, tela 5): telas
// operacionais x acoes. SEGURO: cada celula so aparece se o codigo de permissao REALMENTE existe
// (permissoesDaSecao); coluna sem codigo vira traco — NUNCA mostra "permite" falso. Reusa
// estadoRegraPermissao/definirRegraPermissao do alvo ja carregado (mesma gravacao de sempre).
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { COLUNAS_GRADE_PERMISSOES as COLUNAS, montarGradePermissoes } from "~/utils/grade-permissoes";

const { permissoesDaSecao, estadoRegraPermissao, definirRegraPermissao } = useWorkspaceContext();

const ESTADOS = ["herdar", "permitir", "negar"] as const;

// Grade resolvida: para cada tela x coluna, o codigo real que existe (ou null).
const grade = computed(() =>
  montarGradePermissoes((tela) => permissoesDaSecao({ titulo: tela.rotulo, prefixos: [tela.prefixo] }))
);

function proximoEstado(codigo: string) {
  const atual = estadoRegraPermissao(codigo);
  const i = ESTADOS.indexOf(atual as (typeof ESTADOS)[number]);
  definirRegraPermissao(codigo, ESTADOS[(i + 1) % ESTADOS.length] ?? "herdar");
}

function rotuloAcessivel(tela: string, indice: number, codigo: string) {
  const acao = COLUNAS[indice]?.nome ?? codigo;
  const estado = icone(codigo).titulo;
  return `${tela} — ${acao}: ${estado}`;
}

// Icone/cor por estado (mockup: check verde = permite, x vermelho = nega, traco = herdado).
function icone(codigo: string | null) {
  if (!codigo) return { i: "mdi-minus", cor: "rgba(var(--v-theme-on-surface), 0.28)", titulo: "sem esta ação" };
  const estado = estadoRegraPermissao(codigo);
  if (estado === "permitir") return { i: "mdi-check", cor: "rgb(var(--v-theme-success))", titulo: "permite" };
  if (estado === "negar") return { i: "mdi-close", cor: "rgb(var(--v-theme-error))", titulo: "nega" };
  return { i: "mdi-minus", cor: "rgba(var(--v-theme-on-surface), 0.55)", titulo: "herdado" };
}
</script>

<template>
  <div class="pg-wrap">
    <div class="pg-grid">
      <div class="pg-linha pg-cabecalho">
        <div class="pg-tela-cel">Tela</div>
        <div v-for="c in COLUNAS" :key="c.rotulo" class="pg-acao-cel" :title="c.nome">{{ c.rotulo }}</div>
      </div>
      <div v-for="linha in grade" :key="linha.tela" class="pg-linha">
        <div class="pg-tela-cel pg-tela-nome">{{ linha.tela }}</div>
        <div v-for="(cel, i) in linha.celulas" :key="i" class="pg-acao-cel">
          <!-- Rotulo por celula: escondido na grade larga (o cabecalho ja mostra); visivel no modo
               card (<=768px), onde nao ha linha de cabecalho. -->
          <span class="pg-acao-rotulo" :title="COLUNAS[i]?.nome">{{ COLUNAS[i]?.rotulo }}</span>
          <button
            v-if="cel.codigo"
            type="button"
            class="pg-btn"
            :title="icone(cel.codigo).titulo"
            :aria-label="rotuloAcessivel(linha.tela, i, cel.codigo)"
            @click="proximoEstado(cel.codigo)"
          >
            <v-icon size="17" :color="icone(cel.codigo).cor">{{ icone(cel.codigo).i }}</v-icon>
          </button>
          <v-icon v-else size="15" color="rgba(var(--v-theme-on-surface), 0.28)">mdi-minus</v-icon>
        </div>
      </div>
    </div>
    <div class="pg-legenda">
      <span><v-icon size="14" color="success">mdi-check</v-icon> permite</span>
      <span><v-icon size="14" color="rgba(var(--v-theme-on-surface), 0.55)">mdi-minus</v-icon> herdado</span>
      <span><v-icon size="14" color="error">mdi-close</v-icon> nega</span>
      <span class="pg-legenda-fim">$ = sobre lançamento já pago (D/Pago) · clique para alternar</span>
    </div>
  </div>
</template>

<style scoped>
/* Grade de telas x acoes operacionais. */
.pg-wrap {
  margin-bottom: 16px;
}
.pg-grid {
  overflow: hidden;
  border: 0.5px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: 12px;
  font-size: 12px;
}
.pg-linha {
  display: grid;
  grid-template-columns: 112px repeat(12, minmax(44px, 1fr));
  border-bottom: 0.5px solid rgba(var(--v-theme-on-surface), 0.14);
}
.pg-linha:last-child {
  border-bottom: 0;
}
.pg-cabecalho {
  background: rgb(var(--v-theme-surface-variant));
}
.pg-tela-cel {
  padding: 10px 8px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}
.pg-cabecalho .pg-tela-cel {
  color: rgb(var(--v-theme-on-surface));
}
.pg-tela-nome {
  display: flex;
  align-items: center;
}
.pg-acao-cel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 2px;
  color: rgba(var(--v-theme-on-surface), 0.68);
  text-align: center;
}
.pg-cabecalho .pg-acao-cel {
  font-size: 11px;
}
.pg-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: none;
  padding: 4px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 6px;
  cursor: pointer;
}
.pg-btn:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}
/* Rotulo por celula: so aparece no modo card (mobile); na grade larga o cabecalho ja mostra. */
.pg-acao-rotulo {
  display: none;
}

/* <=768px: a matriz larga vira cards (um por tela), com as acoes em grid e o rotulo de cada acao
   ao lado do toggle. Empilha, sem scroll horizontal. */
@media (width <= 768px) {
  .pg-grid {
    display: grid;
    gap: 10px;
    border: 0;
    overflow: visible;
  }
  .pg-cabecalho {
    display: none;
  }
  .pg-linha {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 10px 12px;
    border: 0.5px solid rgba(var(--v-theme-on-surface), 0.14);
    border-radius: 12px;
    background: rgb(var(--v-theme-surface));
  }
  .pg-tela-cel {
    grid-column: 1 / -1;
    padding: 0 0 6px;
    font-weight: 600;
    border-bottom: 0.5px solid rgba(var(--v-theme-on-surface), 0.14);
  }
  .pg-acao-cel {
    justify-content: space-between;
    gap: 6px;
    min-height: 44px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
  .pg-acao-rotulo {
    display: block;
    overflow: hidden;
    font-size: 11px;
    color: rgba(var(--v-theme-on-surface), 0.68);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pg-btn {
    min-width: 40px;
    min-height: 40px;
    flex: 0 0 auto;
  }
}
.pg-legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.58);
}
.pg-legenda span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.pg-legenda-fim {
  margin-left: auto;
}
</style>
