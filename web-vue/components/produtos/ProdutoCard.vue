<script setup lang="ts">
/**
 * Card de produto da listagem. Desenho proximo ao do app antigo, na linguagem visual Cicluz:
 * so tokens `--cx-*` e icones MDI (o Pralis usava Material Symbols como ligadura — copiar os nomes
 * de la produziria caixas vazias).
 *
 * Nao existe botao de EXCLUIR: produto e inativado, nunca apagado.
 */
import type { ProdutoResumo } from "@padaria/shared";

const props = defineProps<{ produto: ProdutoResumo; podeEditar: boolean }>();
defineEmits<{ editar: [id: string] }>();

const { apiUrl } = useApi();

const ativo = computed(() => props.produto.status === "ativo");
const ehRevenda = computed(() => props.produto.tipo === "revenda");
const fotoEmTelaCheia = ref(false);

/**
 * A foto vem pela rota autenticada — inclusive a legada, que a API redireciona. Baixada por fetch e
 * exibida como object URL: `<img src>` apontando direto para a API e bloqueado pelo navegador
 * (outra origem + `Cross-Origin-Resource-Policy: same-origin` do helmet).
 */
const { endereco: enderecoDaFoto, carregar: carregarFoto } = useFotoDeProduto();
onMounted(() => void carregarFoto(apiUrl, props.produto.id, Boolean(props.produto.fotoUrl)));

const gramatura = computed(() => {
  const quantidade = Number(props.produto.quantidadeIndividual);
  if (!Number.isFinite(quantidade) || quantidade <= 0) return "—";
  const numero = quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return [numero, props.produto.unidadeIndividualSigla].filter(Boolean).join(" ");
});

const estoque = computed(() => {
  const atual = Number(props.produto.quantidadeEstoque);
  return Number.isFinite(atual) ? atual.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "—";
});

const preco = computed(() =>
  props.produto.precoVendaAtual == null
    ? null
    : props.produto.precoVendaAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
);
</script>

<template>
  <article class="produto-card">
    <header class="produto-card__topo">
      <div class="produto-card__identidade">
        <div
          class="produto-card__foto"
          :class="{ 'produto-card__foto--vazia': !enderecoDaFoto }"
          :role="enderecoDaFoto ? 'button' : undefined"
          :tabindex="enderecoDaFoto ? 0 : undefined"
          :aria-label="enderecoDaFoto ? `Ampliar foto de ${produto.descricao}` : undefined"
          @click="enderecoDaFoto && (fotoEmTelaCheia = true)"
          @keydown.enter.prevent="enderecoDaFoto && (fotoEmTelaCheia = true)"
          @keydown.space.prevent="enderecoDaFoto && (fotoEmTelaCheia = true)"
        >
          <img v-if="enderecoDaFoto" :src="enderecoDaFoto" :alt="produto.descricao" loading="lazy" />
          <v-icon v-else icon="mdi-basket-outline" size="22" />
        </div>
        <div class="produto-card__titulo">
          <h3 :title="produto.descricao">{{ produto.descricao }}</h3>
          <p class="cx-num">{{ produto.codigoInterno || "sem código" }}</p>
        </div>
      </div>
      <span class="produto-card__status" :class="ativo ? 'is-ativo' : 'is-inativo'">
        {{ ativo ? "Ativo" : "Inativo" }}
      </span>
    </header>

    <dl class="produto-card__dados">
      <div>
        <dt>Tipo</dt>
        <dd>{{ ehRevenda ? "Revenda" : "Transformação" }}</dd>
      </div>
      <div>
        <dt>Gramatura</dt>
        <dd class="cx-num">{{ gramatura }}</dd>
      </div>
      <div>
        <dt>Marca</dt>
        <dd>{{ produto.marca || "—" }}</dd>
      </div>
      <div>
        <dt>Grupo</dt>
        <dd>{{ produto.grupoNome || "—" }}</dd>
      </div>
      <div>
        <dt>EAN</dt>
        <dd class="cx-num">{{ produto.codigoBarras || "—" }}</dd>
      </div>
      <div>
        <dt>Estoque</dt>
        <dd class="cx-num">{{ estoque }}</dd>
      </div>
    </dl>

    <footer class="produto-card__rodape">
      <span v-if="preco" class="produto-card__preco cx-num">{{ preco }}</span>
      <span v-else class="produto-card__preco produto-card__preco--vazio">sem preço de referência</span>
      <v-btn
        v-if="podeEditar"
        size="small"
        variant="text"
        prepend-icon="mdi-pencil-outline"
        :to="`/produtos/${produto.id}`"
      >
        Editar
      </v-btn>
      <v-btn v-else size="small" variant="text" prepend-icon="mdi-eye-outline" :to="`/produtos/${produto.id}`">
        Ver
      </v-btn>
    </footer>

    <v-dialog v-model="fotoEmTelaCheia" max-width="900" :aria-label="`Foto ampliada de ${produto.descricao}`">
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between ga-2">
          {{ produto.descricao }}
          <v-btn icon="mdi-close" variant="text" aria-label="Fechar foto ampliada" @click="fotoEmTelaCheia = false" />
        </v-card-title>
        <v-card-text class="produto-card__foto-ampliada-conteudo">
          <img
            v-if="enderecoDaFoto"
            :src="enderecoDaFoto"
            :alt="produto.descricao"
            class="produto-card__foto-ampliada"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </article>
</template>

<style scoped>
.produto-card {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
  height: 100%;
  min-width: 0;
  padding: var(--cx-sp-4);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
  transition:
    box-shadow var(--cx-dur-2) var(--cx-ease),
    transform var(--cx-dur-2) var(--cx-ease);
}
.produto-card:hover {
  box-shadow: var(--cx-e-2);
  transform: translateY(-2px);
}

.produto-card__topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  min-width: 0;
}
.produto-card__identidade {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  min-width: 0;
}
.produto-card__foto {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
}
.produto-card__foto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.produto-card__foto[role="button"] {
  cursor: zoom-in;
}
.produto-card__foto[role="button"]:focus-visible {
  outline: 2px solid var(--cx-focus);
  outline-offset: 2px;
}
.produto-card__foto-ampliada-conteudo {
  display: grid;
  place-items: center;
  padding: var(--cx-sp-3);
}
.produto-card__foto-ampliada {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: min(75vh, 720px);
  object-fit: contain;
}
.produto-card__titulo {
  min-width: 0;
}
.produto-card__titulo h3 {
  overflow: hidden;
  font-size: var(--cx-fs-lead);
  font-weight: 600;
  line-height: 1.3;
  color: var(--cx-ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.produto-card__titulo p {
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.produto-card__status {
  flex: 0 0 auto;
  padding: 2px var(--cx-sp-2);
  border-radius: var(--cx-r-pill);
  font-size: var(--cx-fs-micro);
  font-weight: 600;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}
.produto-card__status.is-ativo {
  background: color-mix(in srgb, var(--cx-positive) 14%, transparent);
  color: var(--cx-positive);
}
.produto-card__status.is-inativo {
  background: var(--cx-hover);
  color: var(--cx-ink-soft);
}

.produto-card__dados {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-2) var(--cx-sp-3);
  margin: 0;
  padding-top: var(--cx-sp-3);
  border-top: 1px solid var(--cx-line-soft);
}
.produto-card__dados > div {
  min-width: 0;
}
.produto-card__dados dt {
  font-size: var(--cx-fs-micro);
  letter-spacing: var(--cx-tracking-wide);
  color: var(--cx-ink-soft);
  text-transform: uppercase;
}
.produto-card__dados dd {
  overflow: hidden;
  margin: 0;
  font-size: var(--cx-fs-body);
  color: var(--cx-ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.produto-card__rodape {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  margin-top: auto;
  padding-top: var(--cx-sp-3);
  border-top: 1px solid var(--cx-line-soft);
}
.produto-card__preco {
  font-size: var(--cx-fs-title);
  font-weight: 700;
  color: var(--cx-ink);
}
.produto-card__preco--vazio {
  font-size: var(--cx-fs-caption);
  font-weight: 400;
  color: var(--cx-ink-soft);
}

@media (prefers-reduced-motion: reduce) {
  .produto-card:hover {
    transform: none;
  }
}
</style>
