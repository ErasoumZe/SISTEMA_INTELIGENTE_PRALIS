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

/** Primeira unidade e o grupo de mercadoria da loja (o pedido pelo nome, ou o primeiro do seed). */
async function referenciasDaLoja({ api, empresaId }: ContextoCompras, grupoNome?: string) {
  const unidades = await api.get(`/api/unidades_medida?empresaId=${empresaId}&pageSize=1`);
  expect(unidades.status(), await unidades.text()).toBe(200);
  // Rotas antigas devolvem o corpo cru; as novas, embrulhado em `data`: aceita os dois.
  const corpoUnidades = (await unidades.json()) as { data?: Array<{ id: string }> } | Array<{ id: string }>;
  const unidadeId = (Array.isArray(corpoUnidades) ? corpoUnidades : (corpoUnidades.data ?? []))[0]?.id;
  expect(unidadeId, "nenhuma unidade de medida no seed").toBeTruthy();
  // Produto novo exige grupo de mercadoria (regra do app oficial, R-222).
  const grupos = await api.get(`/api/grupos?empresaId=${empresaId}&pageSize=100`);
  expect(grupos.status(), await grupos.text()).toBe(200);
  type ListaDeGrupos = { gruposMercadorias: Array<{ id: string; nome: string }> };
  const corpoGrupos = (await grupos.json()) as ListaDeGrupos & { data?: ListaDeGrupos };
  const lista = (corpoGrupos.data ?? corpoGrupos).gruposMercadorias;
  const grupoId = (grupoNome ? lista.find((grupo) => grupo.nome === grupoNome) : lista[0])?.id;
  expect(grupoId, "nenhum grupo de mercadoria no seed").toBeTruthy();
  return { unidadeId: unidadeId!, grupoId: grupoId! };
}

/**
 * Produto de LOJA pelo caminho do app oficial (R-222): o administrador cria na BASE e a loja importa
 * a copia. `daLoja` completa o que so existe na loja (area, curva...) com um PUT na copia.
 */
export async function criarProdutoPelaBase(
  dados: { descricao: string; grupoNome?: string; [campo: string]: unknown },
  daLoja: Record<string, unknown> = {},
  /** Loja que recebe a copia; sem ela, a loja ativa do administrador. */
  lojaId?: string
): Promise<{ baseId: string; produtoId: string }> {
  const admin = await abrirContextoCompras(USUARIOS.admin);
  try {
    const { api } = admin;
    const empresaId = lojaId ?? admin.empresaId;
    const { grupoNome, ...campos } = dados;
    const { unidadeId, grupoId } = await referenciasDaLoja({ api, empresaId }, grupoNome);
    const payload = {
      empresaId,
      grupoMercadoriaId: grupoId,
      unidadeIndividualId: unidadeId,
      quantidadeIndividual: 1,
      nomeCatalogo: campos.descricao,
      ...campos
    };
    const base = await api.post("/api/produtos/base", { data: payload });
    expect(base.status(), await base.text()).toBe(201);
    const baseId = ((await base.json()) as { data: { id: string } }).data.id;

    const importacao = await api.post(`/api/produtos/catalogo-base/${baseId}/importar`, { data: { empresaId } });
    expect(importacao.status(), await importacao.text()).toBe(200);
    const copia = ((await importacao.json()) as { data: { estado: string; produtoId?: string } }).data;
    expect(copia.estado, JSON.stringify(copia)).toBe("importado");
    const produtoId = copia.produtoId!;

    if (Object.keys(daLoja).length) {
      // A tela devolve o produto inteiro: os codigos voltam como vieram, o resto e o que a loja completa.
      const detalhe = await api.get(`/api/produtos/${produtoId}`);
      const { codigo, codigoBarras } = ((await detalhe.json()) as { data: { codigo: string; codigoBarras: string } })
        .data;
      const loja = await api.put(`/api/produtos/${produtoId}`, {
        data: { ...payload, codigo, codigoBarras, ...daLoja }
      });
      expect(loja.status(), await loja.text()).toBe(204);
    }
    return { baseId, produtoId };
  } finally {
    await admin.api.dispose();
  }
}

export async function criarProdutoDeEstoque(contexto: ContextoCompras, produto: ProdutoDeEstoque): Promise<string> {
  const { produtoId } = await criarProdutoPelaBase(
    {
      descricao: produto.descricao,
      estoqueMin: produto.estoqueMin,
      estoqueMax: produto.estoqueMax,
      setorEstoque: produto.setorEstoque
    },
    { areaEstoque: produto.areaEstoque ?? null, curvaAbc: produto.curvaAbc ?? null },
    contexto.empresaId
  );
  return produtoId;
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
  const produto = `E2E Rodada com nome longo para quebrar linha ${sufixo}`;
  const produtoId = await criarProdutoDeEstoque(contexto, {
    descricao: produto,
    estoqueMin: 1,
    estoqueMax: 50,
    setorEstoque: `Deposito ${sufixo}`
  });
  const fornecedorId = await criarFornecedor(contexto, `E2E Rodada ${sufixo}`, "11977776666");
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
