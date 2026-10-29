<script setup lang="ts">
/**
 * Card de produto da listagem. Desenho proximo ao do app antigo, na linguagem visual Cicluz:
 * so tokens `--cx-*` e icones MDI (o Pralis usava Material Symbols como ligadura — copiar os nomes
 * de la produziria caixas vazias).
 *
 * Nao existe botao de EXCLUIR: produto e inativado, nunca apagado.
 */
import type { ProdutoResumo } from "@padaria/shared";
import { reais } from "~/utils/produto-preco-card";

const props = defineProps<{
  produto: ProdutoResumo;
  /** Preco calculado como no formulario (`precoCalculadoDoProduto`); `null` = sem preco. */
  preco: number | null;
  podeEditar: boolean;
  alterandoStatus?: boolean;
  selecionavel?: boolean;
  selecionado?: boolean;
}>();
const emit = defineEmits<{
  "alternar-status": [];
  selecionar: [];
  "ampliar-foto": [foto: { endereco: string; nome: string }];
}>();

const { apiUrl } = useApi();

const ativo = computed(() => props.produto.status === "ativo");
const ehRevenda = computed(() => props.produto.tipo === "revenda");

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

const preco = computed(() => (props.preco == null ? null : reais(props.preco)));
/** Promocao vigente agora (o servidor ja aplica): aparece ao lado, sem trocar o preco de referencia. */
const promocao = computed(() => {
  const atual = props.produto.precoVendaAtual;
  return atual != null && props.preco != null && atual < props.preco ? reais(atual) : null;
});
const nome = computed(() => props.produto.nomeCatalogo || props.produto.descricao);
</script>

<template>
  <article class="produto-card">
    <header class="produto-card__topo">
      <div class="produto-card__identidade">
        <!-- Clicar na foto amplia (paralelo). Sem foto, nada a ampliar. -->
        <button
          v-if="enderecoDaFoto"
          type="button"
          class="produto-card__foto produto-card__foto--botao"
          :aria-label="`Ampliar a foto de ${nome}`"
          @click="emit('ampliar-foto', { endereco: enderecoDaFoto, nome })"
        >
          <img :src="enderecoDaFoto" :alt="nome" loading="lazy" />
        </button>
        <div v-else class="produto-card__foto produto-card__foto--vazia">
          <v-icon icon="mdi-basket-outline" size="22" />
        </div>
        <div class="produto-card__titulo">
          <h3 :title="produto.descricao">{{ produto.nomeCatalogo || produto.descricao }}</h3>
          <p v-if="produto.nomeCatalogo" class="produto-card__descricao">{{ produto.descricao }}</p>
          <p class="cx-num">{{ produto.codigoInterno || "sem código" }}</p>
        </div>
      </div>
      <div class="produto-card__marcas">
        <v-checkbox-btn
          v-if="selecionavel"
          :model-value="selecionado"
          density="compact"
          :aria-label="`Selecionar ${produto.nomeCatalogo || produto.descricao}`"
          @update:model-value="$emit('selecionar')"
        />
        <!-- Oficial: ativa/inativa no proprio card. Nao existe excluir. -->
        <button
          v-if="podeEditar"
          type="button"
          class="produto-card__status produto-card__status--acao"
          :class="ativo ? 'is-ativo' : 'is-inativo'"
          :disabled="alterandoStatus"
          :aria-label="`${ativo ? 'Inativar' : 'Ativar'} ${produto.nomeCatalogo || produto.descricao}`"
          :title="ativo ? 'Clique para inativar' : 'Clique para ativar'"
          @click="$emit('alternar-status')"
        >
          {{ alterandoStatus ? "..." : ativo ? "Ativo" : "Inativo" }}
        </button>
        <span v-else class="produto-card__status" :class="ativo ? 'is-ativo' : 'is-inativo'">
          {{ ativo ? "Ativo" : "Inativo" }}
        </span>
      </div>
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

    <p v-if="produto.criadoPorNome" class="produto-card__autor">
      <v-icon icon="mdi-account-outline" size="14" /> cadastrado por {{ produto.criadoPorNome }}
    </p>

    <footer class="produto-card__rodape">
      <span v-if="preco" class="produto-card__preco cx-num">
        {{ preco }}
        <small v-if="promocao" class="produto-card__promocao">promoção {{ promocao }}</small>
      </span>
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
.produto-card__titulo .produto-card__descricao {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.produto-card__status--acao {
  border: 1px solid transparent;
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--cx-dur-1) var(--cx-ease);
}
.produto-card__status--acao:hover:not(:disabled) {
  border-color: currentColor;
}
.produto-card__status--acao:focus-visible {
  outline: 2px solid var(--cx-brand);
  outline-offset: 2px;
}
.produto-card__status--acao:disabled {
  cursor: progress;
  opacity: 0.6;
}

.produto-card__marcas {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--cx-sp-1);
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
.produto-card__promocao {
  display: block;
  font-size: var(--cx-fs-caption);
  font-weight: 600;
  color: var(--cx-positive);
}
.produto-card__autor {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-1);
  margin: 0;
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}
.produto-card__foto--botao {
  padding: 0;
  border: 0;
  cursor: zoom-in;
}
.produto-card__foto--botao:focus-visible {
  outline: 2px solid var(--cx-brand);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .produto-card:hover {
    transform: none;
  }
}
</style>
