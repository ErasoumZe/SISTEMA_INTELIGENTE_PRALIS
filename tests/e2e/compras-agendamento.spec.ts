import { expect, test, type Locator, type Page } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import {
  abrirContextoCompras,
  criarProdutoDeEstoque,
  dialogoAberto,
  esperarOverlayFechar,
  irParaTela,
  type ContextoCompras
} from "./apoio-compras.js";

/**
 * Agendamento de pedido (PROJECT_BRAIN/56), no navegador: marcar produto na lista, montar a repetição
 * personalizada (segunda e quinta, como "bebidas duas vezes por semana"), o prazo do fornecedor, salvar, ver
 * as próximas datas, excluir só uma data e excluir todas as futuras. E as 4 larguras sem rolagem lateral.
 * O envio automático na data é coberto pela integração (o agendador roda no tempo do servidor).
 */
async function escolherNoSelect(page: Page, raiz: Locator, rotulo: string, opcao?: string | RegExp) {
  await raiz
    .locator(".v-input", { has: page.getByLabel(rotulo, { exact: true }) })
    .first()
    .locator(".v-field")
    .click();
  const itens = page.locator(".v-overlay-container .v-list-item");
  await (opcao ? itens.filter({ hasText: opcao }).first() : itens.first()).click();
  await expect(itens).toHaveCount(0);
}

test.describe("agendamento de pedido", () => {
  test.setTimeout(240_000);
  let contexto: ContextoCompras;

  test.beforeAll(async () => {
    contexto = await abrirContextoCompras();
  });
  test.afterAll(async () => {
    await contexto.api.dispose();
  });

  test("agenda bebidas duas vezes por semana e mexe so numa data", async ({ page }) => {
    const problemas = observarConsole(page);
    const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const produto = `E2E Agenda ${sufixo}`;
    await criarProdutoDeEstoque(contexto, {
      descricao: produto,
      estoqueMin: 2,
      estoqueMax: 20,
      setorEstoque: `Geladeira ${sufixo}`
    });

    await entrar(page, USUARIOS.compras);
    await irParaTela(page, "/agendamento_pedidos", "Agendamento de pedidos");

    // 1) Marca o produto na lista (filtrando pelo nome) e define a quantidade padrao.
    await page.getByRole("textbox", { name: "Buscar produto" }).fill(sufixo);
    await page.getByRole("checkbox", { name: `Marcar ${produto}` }).check();
    await page.getByRole("spinbutton", { name: `Quantidade padrão de ${produto}` }).fill("6");
    const card = page.locator('[data-secao="card-agendamento"]');
    await expect(card.locator('[data-campo="produtos-marcados"]')).toContainText("1 produto(s)");

    // 2) Grupo, repeticao personalizada (segunda e quinta) e o prazo do fornecedor.
    await escolherNoSelect(page, card, "Grupo *");
    await escolherNoSelect(page, card, "Repetir", "Personalizado");
    const editor = dialogoAberto(page);
    await expect(editor.getByText("Repetição personalizada")).toBeVisible();
    for (const [dia, quero] of [
      ["domingo", false],
      ["segunda", true],
      ["terça", false],
      ["quarta", false],
      ["quinta", true],
      ["sexta", false],
      ["sábado", false]
    ] as const) {
      const botao = editor.getByRole("button", { name: dia, exact: true });
      if ((await botao.getAttribute("aria-pressed")) !== String(quero)) await botao.click();
    }
    await expect(editor.locator('[data-campo="resumo-personalizado"]')).toHaveText(
      "Toda semana na(s) segunda e quinta"
    );
    await semRolagemHorizontal(page);
    await editor.getByRole("button", { name: "Pronto" }).click();
    await esperarOverlayFechar(page);
    await expect(card.locator('[data-campo="resumo-recorrencia"]')).toHaveText("Toda semana na(s) segunda e quinta");
    await card.getByRole("group", { name: "Atalhos do tempo de resposta" }).getByText("12 horas").click();
    await expect(card.getByRole("spinbutton", { name: "Tempo de resposta da cotação (horas)" })).toHaveValue("12");
    // Doc 57 §6.3: a variação aceita na quantidade (padrão 10%).
    const margem = card.getByRole("radiogroup", { name: "Variação aceita na quantidade" });
    await margem.getByRole("radio", { name: "20%" }).click();
    await expect(margem.getByRole("radio", { name: "20%" })).toHaveAttribute("aria-checked", "true");
    // Doc 58 §1 e §8: quem executa o pedido na data e o horario em que a loja recebe.
    await card.getByRole("button", { name: "Salvar" }).click();
    await expect(card).toContainText("Escolha o responsável por executar o pedido.");
    await escolherNoSelect(page, card, "Responsável por executar *");
    const horario = card.locator('[data-campo="horario-recebimento"]');
    await horario.getByLabel("Das").fill("07:00");
    await horario.getByLabel("Até").fill("11:00");

    // 3) Salva: aparece na lista com o resumo e as proximas 6 datas. O agendamento novo e o id que nao
    // existia antes (o banco de desenvolvimento guarda os de execucoes anteriores).
    const antes = await page
      .locator("[data-agenda]")
      .evaluateAll((itens) => itens.map((item) => item.getAttribute("data-agenda")));
    await card.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText("Pedido agendado.");
    await expect(page.locator("[data-agenda]")).toHaveCount(antes.length + 1);
    const novoId = (
      await page.locator("[data-agenda]").evaluateAll((itens) => itens.map((item) => item.getAttribute("data-agenda")))
    ).find((id) => !antes.includes(id));
    const agenda = page.locator(`[data-agenda="${novoId}"]`);
    await expect(agenda).toContainText("Toda semana na(s) segunda e quinta");
    await expect(agenda).toContainText("resposta em 12 h");
    await expect(agenda).toContainText("variação 20%");
    await expect(agenda.locator(".v-chip")).toHaveCount(6);

    // 4) Excluir so esta: a primeira data fica riscada; as outras continuam.
    await agenda.locator(".v-chip").first().click();
    await page.getByRole("listitem").filter({ hasText: "Excluir só esta data" }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText("Data excluída.");
    await expect(agenda.locator(".v-chip").first()).toHaveClass(/text-decoration-line-through/u);

    // 5) Responsivo, com a tela e com o editor de repeticao aberto.
    for (const { nome, largura, altura } of LARGURAS) {
      await page.setViewportSize({ width: largura, height: altura });
      await semRolagemHorizontal(page);
      await escolherNoSelect(page, card, "Repetir", "Personalizado");
      await expect(dialogoAberto(page).getByText("Repetição personalizada"), nome).toBeVisible();
      await semRolagemHorizontal(page);
      await dialogoAberto(page).getByRole("button", { name: "Cancelar" }).click();
      await esperarOverlayFechar(page);
    }

    // 6) Excluir todas as futuras encerra o agendamento.
    await agenda.getByRole("button", { name: "Excluir todas as futuras" }).click();
    await dialogoAberto(page).getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.locator(".v-snackbar__content")).toContainText("Agendamento encerrado.");
    await expect(agenda).toHaveCount(0);

    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
