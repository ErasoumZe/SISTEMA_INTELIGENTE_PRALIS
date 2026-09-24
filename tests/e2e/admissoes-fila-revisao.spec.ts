import { expect, test } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import { processoComFichaEnviada } from "./apoio-admissoes.js";

/**
 * ADM-003 V6 — a fila de revisao do DP, vista do NAVEGADOR.
 *
 * A integracao ja prova que o servidor filtra e conta certo. O que so o navegador prova: que o
 * atalho realmente recorta a tabela, que o sinal aparece na linha da pessoa, que a tabela NAO ganhou
 * uma acao de decidir, e que o botao de abrir continua alcancavel num celular.
 *
 * Banco ISOLADO, dados sinteticos, criados por API a cada rodada.
 */

const FILTRO = "Aguardando revisão";
/**
 * A linha do resultado da PROPRIA listagem.
 *
 * `[role="status"]` sozinho e ambiguo: o sino de notificacoes do cabecalho tambem e uma regiao viva,
 * e o seletor casaria os dois.
 */
const RESULTADO = "p.resultado";

/**
 * A fila e ordenada pela ESPERA — quem enviou primeiro aparece primeiro. Logo o processo recem-criado
 * por um teste vai para o FIM, e com a lista paginada de dez em dez ele nem sempre esta na primeira
 * pagina. Por isso as assercoes abaixo falam da PRIMEIRA linha do recorte, e nao do processo que o
 * teste acabou de criar: quem prova identidade linha a linha e a suite de integracao, que enxerga a
 * pagina inteira. Aqui o que se prova e o comportamento da tela.
 */

test.describe("a fila do DP", () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, USUARIOS.dp);
  });

  test("o atalho recorta a lista e a contagem acompanha", async ({ page }) => {
    const problemas = observarConsole(page);
    // Duas fichas enviadas: garante que a fila nao esta vazia por acaso.
    const enviada = await processoComFichaEnviada(page, "FilaUm", 11);
    await processoComFichaEnviada(page, "FilaDois", 12);

    await page.goto("/admissoes_processos");
    const resultado = page.locator(RESULTADO);
    await expect(resultado).toContainText("Mostrando");
    const semRecorte = (await resultado.textContent()) ?? "";

    // O atalho e um interruptor, e se anuncia como tal.
    const atalho = page.getByRole("button", { name: FILTRO });
    await expect(atalho).toHaveAttribute("aria-pressed", "false");
    await atalho.click();
    await expect(atalho).toHaveAttribute("aria-pressed", "true");

    // Toda linha visivel esta aguardando decisao — o recorte veio do servidor, nao da tela.
    const linhas = page.locator("tbody tr");
    await expect(linhas.first()).toBeVisible();
    const quantas = await linhas.count();
    for (let indice = 0; indice < quantas; indice += 1) {
      await expect(linhas.nth(indice)).toContainText("Enviada — aguardando revisão");
    }
    // A contagem mudou junto: pagina certa com total velho seria a paginacao mentindo. O total do
    // recorte e sempre menor que o da lista inteira, porque ha processo sem ficha enviada no banco.
    await expect(resultado).not.toHaveText(semRecorte);
    const totalRecortado = Number(/de (\d+)/u.exec((await resultado.textContent()) ?? "")?.[1] ?? "0");
    const totalGeral = Number(/de (\d+)/u.exec(semRecorte)?.[1] ?? "0");
    expect(totalRecortado, "o recorte precisa ser menor que a lista inteira").toBeLessThan(totalGeral);
    expect(totalRecortado, "a fila nao pode estar vazia: dois processos foram enviados").toBeGreaterThanOrEqual(2);
    expect(quantas).toBeLessThanOrEqual(totalRecortado);
    void enviada;

    // Clicar de novo desliga o mesmo filtro — nao ha um segundo parametro para desfazer.
    await atalho.click();
    await expect(atalho).toHaveAttribute("aria-pressed", "false");
    await expect(resultado).toHaveText(semRecorte);
    expect(problemas).toEqual([]);
  });

  test("o sinal aparece na linha, e a tabela nao decide nada", async ({ page }) => {
    // Garante que ha ao menos uma ficha esperando; a assercao e sobre a primeira do recorte.
    await processoComFichaEnviada(page, "FilaTres", 13);
    await page.goto("/admissoes_processos");
    await page.getByRole("button", { name: FILTRO }).click();

    const linha = page.locator("tbody tr").first();
    await expect(linha).toBeVisible();
    // Texto E icone: a cor nunca e o unico sinal.
    await expect(linha.locator(".ficha-sinal")).toContainText("Enviada — aguardando revisão");
    await expect(linha.locator(".ficha-sinal .v-icon")).toBeVisible();

    // UMA acao por linha, e ela abre o processo. Decidir continua sendo na tela da ficha.
    const botoes = linha.getByRole("button");
    await expect(botoes).toHaveCount(1);
    await expect(botoes.first()).toHaveText("Abrir");
    await expect(linha.getByRole("button", { name: /Aprovar|Devolver|Revisar/ })).toHaveCount(0);
    await expect(linha.getByRole("link")).toHaveCount(0);

    // E a porta continua sendo o modal — o caminho nao mudou por causa da fila.
    await botoes.first().click();
    const modal = page.locator(".v-dialog.v-overlay--active");
    await expect(modal.getByRole("button", { name: "Abrir ficha do candidato" })).toBeVisible();
  });

  test("a fila cabe nas quatro larguras e o botao de abrir continua alcancavel", async ({ page }) => {
    await processoComFichaEnviada(page, "FilaQuatro", 14);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura.largura, height: largura.altura });
      await page.goto("/admissoes_processos");
      await page.getByRole("button", { name: FILTRO }).click();

      const linha = page.locator("tbody tr").first();
      await expect(linha, largura.nome).toBeVisible();
      await semRolagemHorizontal(page);

      // O botao de abrir tem de ser ALCANCAVEL em qualquer largura — rolando a tabela, que e o
      // gesto previsto, e nunca rolando a pagina, que a assercao acima ja proibiu.
      //
      // Nao se afirma aqui que ele fica GRUDADO na direita. A regra `position: sticky` da casca da
      // casa nao surte efeito dentro do `.v-table__wrapper` do Vuetify, que abre um scrollport
      // proprio entre a celula e o container que rola. Isso vale para todas as tabelas com esta
      // casca e e anterior a esta entrega; esta registrado no `39` como achado, e nao foi corrigido
      // aqui porque a correcao mexe em CSS global de todas as telas.
      const abrir = linha.getByRole("button", { name: /^Abrir/ });
      await abrir.scrollIntoViewIfNeeded();
      const caixa = await abrir.boundingBox();
      expect(caixa, `${largura.nome}: botao sem caixa`).not.toBeNull();
      expect(caixa?.x ?? -1, `${largura.nome}: botao antes da borda`).toBeGreaterThanOrEqual(0);
      expect((caixa?.x ?? 0) + (caixa?.width ?? 0), `${largura.nome}: botao fora da tela`).toBeLessThanOrEqual(
        largura.largura
      );
      // E clicavel de verdade: alcancavel nao pode ser so "existe no DOM".
      await expect(abrir).toBeEnabled();
    }
  });
});

test.describe("a fila respeita a matriz de permissoes", () => {
  test("a Gerencia ve o recorte, e continua sem porta para a ficha", async ({ page }) => {
    // A situacao da ficha e andamento do processo, e a Gerencia ja enxerga o andamento do exame na
    // mesma lista. O que ela nao pode e ABRIR a ficha — e isso nao mudou.
    await entrar(page, USUARIOS.gerencia);
    await page.goto("/admissoes_processos");
    await expect(page.getByRole("heading", { name: "Processos de admissão" })).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();

    await page.getByRole("button", { name: FILTRO }).click();
    const linha = page.locator("tbody tr").first();
    await expect(linha).toContainText("Enviada — aguardando revisão");

    await linha.getByRole("button", { name: /^Abrir/ }).click();
    const modal = page.locator(".v-dialog.v-overlay--active");
    await expect(modal).toContainText("Processo de admissão");
    await expect(modal.getByRole("button", { name: "Abrir ficha do candidato" })).toHaveCount(0);
  });
});
