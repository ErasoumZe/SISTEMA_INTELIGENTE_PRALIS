<script setup lang="ts">
// Permissoes em grade fiel ao mockup (docs/mockups/TODAS-AS-TELAS-mockup.html, tela 5): telas
// operacionais x 9 acoes. SEGURO: cada celula so aparece se o codigo de permissao REALMENTE existe
// (permissoesDaSecao); coluna sem codigo vira traco — NUNCA mostra "permite" falso. Reusa
// estadoRegraPermissao/definirRegraPermissao do alvo ja carregado (mesma gravacao de sempre).
import { useWorkspaceContext } from "~/components/workspace/workspace-context";

const { permissoesDaSecao, estadoRegraPermissao, definirRegraPermissao } = useWorkspaceContext();

// Telas operacionais do mockup (por prefixo de permissao).
const TELAS = [
  { rotulo: "Despesas", prefixo: "despesas" },
  { rotulo: "Mercadorias", prefixo: "mercadorias" },
  { rotulo: "Retiradas", prefixo: "retiradas" },
  { rotulo: "Transferências", prefixo: "transferencias" },
  { rotulo: "Entradas", prefixo: "entradas" }
];

// 9 colunas do mockup -> sufixos candidatos do codigo real. "$" = variantes sobre valor / D-Pago.
const COLUNAS = [
  { rotulo: "Lanç", sufixos: ["criar", "lancar"] },
  { rotulo: "Pagar", sufixos: ["pagar"] },
  { rotulo: "Discr", sufixos: ["discriminar"] },
  { rotulo: "Ver", sufixos: ["visualizar"] },
  { rotulo: "Ver$", sufixos: ["visualizar_valor", "visualizar_pago", "ver_pago"] },
  { rotulo: "Edit", sufixos: ["editar"] },
  { rotulo: "Edit$", sufixos: ["editar_valor", "editar_pago"] },
  { rotulo: "Excl", sufixos: ["excluir"] },
  { rotulo: "Excl$", sufixos: ["excluir_valor", "excluir_pago"] }
];

const ESTADOS = ["herdar", "permitir", "negar"] as const;

// Grade resolvida: para cada tela x coluna, o codigo real que existe (ou null).
const grade = computed(() =>
  TELAS.map((tela) => {
    const codigos = permissoesDaSecao({ titulo: tela.rotulo, prefixos: [tela.prefixo] });
    const celulas = COLUNAS.map((coluna) => {
      const codigo = coluna.sufixos.map((s) => `${tela.prefixo}_${s}`).find((c) => codigos.includes(c)) ?? null;
      return { codigo };
    });
    return { tela: tela.rotulo, celulas };
  })
);

function proximoEstado(codigo: string) {
  const atual = estadoRegraPermissao(codigo);
  const i = ESTADOS.indexOf(atual as (typeof ESTADOS)[number]);
  definirRegraPermissao(codigo, ESTADOS[(i + 1) % ESTADOS.length] ?? "herdar");
}

// Icone/cor por estado (mockup: check verde = permite, x vermelho = nega, traco = herdado).
function icone(codigo: string | null) {
  if (!codigo) return { i: "mdi-minus", cor: "#cbd2dc", titulo: "sem esta acao" };
  const estado = estadoRegraPermissao(codigo);
  if (estado === "permitir") return { i: "mdi-check", cor: "#16a34a", titulo: "permite" };
  if (estado === "negar") return { i: "mdi-close", cor: "#c0392b", titulo: "nega" };
  return { i: "mdi-minus", cor: "#94a3b8", titulo: "herdado" };
}
</script>

<template>
  <div class="pg-wrap">
    <div class="pg-grid">
      <div class="pg-linha pg-cabecalho">
        <div class="pg-tela-cel">Tela</div>
        <div v-for="c in COLUNAS" :key="c.rotulo" class="pg-acao-cel">{{ c.rotulo }}</div>
      </div>
      <div v-for="linha in grade" :key="linha.tela" class="pg-linha">
        <div class="pg-tela-cel pg-tela-nome">{{ linha.tela }}</div>
        <div v-for="(cel, i) in linha.celulas" :key="i" class="pg-acao-cel">
          <button
            v-if="cel.codigo"
            type="button"
            class="pg-btn"
            :title="icone(cel.codigo).titulo"
            @click="proximoEstado(cel.codigo)"
          >
            <v-icon size="17" :color="icone(cel.codigo).cor">{{ icone(cel.codigo).i }}</v-icon>
          </button>
          <v-icon v-else size="15" color="#cbd2dc">mdi-minus</v-icon>
        </div>
      </div>
    </div>
    <div class="pg-legenda">
      <span><v-icon size="14" color="#16a34a">mdi-check</v-icon> permite</span>
      <span><v-icon size="14" color="#94a3b8">mdi-minus</v-icon> herdado</span>
      <span><v-icon size="14" color="#c0392b">mdi-close</v-icon> nega</span>
      <span class="pg-legenda-fim">$ = sobre lançamento já pago (D/Pago) · clique para alternar</span>
    </div>
  </div>
</template>

<style scoped>
/* Mockup tela 5. Grade telas x 9 acoes. */
.pg-wrap {
  margin-bottom: 16px;
}
.pg-grid {
  overflow: hidden;
  border: 0.5px solid #e4e8ef;
  border-radius: 12px;
  font-size: 12px;
}
.pg-linha {
  display: grid;
  grid-template-columns: 120px repeat(9, 1fr);
  border-bottom: 0.5px solid #e4e8ef;
}
.pg-linha:last-child {
  border-bottom: 0;
}
.pg-cabecalho {
  background: #f4f6fa;
}
.pg-tela-cel {
  padding: 10px 8px;
  font-weight: 500;
  color: #1f2733;
}
.pg-cabecalho .pg-tela-cel {
  color: #1f2733;
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
  color: #64748b;
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
  border-radius: 6px;
  cursor: pointer;
}
.pg-btn:hover {
  background: #f4f6fa;
}
.pg-legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
  font-size: 11px;
  color: #94a3b8;
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
