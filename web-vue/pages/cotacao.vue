<script setup lang="ts">
/**
 * R-216 — a cotacao que o fornecedor responde, sem login, pelo link do WhatsApp.
 *
 * Mesmo desenho da ficha de admissao: nao monta AppWorkspace, nao le sessao, o token vem do
 * fragmento (`#t=`), sai da barra de enderecos logo ao abrir e segue so no cabecalho.
 *
 * O fornecedor nao perde trabalho: o rascunho salva sozinho poucos segundos depois de cada mudanca,
 * e o botao "Salvar e continuar depois" deixa isso explicito. Enviar e um ato unico, com
 * confirmacao, porque depois dele o link fecha.
 */
import { calcularCotacao, pendenciasParaEnviar, type CotacaoPublicaDto } from "@padaria/shared";
import CotacaoItemCartao, { type RespostaItemCotacao } from "~/components/cotacao/CotacaoItemCartao.vue";
import CotacaoResumo, { type CondicoesCotacao } from "~/components/cotacao/CotacaoResumo.vue";
import { CABECALHO_DA_COTACAO, tokenDoFragmento } from "~/utils/cotacao-link";

// Mesmo motivo da admissao: sem isto o vue-router imprime o fragmento (o token) no console.
definePageMeta({ scrollToTop: false });

const { apiUrl } = useApi();
const token = ref("");
const cotacao = ref<CotacaoPublicaDto | null>(null);
const carregando = ref(true);
const salvando = ref(false);
const enviando = ref(false);
const erro = ref("");
const tentouEnviar = ref(false);
const confirmarEnvio = ref(false);
const salvoEm = ref<Date | null>(null);
const pendenteDeSalvar = ref(false);
const respostas = ref<RespostaItemCotacao[]>([]);
const condicoes = ref<CondicoesCotacao>({
  descontoGeralTipo: "valor",
  descontoGeralValor: "",
  prazoEntrega: "",
  condicaoPagamento: "",
  observacao: ""
});

class ErroHttp extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

// `credentials: "omit"`: mandar cookie de sessao numa rota de token deixaria o Comprador, logado no
// mesmo navegador, passar por fornecedor — e mascararia falha de token em teste.
async function chamar<T>(metodo: string, corpo?: object): Promise<T | null> {
  const rota = metodo === "POST" ? "/api/cotacao/enviar" : "/api/cotacao";
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method: metodo,
    credentials: "omit",
    headers: {
      [CABECALHO_DA_COTACAO]: token.value,
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  if (resposta.status === 204) return null;
  const json = (await resposta.json().catch(() => null)) as { data?: T; title?: string; code?: string } | null;
  if (!resposta.ok) {
    const mensagem =
      json?.code === "VALIDATION_ERROR"
        ? "Confira os números digitados: use apenas números, com vírgula para os centavos."
        : (json?.title ?? "Não foi possível falar com o servidor. Tente de novo em instantes.");
    throw new ErroHttp(mensagem, resposta.status);
  }
  return json?.data ?? null;
}

const decimalParaTela = (valor: string | null, casas: number) =>
  valor === null
    ? ""
    : Number(valor).toLocaleString("pt-BR", {
        maximumFractionDigits: casas,
        minimumFractionDigits: 0,
        useGrouping: false
      });

function preencher(dados: CotacaoPublicaDto) {
  respostas.value = dados.itens.map((item) => ({
    pedidoItemId: item.pedidoItemId,
    indisponivel: item.indisponivel,
    valorUnitario: item.valorUnitario === null ? "" : Number(item.valorUnitario).toFixed(2).replace(".", ","),
    descontoTipo: item.descontoTipo ?? "valor",
    descontoValor: decimalParaTela(item.descontoValor, 4)
  }));
  condicoes.value = {
    descontoGeralTipo: dados.descontoGeralTipo ?? "valor",
    descontoGeralValor: decimalParaTela(dados.descontoGeralValor, 4),
    prazoEntrega: dados.prazoEntrega ?? "",
    condicaoPagamento: dados.condicaoPagamento ?? "",
    observacao: dados.observacao ?? ""
  };
}

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    cotacao.value = await chamar<CotacaoPublicaDto>("GET");
    if (cotacao.value) preencher(cotacao.value);
    await nextTick();
    pendenteDeSalvar.value = false;
  } catch (causa) {
    cotacao.value = null;
    erro.value = causa instanceof ErroHttp && causa.status === 404 ? "" : (causa as Error).message;
  } finally {
    carregando.value = false;
  }
}

const aberta = computed(() => cotacao.value?.situacao === "aberta");

const entrada = computed(() => {
  const quantidadePorId = new Map((cotacao.value?.itens ?? []).map((item) => [item.pedidoItemId, item.quantidade]));
  return respostas.value.map((resposta) => ({
    id: resposta.pedidoItemId,
    quantidade: quantidadePorId.get(resposta.pedidoItemId) ?? "0",
    indisponivel: resposta.indisponivel,
    valorUnitario: resposta.valorUnitario || null,
    descontoTipo: resposta.descontoValor ? resposta.descontoTipo : null,
    descontoValor: resposta.descontoValor || null
  }));
});
const calculo = computed(() =>
  calcularCotacao(entrada.value, {
    tipo: condicoes.value.descontoGeralValor ? condicoes.value.descontoGeralTipo : null,
    valor: condicoes.value.descontoGeralValor || null
  })
);
const calculoPorId = computed(() => new Map(calculo.value.itens.map((item) => [item.id, item])));
const pendencias = computed(() =>
  pendenciasParaEnviar(
    entrada.value,
    calculo.value,
    Object.fromEntries((cotacao.value?.itens ?? []).map((item) => [item.pedidoItemId, item.descricao]))
  )
);

function payload() {
  return {
    itens: entrada.value.map((item) => ({
      pedidoItemId: item.id,
      indisponivel: item.indisponivel,
      valorUnitario: item.valorUnitario,
      descontoTipo: item.descontoTipo,
      descontoValor: item.descontoValor
    })),
    descontoGeralTipo: condicoes.value.descontoGeralValor ? condicoes.value.descontoGeralTipo : null,
    descontoGeralValor: condicoes.value.descontoGeralValor || null,
    prazoEntrega: condicoes.value.prazoEntrega || null,
    condicaoPagamento: condicoes.value.condicaoPagamento.trim() || null,
    observacao: condicoes.value.observacao.trim() || null
  };
}

let temporizador: ReturnType<typeof setTimeout> | null = null;

async function salvar(silencioso = false) {
  if (!aberta.value || enviando.value) return;
  if (temporizador) clearTimeout(temporizador);
  salvando.value = true;
  try {
    await chamar("PUT", payload());
    salvoEm.value = new Date();
    pendenteDeSalvar.value = false;
    if (!silencioso) erro.value = "";
  } catch (causa) {
    if (causa instanceof ErroHttp && causa.status === 410) return void (await carregar());
    if (!silencioso) erro.value = (causa as Error).message;
  } finally {
    salvando.value = false;
  }
}

// Rascunho automatico: 2,5 s depois da ultima mudanca. O teto da API e 60 por minuto por link.
watch(
  [respostas, condicoes],
  () => {
    if (carregando.value || !aberta.value) return;
    pendenteDeSalvar.value = true;
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => void salvar(true), 2_500);
  },
  { deep: true }
);

function pedirEnvio() {
  tentouEnviar.value = true;
  if (pendencias.value.length) {
    document.querySelector(".cotacao-item--pendente")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  confirmarEnvio.value = true;
}

async function enviar() {
  if (temporizador) clearTimeout(temporizador);
  enviando.value = true;
  erro.value = "";
  try {
    await chamar("POST", payload());
    confirmarEnvio.value = false;
    await carregar();
  } catch (causa) {
    confirmarEnvio.value = false;
    if (causa instanceof ErroHttp && causa.status === 410) return void (await carregar());
    erro.value = (causa as Error).message;
  } finally {
    enviando.value = false;
  }
}

const formatoPrazo = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
// O prazo gravado e exclusivo (meia-noite do dia seguinte); para quem le, "ate 23:59" e mais honesto.
const prazo = computed(() =>
  cotacao.value ? formatoPrazo.format(new Date(new Date(cotacao.value.expiraEm).getTime() - 60_000)) : ""
);
const respondidaEm = computed(() =>
  cotacao.value?.respondidaEm ? formatoPrazo.format(new Date(cotacao.value.respondidaEm)) : ""
);
const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const estadoDoRascunho = computed(() => {
  if (salvando.value) return "Salvando rascunho…";
  if (pendenteDeSalvar.value) return "Alterações ainda não salvas";
  if (salvoEm.value)
    return `Rascunho salvo às ${salvoEm.value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return "Você pode salvar e voltar pelo mesmo link";
});

/**
 * Salva o que falta no instante em que a pagina sai de cena (troca de app, aba fechada).
 *
 * O rascunho automatico espera 2,5 s; quem digita o ultimo valor e volta para o WhatsApp em menos
 * que isso perderia a digitacao. `keepalive` deixa a requisicao terminar mesmo com a pagina
 * descarregando — e, ao contrario do `sendBeacon`, aceita o cabecalho do token.
 */
function salvarAoSair() {
  if (document.visibilityState !== "hidden" || !pendenteDeSalvar.value || !aberta.value || enviando.value) return;
  if (temporizador) clearTimeout(temporizador);
  pendenteDeSalvar.value = false;
  void fetch(`${apiUrl}/api/cotacao`, {
    method: "PUT",
    credentials: "omit",
    keepalive: true,
    headers: { [CABECALHO_DA_COTACAO]: token.value, "Content-Type": "application/json" },
    body: JSON.stringify(payload())
  }).catch(() => {
    pendenteDeSalvar.value = true;
  });
}

onMounted(async () => {
  document.addEventListener("visibilitychange", salvarAoSair);
  token.value = tokenDoFragmento(window.location.hash);
  // Tira o segredo da barra de enderecos: print de tela e historico deixam de carregar o token.
  if (window.location.hash) history.replaceState(null, "", window.location.pathname);
  if (!token.value) {
    carregando.value = false;
    return;
  }
  await carregar();
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", salvarAoSair);
  if (temporizador) clearTimeout(temporizador);
});
</script>

<template>
  <v-main class="cotacao-pagina">
    <div class="cotacao">
      <header class="cotacao__topo">
        <p class="cotacao__selo">
          <v-icon icon="mdi-clipboard-text-outline" size="16" />
          Cotação de compra<span v-if="cotacao"> · Ref. {{ cotacao.referencia }}</span>
        </p>
        <h1 class="cotacao__empresa">{{ cotacao?.empresaNome || "Cotação" }}</h1>
        <p v-if="cotacao" class="cotacao__para">
          Para <strong>{{ cotacao.fornecedorNome }}</strong>
        </p>
        <p v-if="aberta" class="cotacao__prazo">
          <v-icon icon="mdi-clock-outline" size="16" /> Responda até <strong>{{ prazo }}</strong>
        </p>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>

      <div v-if="carregando" class="cotacao__estado" aria-busy="true">
        <v-progress-circular indeterminate color="primary" />
        <p>Abrindo a cotação…</p>
      </div>

      <div v-else-if="!cotacao" class="cotacao__estado" data-estado="invalido">
        <v-icon icon="mdi-link-variant-off" size="48" color="error" />
        <h2>Link inválido</h2>
        <p>Este link não abre nenhuma cotação. Confira se ele chegou inteiro ou peça um novo ao comprador.</p>
      </div>

      <div v-else-if="cotacao.situacao === 'respondida'" class="cotacao__estado" data-estado="respondida">
        <v-icon icon="mdi-check-circle" size="56" color="success" />
        <h2>Cotação enviada</h2>
        <p>Recebemos seus valores em {{ respondidaEm }}. O comprador vai analisar e entrar em contato.</p>
        <p class="cotacao__estado-nota">Por segurança, este link não abre mais o formulário.</p>
      </div>

      <div v-else-if="cotacao.situacao === 'expirada'" class="cotacao__estado" data-estado="expirada">
        <v-icon icon="mdi-timer-off-outline" size="48" color="warning" />
        <h2>O prazo terminou</h2>
        <p>Esta cotação podia ser respondida até {{ prazo }}. Peça um novo link ao comprador.</p>
      </div>

      <div v-else-if="cotacao.situacao === 'revogada'" class="cotacao__estado" data-estado="revogada">
        <v-icon icon="mdi-link-variant-off" size="48" color="warning" />
        <h2>Este link não vale mais</h2>
        <p>O comprador gerou um link novo ou encerrou o pedido. Use o link mais recente que você recebeu.</p>
      </div>

      <template v-else>
        <p class="cotacao__instrucao">
          Informe o <strong>valor atual</strong> de cada produto. Se quiser, dê desconto por produto ou no pedido todo.
          Não tem algum item? Marque <strong>Não tenho este produto</strong>.
        </p>

        <section class="cotacao__itens" aria-label="Produtos da cotação">
          <CotacaoItemCartao
            v-for="(item, indice) in cotacao.itens"
            :key="item.pedidoItemId"
            v-model="respostas[indice]!"
            :item="item"
            :calculo="calculoPorId.get(item.pedidoItemId) ?? null"
            :cobrar-valor="tentouEnviar"
          />
        </section>

        <CotacaoResumo v-model="condicoes" :calculo="calculo" />

        <v-alert
          v-if="tentouEnviar && pendencias.length"
          type="warning"
          variant="tonal"
          density="compact"
          title="Falta pouco para enviar"
          data-campo="pendencias"
        >
          <ul class="cotacao__pendencias">
            <li v-for="pendencia in pendencias" :key="pendencia">{{ pendencia }}</li>
          </ul>
        </v-alert>
      </template>
    </div>

    <footer v-if="aberta && !carregando" class="cotacao__barra">
      <div class="cotacao__barra-conteudo">
        <div class="cotacao__barra-total">
          <span>Total final</span>
          <strong data-campo="barra-total">{{ moeda(calculo.totalFinalCentavos) }}</strong>
          <small :class="{ 'cotacao__barra-pendente': pendenteDeSalvar }">{{ estadoDoRascunho }}</small>
        </div>
        <div class="cotacao__barra-acoes">
          <v-btn variant="text" :loading="salvando" :disabled="enviando" @click="salvar()">
            Salvar e continuar depois
          </v-btn>
          <v-btn color="primary" variant="flat" size="large" :disabled="salvando" @click="pedirEnvio">
            Enviar cotação
          </v-btn>
        </div>
      </div>
    </footer>

    <v-dialog v-model="confirmarEnvio" max-width="440" persistent>
      <v-card class="cotacao__confirmacao">
        <v-card-title>Enviar a cotação?</v-card-title>
        <v-card-text>
          <p>
            Total final de <strong>{{ moeda(calculo.totalFinalCentavos) }}</strong
            >.
          </p>
          <p>Depois de enviar, este link fecha e não será possível editar os valores.</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="enviando" @click="confirmarEnvio = false">Revisar</v-btn>
          <v-btn color="primary" variant="flat" :loading="enviando" @click="enviar">Enviar agora</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-main>
</template>

<style scoped>
.cotacao-pagina {
  min-height: 100vh;
  background: var(--cx-canvas, #f4f6fa);
}

.cotacao {
  display: grid;
  gap: var(--cx-sp-4, 16px);
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: var(--cx-sp-6, 24px) var(--cx-sp-4, 16px) 168px;
}

.cotacao__topo {
  display: grid;
  gap: var(--cx-sp-1, 4px);
  padding-bottom: var(--cx-sp-2, 8px);
}

.cotacao__selo {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-1, 4px);
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cx-brand-text, #35128c);
}

.cotacao__empresa {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--cx-ink, #1f2733);
}

.cotacao__para,
.cotacao__prazo,
.cotacao__instrucao {
  margin: 0;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao__prazo {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-1, 4px);
  justify-self: start;
  margin-top: var(--cx-sp-2, 8px);
  padding: var(--cx-sp-1, 4px) var(--cx-sp-3, 12px);
  border-radius: var(--cx-r-pill, 999px);
  background: var(--cx-brand-wash, rgba(101, 21, 221, 0.1));
  color: var(--cx-brand-text, #35128c);
  font-size: 0.875rem;
}

.cotacao__itens {
  display: grid;
  gap: var(--cx-sp-3, 12px);
}

.cotacao__estado {
  display: grid;
  justify-items: center;
  gap: var(--cx-sp-3, 12px);
  padding: var(--cx-sp-8, 48px) var(--cx-sp-4, 16px);
  border-radius: var(--cx-r-lg, 16px);
  background: var(--cx-surface, #fff);
  text-align: center;
}

.cotacao__estado h2 {
  font-size: 1.25rem;
  font-weight: 600;
}

.cotacao__estado p {
  max-width: 420px;
  margin: 0;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao__estado-nota {
  font-size: 0.8125rem;
}

.cotacao__pendencias {
  margin: 0;
  padding-left: var(--cx-sp-5, 20px);
}

.cotacao__barra {
  position: fixed;
  inset: auto 0 0;
  z-index: 5;
  border-top: 1px solid var(--cx-line, #e4e8ef);
  background: var(--cx-surface, #fff);
  box-shadow: var(--cx-e-2, 0 -4px 16px rgba(0, 0, 0, 0.06));
  padding-bottom: env(safe-area-inset-bottom);
}

.cotacao__barra-conteudo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3, 12px);
  max-width: 760px;
  margin: 0 auto;
  padding: var(--cx-sp-3, 12px) var(--cx-sp-4, 16px);
}

.cotacao__barra-total {
  display: grid;
  min-width: 0;
}

.cotacao__barra-total span {
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao__barra-total strong {
  font-size: 1.375rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.cotacao__barra-total small {
  font-size: 0.75rem;
  color: var(--cx-ink-soft, #5b6675);
}

.cotacao__barra-pendente {
  color: rgb(var(--v-theme-warning)) !important;
}

.cotacao__barra-acoes {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2, 8px);
}

/* No celular a barra vira duas faixas: total em cima, botoes de largura total embaixo. */
@media (max-width: 599px) {
  .cotacao__empresa {
    font-size: 1.375rem;
  }

  .cotacao {
    padding-bottom: 220px;
  }

  .cotacao__barra-conteudo {
    flex-direction: column;
    align-items: stretch;
  }

  .cotacao__barra-acoes {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
