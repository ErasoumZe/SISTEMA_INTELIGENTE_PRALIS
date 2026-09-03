import { expect, request, test, type Page } from "@playwright/test";
import { entrar, LARGURAS, observarConsole, semRolagemHorizontal, USUARIOS } from "./apoio.js";
import { API, CABECALHO, dadosJson, enviarFicha, processoComFichaEnviada } from "./apoio-admissoes.js";

/**
 * ADM-003 V5 — a revisao da ficha do candidato pelo DP, vista do NAVEGADOR.
 *
 * Roda contra a stack de desenvolvimento ja de pe, num banco ISOLADO e com dados sinteticos — nunca
 * contra producao. Cada teste cria o proprio processo por API: o CPF do processo e unico por
 * empresa, entao reaproveitar um processo semeado faria a segunda rodada levar 409.
 *
 * O que a integracao nao prova e que esta suite prova: que o modal leva para a tela (e so ele), que
 * a tela mostra quem foi declarado SEM nenhum digito de CPF no DOM, que aprovar e devolver mudam o
 * que o DP ve, e que nada disso rola na horizontal em 390px.
 */

/** Abre o modal do processo pela listagem e, dele, a tela de revisao. E a UNICA porta. */
async function abrirRevisaoPeloModal(page: Page, nome: string, processoId: string) {
  await page.goto("/admissoes_processos");
  await page.locator("tr").filter({ hasText: nome }).first().getByRole("button", { name: "Abrir" }).click();
  const modal = page.locator(".v-dialog.v-overlay--active");
  await expect(modal.getByRole("heading", { name: "Ficha do candidato" })).toBeVisible();
  // O modal nao carrega a ficha: nenhum campo dela, nenhum dependente, nenhuma decisao.
  await expect(modal.getByRole("button", { name: /Aprovar/ })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: /Devolver/ })).toHaveCount(0);
  await modal.getByRole("button", { name: "Abrir ficha do candidato" }).click();
  await page.waitForURL(`**/admissoes_processos/${processoId}/ficha`);
  await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
}

test.describe("DP revisa a ficha", () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, USUARIOS.dp);
  });

  test("o modal leva para a tela propria, que mostra ficha, aviso, declaracao e dependentes sem CPF", async ({
    page
  }) => {
    const problemas = observarConsole(page);
    const { processoId, nome, cpfDoDependente } = await processoComFichaEnviada(page, "Alfa", 1);

    await abrirRevisaoPeloModal(page, nome, processoId);

    await expect(page.getByText("Enviada — aguardando revisão")).toBeVisible();
    await expect(page.getByText(/Aceito em .* versão AVISO-TESTE-ADMISSAO-V1/)).toBeVisible();
    await expect(page.getByText("Declarou que tem dependentes")).toBeVisible();

    // Os campos que o candidato preencheu, em leitura.
    await expect(page.locator('[data-campo="nomeMae"]')).toHaveText("Mae Sintetica");
    await expect(page.locator('[data-campo="cep"]')).toHaveText("01001-000");
    await expect(page.locator('[data-campo="nascimento"]')).toHaveText("10/04/1995");
    await expect(page.locator('[data-campo="nomePai"]')).toHaveText("Não informado");

    // Os dois dependentes, na ordem, e o indicador no lugar do numero.
    const dependentes = page.locator(".dependente");
    await expect(dependentes).toHaveCount(2);
    await expect(dependentes.nth(0)).toContainText("Dependente Com Documento");
    await expect(dependentes.nth(0)).toContainText("CPF informado");
    await expect(dependentes.nth(1)).toContainText("Dependente Sem Documento");
    await expect(dependentes.nth(1)).toContainText("Sem CPF");

    // A prova que importa: o numero do dependente nao esta em lugar nenhum do documento — nem cru,
    // nem pontuado, nem em parte. Nem qualquer outra tira de 11 digitos.
    const html = await page.content();
    expect(html).not.toContain(cpfDoDependente);
    expect(html).not.toContain(cpfDoDependente.slice(0, 9));
    expect(html).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u);
    expect(html).not.toMatch(/(?<!\d)\d{11}(?!\d)/u);

    // E nao ha revelacao de CPF do candidato aqui: a unica entrada auditada e a do processo.
    await expect(page.getByRole("button", { name: /CPF/ })).toHaveCount(0);

    // Decisao disponivel, porque a ficha esta enviada e o DP pode revisar.
    await expect(page.getByRole("button", { name: "Aprovar ficha" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Devolver para correção" })).toBeVisible();
    expect(problemas).toEqual([]);
  });

  test("devolver reabre o mesmo link para o candidato; reenviada, o DP aprova", async ({ page }) => {
    const problemas = observarConsole(page);
    const { processoId, nome, token } = await processoComFichaEnviada(page, "Beta", 2);
    await page.goto(`/admissoes_processos/${processoId}/ficha`);
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();

    // Devolver sem texto e recusado na tela, antes de bater no servidor.
    await page.getByRole("button", { name: "Devolver para correção" }).click();
    const dialogo = page.locator(".v-dialog.v-overlay--active");
    await dialogo.getByRole("button", { name: "Devolver ficha" }).click();
    await expect(dialogo).toContainText("Escreva o que precisa ser corrigido.");

    await dialogo.getByLabel("Pendências").fill("Confira o número do RG.");
    await dialogo.getByRole("button", { name: "Devolver ficha" }).click();

    await expect(page.getByText("Devolvida para correção")).toBeVisible();
    await expect(page.getByText("Pendências enviadas ao candidato:")).toBeVisible();
    await expect(page.getByText("Confira o número do RG.")).toBeVisible();
    // Devolvida nao tem decisao: os botoes somem em vez de virarem 409.
    await expect(page.getByRole("button", { name: "Aprovar ficha" })).toHaveCount(0);

    // O MESMO token continua valendo para o candidato — e ele ve o que precisa corrigir.
    const candidato = await request.newContext();
    try {
      const reaberta = await candidato.get(`${API}/api/admissao/ficha`, { headers: { [CABECALHO]: token } });
      expect(reaberta.status()).toBe(200);
      const ficha = await dadosJson<{ situacao: string; revisaoPendencias: string | null }>(reaberta);
      expect(ficha.situacao).toBe("devolvida");
      expect(ficha.revisaoPendencias).toBe("Confira o número do RG.");

      await enviarFicha(candidato, token);
    } finally {
      await candidato.dispose();
    }
    await page.reload();
    await expect(page.getByText("Enviada — aguardando revisão")).toBeVisible();

    await page.getByRole("button", { name: "Aprovar ficha" }).click();
    await page.locator(".v-dialog.v-overlay--active").getByRole("button", { name: "Aprovar", exact: true }).click();

    await expect(page.getByText("Aprovada", { exact: true })).toBeVisible();
    await expect(page.getByText(/Revisada por/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprovar ficha" })).toHaveCount(0);

    // Aprovada, o candidato nao edita mais: o servidor recusa, e o token segue reconhecido (409, nao 404).
    const candidatoDepois = await request.newContext();
    try {
      const depois = await candidatoDepois.put(`${API}/api/admissao/ficha`, {
        headers: { [CABECALHO]: token },
        data: { versao: 999, bairro: "Nao pode" }
      });
      expect(depois.status()).toBe(409);
    } finally {
      await candidatoDepois.dispose();
    }
    expect(problemas).toEqual([]);
  });

  test("a tela cabe em 1440, 1024, 768 e 390 sem rolagem horizontal", async ({ page }) => {
    const { processoId, nome } = await processoComFichaEnviada(page, "Gama", 3);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura.largura, height: largura.altura });
      await page.goto(`/admissoes_processos/${processoId}/ficha`);
      await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
      await expect(page.locator(".dependente")).toHaveCount(2);
      await semRolagemHorizontal(page);

      // A decisao continua alcancavel: os botoes existem e tem alvo de toque (`67` §13.4).
      const aprovar = page.getByRole("button", { name: "Aprovar ficha" });
      await aprovar.scrollIntoViewIfNeeded();
      const caixa = await aprovar.boundingBox();
      expect(caixa, largura.nome).not.toBeNull();
      expect(caixa?.height ?? 0, `${largura.nome}: alvo de toque`).toBeGreaterThanOrEqual(largura.largura <= 768 ? 44 : 40);
      expect((caixa?.x ?? 0) + (caixa?.width ?? 0), `${largura.nome}: botao dentro da tela`).toBeLessThanOrEqual(
        largura.largura
      );
    }
  });
});

test.describe("quem nao e DP fica de fora", () => {
  test("a Gerencia nao ve a porta no modal e a tela recusa", async ({ page }) => {
    // A Gerencia abre o processo (tem `admissoes_processos_visualizar`), mas nao tem `ver_ficha`:
    // sem a porta no modal, e "Sem permissão" se digitar a rota na mao.
    await entrar(page, USUARIOS.gerencia);
    await page.goto("/admissoes_processos");
    // Espera a listagem CARREGAR antes de olhar as linhas. `count()` logo apos o `goto` conta zero
    // porque os dados ainda estao vindo — e um `test.skip` nessa contagem transformava a corrida em
    // "pulado", que passa no relatorio sem provar nada. Aqui a ausencia de linha falha, e falha
    // dizendo o que faltou.
    await expect(page.getByRole("heading", { name: "Processos de admissão" })).toBeVisible();
    const primeiraLinha = page.locator("tbody tr").first();
    await expect(primeiraLinha, "a Gerencia precisa enxergar ao menos um processo").toBeVisible();
    await primeiraLinha.getByRole("button", { name: "Abrir" }).click();
    // O titulo do modal e um `v-card-title` (div), nao um heading — por isso a ancora e o texto.
    const modal = page.locator(".v-dialog.v-overlay--active");
    await expect(modal).toContainText("Processo de admissão");
    // A secao inteira da ficha nao existe para quem nao pode ve-la: nao e so o botao escondido.
    await expect(modal.getByRole("heading", { name: "Ficha do candidato" })).toHaveCount(0);
    await expect(modal.getByRole("button", { name: "Abrir ficha do candidato" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // A rota digitada na mao: a tela diz que nao pode, e a API responde 403 — nao 200 com dado. O id
    // nao importa: a permissao e conferida antes de qualquer busca, entao um id qualquer basta.
    const idQualquer = "00000000-0000-4000-8000-000000000000";
    await page.goto(`/admissoes_processos/${idQualquer}/ficha`);
    await expect(page.getByText("Sem permissão para acessar esta página.")).toBeVisible();

    const resposta = await page.request.get(`${API}/api/admissoes/processos/${idQualquer}/ficha`);
    expect(resposta.status()).toBe(403);
  });

  test("quem so opera caixa nao entra nem na listagem", async ({ page }) => {
    await entrar(page, USUARIOS.semProdutos);
    await page.goto("/admissoes_processos/00000000-0000-4000-8000-000000000000/ficha");
    await expect(page.getByText("Sem permissão para acessar esta página.")).toBeVisible();
  });

  test("sem sessao a tela manda para o login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admissoes_processos/00000000-0000-4000-8000-000000000000/ficha");
    await page.waitForURL("**/login", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });
});
