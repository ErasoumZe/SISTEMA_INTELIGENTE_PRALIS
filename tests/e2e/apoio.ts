import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Apoio dos E2E de Produtos: login, dados de teste e as duas assercoes que se repetem
 * (console limpo e ausencia de rolagem horizontal).
 */

export const USUARIOS = {
  /** Enxerga e edita tudo — `usuario_admin` do seed de desenvolvimento. */
  admin: { email: "diretor@email.com", senha: "123456" },
  /** Opera caixa e mercadorias, mas NAO tem `cadastro_produtos_visualizar`. */
  semProdutos: { email: "caixa@email.com", senha: "123456" },
  /** Confere retornos e divergencias nas contas de destino do seed de desenvolvimento. */
  tesouraria: { email: "tesouraria@email.com", senha: "123456" }
} as const;

export async function encerrarCaixaDeTeste(
  caixa: APIRequestContext,
  empresaId: string,
  caixaId: string,
  prefixoLacre: string
) {
  const tesouraria = await request.newContext({ baseURL: process.env["E2E_API_URL"] ?? "http://localhost:4100" });
  try {
    const login = await tesouraria.post("/api/auth/sign-in/email", {
      data: { email: USUARIOS.tesouraria.email, password: USUARIOS.tesouraria.senha }
    });
    expect(login.status(), await login.text()).toBe(200);

    const lista = await tesouraria.get(
      `/api/transferencias?empresaId=${empresaId}&caixaId=${caixaId}&status=pendente&pageSize=100`
    );
    expect(lista.status(), await lista.text()).toBe(200);
    const itens = (await lista.json()) as {
      data: Array<{
        id: string;
        contaDestinoId: string;
        nLacreDoc: string | null;
        valorOriginal: string;
        ehCaixaParaCofre: boolean;
      }>;
    };
    for (const item of itens.data.filter(
      (linha) => linha.ehCaixaParaCofre && linha.nLacreDoc?.startsWith(prefixoLacre)
    )) {
      const conferencia = await tesouraria.post(`/api/transferencias/${item.id}/confirmar`, {
        data: {
          contaDestinoId: item.contaDestinoId,
          nLacreDoc: item.nLacreDoc,
          valorRecebido: Number(item.valorOriginal)
        }
      });
      expect(conferencia.status(), await conferencia.text()).toBe(200);
    }

    const fechamento = await caixa.post(`/api/caixa/${caixaId}/fechar`, {
      data: { observacao: "Limpeza automatica do teste E2E" }
    });
    expect(fechamento.status(), await fechamento.text()).toBe(204);
  } finally {
    await tesouraria.dispose();
  }
}

/** Larguras do Definition of Done (`16` §3) e do `67` §13.7. */
export const LARGURAS = [
  { nome: "desktop", largura: 1440, altura: 900 },
  { nome: "notebook", largura: 1024, altura: 768 },
  { nome: "tablet", largura: 768, altura: 900 },
  { nome: "celular", largura: 390, altura: 844 }
] as const;

/** Prefixo dos dados criados pelos testes — permite achar e limpar sem tocar no resto. */
export const PREFIXO = "E2E-AUTO";

export async function entrar(page: Page, usuario: { email: string; senha: string }) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "E-mail" }).fill(usuario.email);
  await page.getByRole("textbox", { name: "Senha" }).fill(usuario.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Teto generoso: no servidor de DESENVOLVIMENTO a primeira navegacao de cada rota ainda compila
  // sob demanda, e 30s estouram quando varios testes entram em sequencia.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
}

/**
 * Escolhe uma opcao num `v-select` do Vuetify.
 *
 * `getByRole("combobox").click()` NAO abre o menu: o `<input>` fica atras do `.v-field__input`, que
 * intercepta o ponteiro. Quem abre o menu e o clique no `.v-field`. Sem este apoio, todo teste que
 * toca um select vira um timeout de 60s que parece bug de tela e nao e.
 */
export async function escolherNoSelect(page: Page, rotulo: string | RegExp, opcao: string | RegExp) {
  const campo = page.locator(".v-input", { has: page.getByLabel(rotulo, { exact: false }) }).first();
  await campo.locator(".v-field").click();
  await page.locator(".v-overlay-container .v-list-item").filter({ hasText: opcao }).first().click();
  // O menu fecha com animacao; sem esperar, o proximo clique cai no overlay que ainda esta saindo.
  await expect(page.locator(".v-overlay-container .v-list-item")).toHaveCount(0);
}

/**
 * Escolhe a PRIMEIRA opcao de um select — util quando o valor em si nao importa (ex.: unidade).
 * `.first()` nos dois lados: o seletor pode casar varios campos da mesma secao, e sem isto o
 * Playwright para no strict mode em vez de escolher.
 */
export async function escolherPrimeiraOpcao(page: Page, seletorDoCampo: string) {
  await page.locator(`${seletorDoCampo} .v-field`).first().click();
  await page.locator(".v-overlay-container .v-list-item").first().click();
  await expect(page.locator(".v-overlay-container .v-list-item")).toHaveCount(0);
}

/** Mensagem de validacao exibida sob um campo marcado com `data-campo`. */
export function mensagemDoCampo(page: Page, campo: string) {
  return page.locator(`[data-campo="${campo}"] .v-messages__message`);
}

/**
 * Coleta erros e warnings do console. Chamado ANTES de navegar; o array cresce durante o teste.
 *
 * Ruido conhecido do ambiente de desenvolvimento fica de fora: o Nuxt DevTools e o Vite injetam
 * mensagens que nao dizem nada sobre a tela. Tudo o mais conta.
 */
export function observarConsole(page: Page): string[] {
  const problemas: string[] = [];
  const ignorar = [/Nuxt DevTools/i, /\[vite\]/i, /Download the Vue Devtools/i];
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const texto = msg.text();
    if (ignorar.some((padrao) => padrao.test(texto))) return;
    problemas.push(`${msg.type()}: ${texto}`);
  });
  page.on("pageerror", (erro) => problemas.push(`pageerror: ${erro.message}`));
  return problemas;
}

/**
 * A pagina nao pode rolar na horizontal em NENHUMA largura. E a regra 3 do Definition of Done, e a
 * que mais quebra em silencio: um filho de grid sem `min-width: 0` estoura e ninguem ve no desktop.
 */
export async function semRolagemHorizontal(page: Page) {
  const medida = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth
  }));
  expect(medida.scrollWidth, `rolagem horizontal em ${medida.clientWidth}px`).toBeLessThanOrEqual(medida.clientWidth);
  expect(medida.bodyScrollWidth).toBeLessThanOrEqual(medida.bodyClientWidth);
}

/** Espera a listagem terminar de carregar (o total no cabecalho e a ultima coisa a estabilizar). */
export async function esperarListagem(page: Page) {
  await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
  await expect(page.locator(".produtos-tela__cabecalho p")).toContainText("produto(s)");
}

/** Quantos produtos a API diz existir no recorte atual — lido do proprio cabecalho da tela. */
export async function totalDaListagem(page: Page): Promise<number> {
  const texto = (await page.locator(".produtos-tela__cabecalho p").textContent()) ?? "";
  return Number.parseInt(texto.replace(/\D/g, ""), 10);
}
