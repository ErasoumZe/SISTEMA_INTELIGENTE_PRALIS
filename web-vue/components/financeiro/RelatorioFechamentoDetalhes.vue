<script setup lang="ts">
import { formatarDataHora } from "~/utils/formatacao";

type Registro = Record<string, unknown>;
type Anexo = { id: string; tipo: string; nomeOriginal: string; mimeType: string };
type Decisao = {
  id: string;
  resultado: "conferido" | "divergente";
  observacao: string | null;
  conferidoPor: string;
  conferidoPorNome: string | null;
  conferidoEm: string | null;
};

// Tudo o que antes ficava escondido em "Evidencias adicionais" agora aparece na tela principal do fechamento,
// uma secao por assunto, cada uma com a sua cor (--sec). So le o dossie; nada recalcula dinheiro.
const props = defineProps<{
  conferencias: Registro[];
  quebras: Registro[];
  decisoes: Decisao[];
  anexos: Anexo[];
  anexoUrl: (anexo: Anexo) => string;
  dinheiro: (valor: number) => string;
  numero: (valor: unknown) => number;
  texto: (valor: unknown) => string;
}>();

const ETAPAS: Record<string, string> = {
  abertura: "Abertura",
  fechamento: "Fechamento",
  sangria: "Sangria",
  retorno: "Retorno final"
};
const RESULTADOS: Record<string, string> = {
  convergente: "Bateu",
  divergente: "Não bateu",
  conferido: "Conferido"
};
function rotulo(mapa: Record<string, string>, valor: unknown) {
  const chave = String(valor ?? "");
  return mapa[chave] ?? props.texto(valor);
}
function quando(valor: unknown) {
  return valor ? formatarDataHora(String(valor)) : "--";
}
function rotuloAnexo(tipo: string) {
  return (
    {
      folha_fechamento: "Folha de fechamento",
      comprovante_cartao: "Comprovante da maquininha",
      relatorio_vendas_creare: "Folha CREARE"
    }[tipo] ?? tipo
  );
}
</script>

<template>
  <div class="det" data-teste="detalhes-fechamento">
    <section class="det__secao det__secao--fisico" aria-labelledby="det-fisico">
      <h3 id="det-fisico">Conferências físicas e quebras</h3>
      <ul v-if="conferencias.length" class="det__lista">
        <li v-for="item in conferencias" :key="String(item.id)" class="det__linha">
          <strong>{{ rotulo(ETAPAS, item.etapa) }}</strong>
          <span class="det__chip">{{ rotulo(RESULTADOS, item.resultado) }}</span>
          <span>Declarado {{ dinheiro(numero(item.valorEspecieDeclarado) + numero(item.valorMoedasDeclarado)) }}</span>
          <span>Contado {{ dinheiro(numero(item.valorEspecieContado) + numero(item.valorMoedasContado)) }}</span>
          <small>{{ quando(item.conferidoEm) }}</small>
        </li>
      </ul>
      <p v-else class="det__vazio">Ainda não há conferência física registrada.</p>
      <v-alert v-for="quebra in quebras" :key="String(quebra.id)" type="error" variant="tonal" density="compact">
        <strong>Quebra {{ dinheiro(numero(quebra.valor)) }}</strong> · {{ texto(quebra.observacao) }}
      </v-alert>
    </section>

    <section class="det__secao det__secao--decisoes" aria-labelledby="det-decisoes">
      <h3 id="det-decisoes">Decisões da Tesouraria</h3>
      <ul v-if="decisoes.length" class="det__lista">
        <li v-for="item in decisoes" :key="item.id" class="det__linha">
          <strong>{{ item.resultado === "conferido" ? "Conferido" : "Quebra / divergência" }}</strong>
          <span>{{ item.observacao || "Sem justificativa" }}</span>
          <span>{{ item.conferidoPorNome || item.conferidoPor }}</span>
          <small>{{ quando(item.conferidoEm) }}</small>
        </li>
      </ul>
      <p v-else class="det__vazio">Nenhuma decisão final registrada.</p>
    </section>

    <section class="det__secao det__secao--anexos" aria-labelledby="det-anexos">
      <h3 id="det-anexos">Folhas e comprovantes anexados</h3>
      <div v-if="anexos.length" class="det__anexos">
        <v-card v-for="anexo in anexos" :key="anexo.id" variant="outlined">
          <v-img
            v-if="anexo.mimeType.startsWith('image/')"
            :src="anexoUrl(anexo)"
            :alt="`${rotuloAnexo(anexo.tipo)}: ${anexo.nomeOriginal}`"
            height="120"
            cover
          />
          <v-sheet v-else class="pa-6 text-center"
            ><v-icon icon="mdi-file-pdf-box" size="42" color="secondary"
          /></v-sheet>
          <v-card-text>
            <strong>{{ rotuloAnexo(anexo.tipo) }}</strong>
            <div class="text-caption text-truncate" :title="anexo.nomeOriginal">{{ anexo.nomeOriginal }}</div>
          </v-card-text>
          <v-card-actions>
            <v-btn
              :href="anexoUrl(anexo)"
              target="_blank"
              rel="noopener noreferrer"
              class="det__abrir"
              prepend-icon="mdi-download"
              >Abrir</v-btn
            >
          </v-card-actions>
        </v-card>
      </div>
      <p v-else class="det__vazio">Nenhum anexo foi enviado.</p>
    </section>
  </div>
</template>

<style scoped>
.det {
  display: grid;
  gap: var(--cx-sp-3);
  margin-top: var(--cx-sp-3);
}
.det__secao {
  display: grid;
  gap: var(--cx-sp-2);
  padding: var(--cx-sp-4);
  border: 1px solid var(--cx-line);
  border-left: 4px solid var(--sec);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-raised);
  color: var(--cx-ink);
}
.det__secao--fisico {
  --sec: #e5484d;
}
.det__secao--decisoes {
  --sec: #14a3a3;
}
.det__secao--anexos {
  --sec: #6b7280;
}
.det__secao h3 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cx-sp-2);
  margin: 0;
  font-size: var(--cx-fs-lead);
  font-weight: 800;
}
.det__vazio,
.det__lista,
.det__linha {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  align-items: center;
  gap: var(--cx-sp-1) var(--cx-sp-3);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  overflow-wrap: anywhere;
}
.det__linha small {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}
.det__chip {
  justify-self: start;
  padding: 0 var(--cx-sp-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sec) 18%, transparent);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}
.det__abrir {
  min-height: 44px;
}
.det__anexos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--cx-sp-3);
}
</style>
