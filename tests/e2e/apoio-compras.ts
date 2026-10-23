import { expect, request, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { USUARIOS } from "./apoio.js";

/**
 * Apoio dos E2E do modulo Compras.
 *
 * O pre-requisito (fornecedor e produto parametrizado) e criado por API, nao por tela: o que esta
 * sob prova aqui e o CICLO do pedido no navegador, e cada produto criado pela tela custa ~40s de
 * formulario. A persistencia do cadastro ja tem spec proprio em `compras-produto-estoque`.
 */

const API_URL = process.env["E2E_API_URL"] ?? "http://127.0.0.1:4100";

export type ContextoCompras = {
  api: APIRequestContext;
  empresaId: string;
};

/** Abre um contexto de API autenticado e descobre a empresa ativa do perfil. */
export async function abrirContextoCompras(
  usuario: { email: string; senha: string } = USUARIOS.compras
): Promise<ContextoCompras> {
  const api = await request.newContext({ baseURL: API_URL });
  const login = await api.post("/api/auth/sign-in/email", {
    data: { email: usuario.email, password: usuario.senha }
  });
  expect(login.status(), await login.text()).toBe(200);

  const me = await api.get("/api/me");
  expect(me.status(), await me.text()).toBe(200);
  const sessao = (await me.json()) as {
    data: { perfil?: { empresaId?: string; empresaIds?: string[] }; empresas?: Array<{ id: string }> };
  };
  const empresaId =
    sessao.data.perfil?.empresaId ?? sessao.data.perfil?.empresaIds?.[0] ?? sessao.data.empresas?.[0]?.id;
  expect(empresaId, "perfil sem empresa").toBeTruthy();
  return { api, empresaId: empresaId! };
}

export async function criarFornecedor(
  { api, empresaId }: ContextoCompras,
  nome: string,
  whatsapp: string
): Promise<string> {
  const resposta = await api.post("/api/fornecedores", { data: { empresaId, nome, whatsapp } });
  expect(resposta.status(), await resposta.text()).toBe(201);
  return ((await resposta.json()) as { data: { id: string } }).data.id;
}

export type ProdutoDeEstoque = {
  descricao: string;
  estoqueMin: number;
  estoqueMax: number;
  setorEstoque: string;
  areaEstoque?: string;
  curvaAbc?: "A" | "B" | "C";
};

export async function criarProdutoDeEstoque(contexto: ContextoCompras, produto: ProdutoDeEstoque): Promise<string> {
  const { api, empresaId } = contexto;
  const unidades = await api.get(`/api/unidades_medida?empresaId=${empresaId}&pageSize=1`);
  expect(unidades.status(), await unidades.text()).toBe(200);
  const unidadeId = ((await unidades.json()) as { data: Array<{ id: string }> }).data[0]?.id;
  expect(unidadeId, "nenhuma unidade de medida no seed").toBeTruthy();

  const resposta = await api.post("/api/produtos", {
    data: {
      empresaId,
      descricao: produto.descricao,
      unidadeIndividualId: unidadeId,
      quantidadeIndividual: 1,
      estoqueMin: produto.estoqueMin,
      estoqueMax: produto.estoqueMax,
      setorEstoque: produto.setorEstoque,
      areaEstoque: produto.areaEstoque ?? null,
      curvaAbc: produto.curvaAbc ?? null
    }
  });
  expect(resposta.status(), await resposta.text()).toBe(201);
  return ((await resposta.json()) as { data: { id: string } }).data.id;
}

/** Saldo que a propria tela de Estoque le — a unica fonte que conta para a prova. */
export async function saldoDoProduto({ api, empresaId }: ContextoCompras, produtoId: string): Promise<number> {
  const resposta = await api.get(`/api/compras/estoque?empresaId=${empresaId}`);
  expect(resposta.status(), await resposta.text()).toBe(200);
  const linhas = ((await resposta.json()) as { data: Array<{ id: string; quantidadeEstoque: string }> }).data;
  const linha = linhas.find((produto) => produto.id === produtoId);
  expect(linha, "produto ausente na leitura de estoque").toBeTruthy();
  return Number(linha!.quantidadeEstoque);
}

/** Acha o pedido daquele fornecedor — os nomes dos testes carregam sufixo unico, entao e so um. */
export async function idDoPedidoPorFornecedor(
  { api, empresaId }: ContextoCompras,
  fornecedorNome: string
): Promise<string> {
  const resposta = await api.get(`/api/pedidos?empresaId=${empresaId}`);
  expect(resposta.status(), await resposta.text()).toBe(200);
  const pedidos = ((await resposta.json()) as { data: Array<{ id: string; fornecedorNome: string | null }> }).data;
  const pedido = pedidos.find((linha) => linha.fornecedorNome === fornecedorNome);
  expect(pedido, `nenhum pedido para ${fornecedorNome}`).toBeTruthy();
  return pedido!.id;
}

export async function itensPendentes(
  { api }: ContextoCompras,
  pedidoId: string
): Promise<Array<{ id: string; quantidadePendente: number }>> {
  const resposta = await api.get(`/api/pedidos/${pedidoId}`);
  expect(resposta.status(), await resposta.text()).toBe(200);
  const itens = ((await resposta.json()) as { data: { itens?: Array<{ id: string; quantidadePendente: string }> } })
    .data.itens;
  return (itens ?? [])
    .map((item) => ({ id: item.id, quantidadePendente: Number(item.quantidadePendente) }))
    .filter((item) => item.quantidadePendente > 0);
}

export async function situacaoDoPedido({ api }: ContextoCompras, pedidoId: string): Promise<string> {
  const resposta = await api.get(`/api/pedidos/${pedidoId}`);
  expect(resposta.status(), await resposta.text()).toBe(200);
  return ((await resposta.json()) as { data: { status: string } }).data.status;
}

/**
 * Escolhe uma opcao de `v-select` DENTRO de uma raiz (dialogo, cartao).
 *
 * O apoio global usa `.first()` na pagina inteira e, na tela de Pedidos, "Fornecedor" existe duas
 * vezes: no cartao de sugestao e no dialogo do pedido manual. Sem escopo, o teste preenche o campo
 * errado e falha dizendo que o pedido nao salvou.
 */
export async function escolherNoSelectDe(raiz: Locator, page: Page, rotulo: string | RegExp, opcao: string | RegExp) {
  const campo = raiz.locator(".v-input", { has: page.getByLabel(rotulo, { exact: false }) }).first();
  await campo.locator(".v-field").click();
  await page.locator(".v-overlay-container .v-list-item").filter({ hasText: opcao }).first().click();
  await expect(page.locator(".v-overlay-container .v-list-item")).toHaveCount(0);
}

/** Preenche o autocomplete de produto do item do pedido (digita e escolhe na lista). */
export async function escolherProduto(raiz: Locator, page: Page, descricao: string) {
  const campo = raiz.locator(".v-input", { has: page.getByLabel("Produto", { exact: false }) }).first();
  await campo.locator("input").first().fill(descricao);
  await page.locator(".v-overlay-container .v-list-item").filter({ hasText: descricao }).first().click();
  await expect(page.locator(".v-overlay-container .v-list-item")).toHaveCount(0);
}

/**
 * Espera o overlay do Vuetify sair de cena por completo.
 *
 * Nao basta a lista sumir: o `.v-overlay__scrim` continua no DOM durante a animacao de saida e
 * INTERCEPTA o proximo clique. O sintoma e cruel: o Playwright repete o clique ate o timeout e o
 * relatorio acusa "botao nao clicavel", como se a tela estivesse quebrada.
 *
 * Use SO depois de fechar um dialogo, nunca dentro de um. Um modal aberto tem scrim por direito, e
 * esperar zero aqui dentro trava para sempre.
 */
export async function esperarOverlayFechar(page: Page) {
  await expect(page.locator(".v-overlay-container .v-overlay__scrim")).toHaveCount(0);
}

/**
 * Escolhe uma opcao num `v-select` de filtro pelo rotulo EXATO.
 *
 * `getByLabel(..., { exact: false })` casa por substring e sem diferenciar maiusculas: procurar
 * "Grupo" na tela de Estoque tambem casa "Buscar produto ou grupo", e o `.first()` clicava no campo
 * de busca. O menu nunca abria e o teste acusava filtro quebrado que nao estava quebrado.
 */
export async function escolherNoFiltro(page: Page, rotulo: string, opcao: string | RegExp) {
  const campo = page.locator(".v-input", { has: page.getByLabel(rotulo, { exact: true }) }).first();
  await campo.locator(".v-field").click();
  await page.locator(".v-overlay-container .v-list-item").filter({ hasText: opcao }).first().click();
  await expect(page.locator(".v-overlay-container .v-list-item")).toHaveCount(0);
}

/**
 * Campo de texto pelo rotulo, sem colidir com o botao "limpar" do Vuetify.
 *
 * Um `v-text-field` com `clearable` expoe DOIS elementos com o mesmo rotulo: o `input` e o icone
 * "Clear <rotulo>". `getByLabel` pega os dois e o modo estrito do Playwright falha.
 */
export function campoDeTexto(page: Page, rotulo: string): Locator {
  return page.getByRole("textbox", { name: rotulo, exact: true });
}

/**
 * Navega para uma tela e espera o titulo aparecer.
 *
 * O teto e generoso de proposito: no servidor de DESENVOLVIMENTO a PRIMEIRA visita a cada rota
 * ainda compila sob demanda e passa dos 15s padrao do `expect`. Sem isto, a suite acusa "tela nao
 * renderiza" quando o problema e so o primeiro build da rota.
 */
export async function irParaTela(page: Page, rota: string, titulo: string, timeout = 120_000) {
  await page.goto(rota);
  await expect(page.getByRole("heading", { name: titulo, exact: true })).toBeVisible({ timeout });
}

/**
 * Codigo curto e unico da execucao. Os testes criam produtos e fornecedores com nome de verdade ("Abacaxi perola",
 * "Hortifruti Bahamas") e o codigo entre parenteses, para a tela continuar legivel no banco de dev e cada teste
 * achar a sua linha.
 */
export function codigoDeTeste(): string {
  const tempo = Date.now().toString(36).slice(-4);
  const sorte = Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, "0");
  return `${tempo}${sorte}`;
}

/** O dialogo Vuetify que esta aberto agora. */
export function dialogoAberto(page: Page): Locator {
  return page.locator(".v-dialog.v-overlay--active").last();
}

/**
 * R-221: prepara uma rodada pronta para o fornecedor abrir — produto, fornecedor, solicitacao e link.
 * Devolve o token cru, que so existe neste momento: o banco guarda apenas o hash.
 */
export async function prepararRodada(
  contexto: ContextoCompras,
  sufixo: string,
  quantidade = 4.5
): Promise<{ solicitacaoId: string; rodadaId: string; token: string; produto: string; produtoId: string }> {
  const produto = `Bolo de laranja com cobertura de chocolate, forma grande (teste ${sufixo})`;
  const produtoId = await criarProdutoDeEstoque(contexto, {
    descricao: produto,
    estoqueMin: 1,
    estoqueMax: 50,
    setorEstoque: `Deposito ${sufixo}`
  });
  const fornecedorId = await criarFornecedor(contexto, `Bauducco (teste ${sufixo})`, "11977776666");
  const solicitacao = await contexto.api.post("/api/compras/solicitacoes", {
    data: { empresaId: contexto.empresaId, itens: [{ produtoId, quantidade }] }
  });
  expect(solicitacao.status(), await solicitacao.text()).toBe(201);
  const solicitacaoId = ((await solicitacao.json()) as { data: { id: string } }).data.id;
  const detalhe = await contexto.api.get(`/api/compras/solicitacoes/${solicitacaoId}`);
  const itens = ((await detalhe.json()) as { data: { itens: Array<{ id: string }> } }).data.itens;
  const rodada = await contexto.api.post("/api/compras/rodadas", {
    data: {
      empresaId: contexto.empresaId,
      solicitacaoId,
      convites: [{ fornecedorId, solicitacaoItemIds: itens.map((item) => item.id) }]
    }
  });
  expect(rodada.status(), await rodada.text()).toBe(201);
  const corpo = ((await rodada.json()) as { data: { id: string; convites: Array<{ token: string }> } }).data;
  return { solicitacaoId, rodadaId: corpo.id, token: corpo.convites[0]!.token, produto, produtoId };
}

/**
 * Acha uma linha da tabela de cadastro, virando a pagina quando preciso.
 *
 * A listagem pagina em 10 e ordena por nome. Um cadastro novo raramente cai na primeira pagina
 * depois de algumas rodadas de E2E, e esperar mais tempo nao resolve: a linha nao esta ali. Virar a
 * pagina e exatamente o que a pessoa faria.
 */
export async function acharLinhaPaginando(page: Page, texto: string, maximoDePaginas = 30): Promise<Locator> {
  const linha = page.locator("tbody tr").filter({ hasText: texto });
  const proxima = page.getByRole("button", { name: "Próxima" });
  // Teto alto na primeira espera: depois de um reload a rota remonta e a listagem so chega depois
  // da sessao; com o servidor de desenvolvimento frio isso passa dos 15s padrao do expect.
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
  for (let pagina = 1; pagina <= maximoDePaginas; pagina += 1) {
    if (await linha.count()) return linha;
    if (await proxima.isDisabled()) break;
    await proxima.click();
    await expect(proxima)
      .toBeEnabled({ timeout: 15_000 })
      .catch(() => undefined);
  }
  await expect(linha, `"${texto}" nao foi encontrado em nenhuma pagina`).toBeVisible();
  return linha;
}
