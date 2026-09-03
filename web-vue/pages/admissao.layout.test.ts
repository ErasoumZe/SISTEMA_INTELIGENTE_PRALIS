import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADM-003 V4 — o contrato de layout da ficha publica.
 *
 * **O que este arquivo NAO e:** prova de renderizacao. Ele nao abre navegador, nao mede pixel e nao
 * substitui o E2E de viewport. A prova visual de verdade mora no Playwright, e a ficha publica ainda
 * nao tem projeto la — ela precisaria de um convite emitido, e portanto da pilha de desenvolvimento
 * de pe contra o banco persistente. Isso esta registrado como pendencia, nao como feito.
 *
 * **O que ele e:** a trava do defeito que de fato acontece nesta tela. Ela cresce por acrescimo de
 * campo, e a falha classica e alguem adicionar uma grade de duas colunas e esquecer de colapsa-la —
 * o que so aparece no celular, depois do deploy. Um teste que le a folha de estilo pega isso na hora.
 *
 * As quatro larguras do Definition of Done (`67` §13.7) se resolvem com UM ponto de corte:
 *
 * | largura | o que vale |
 * | --- | --- |
 * | 1440 e 1024 | grades de 2 e 3 colunas, dentro de `max-width: 880px` — sobra folga nas duas |
 * | 768 e 390 | tudo colapsa para uma coluna pela media query de 768 |
 */
describe("ficha publica — contrato de layout", () => {
  const fonte = readFileSync(join(import.meta.dirname, "admissao.vue"), "utf8");
  const estilo = fonte.slice(fonte.indexOf("<style"), fonte.lastIndexOf("</style>"));
  const corteCelular = "@media (max-width: 768px)";
  const noCelular = estilo.slice(estilo.indexOf(corteCelular));

  /** Blocos `.classe { ... }` do topo da folha, fora de qualquer media query. */
  const regras = [...estilo.slice(0, estilo.indexOf("@media")).matchAll(/(\.[\w-]+)\s*\{([^}]*)\}/gu)];

  it("Deve_TerOPontoDeCorteDe768", () => {
    expect(estilo).toContain(corteCelular);
  });

  it("Deve_ColapsarParaUmaColuna_Quando_AbaixoDe768", () => {
    const multiplas = regras
      .filter(([, , corpo]) => /grid-template-columns:\s*repeat\(\s*[2-9]/u.test(corpo ?? ""))
      .map(([, seletor]) => seletor as string);

    // Se um dia nao houver grade multipla nenhuma, o teste passaria vazio provando nada.
    expect(multiplas.length).toBeGreaterThan(0);

    for (const seletor of multiplas) {
      expect(noCelular, `${seletor} nao colapsa no celular`).toContain(seletor);
    }
    expect(noCelular).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("Deve_UsarTrilhosQueEncolhem_Para_NaoEmpurrarARolagemHorizontal", () => {
    // `repeat(2, 1fr)` NAO encolhe: `1fr` tem `min-width: auto`, e um texto longo num campo estoura
    // a coluna e leva a pagina inteira para a rolagem lateral. `minmax(0, 1fr)` e o que impede isso,
    // e e por isso que ele aparece em toda grade desta tela.
    for (const [, seletor, corpo] of regras) {
      if (!/grid-template-columns:\s*repeat\(/u.test(corpo ?? "")) continue;
      expect(corpo, `${seletor} usa repeat sem minmax(0, ...)`).toContain("minmax(0,");
    }
  });

  it("Deve_SerFluida_E_NaoTerLarguraFixaEmPixel", () => {
    // `max-width` limita sem travar; `width: 880px` travaria — e a 390 a pagina nasceria rolando.
    expect(estilo).toContain("max-width: 880px");
    expect(estilo).not.toMatch(/(?<!max-|min-)width:\s*\d+px/u);
  });

  it("Deve_AnimarSomenteOQueOCompositorResolve", () => {
    // Movimento na lista de dependentes so em `opacity` e `transform`. Animar altura, largura ou
    // `top` forcaria relayout a cada quadro, e num celular modesto isso e o que trava a rolagem.
    const transicoes = [...estilo.matchAll(/transition:\s*([^;]+);/gu)].map((achado) => achado[1] ?? "");
    expect(transicoes.length).toBeGreaterThan(0);
    for (const transicao of transicoes) {
      if (transicao.trim() === "none") continue;
      // Achata parenteses antes de separar: uma curva `cubic-bezier(...)` tem virgulas dentro, e
      // separar cru transformaria um dos numeros dela numa propriedade animada inexistente.
      const propriedades = transicao
        .replace(/\([^)]*\)/gu, "()")
        .split(",")
        .map((parte) => parte.trim().split(/\s+/u)[0]);
      for (const propriedade of propriedades) {
        expect(["opacity", "transform"], transicao).toContain(propriedade);
      }
    }
  });

  it("Deve_TerAlvoDeToqueDe44px_No_Celular", () => {
    // Medido em navegador real: o default do Vuetify entrega 36px no botao e 28px em radio e
    // checkbox. O `67` §9 pede 40px de piso e o §13.4 pede 44px no mobile — a ficha reprovava nas
    // quatro larguras. A regra e escopada a `.ficha`: nada global muda.
    expect(estilo).toContain(".ficha :deep(.v-btn)");
    expect(estilo).toContain(".ficha :deep(.v-selection-control)");
    expect(estilo).toContain("min-height: 40px");
    expect(noCelular).toContain("min-height: 44px");
  });

  it("Deve_DesligarOMovimento_Quando_APessoaPedirMenosMovimento", () => {
    // Quem marcou "reduzir movimento" no sistema muitas vezes o fez por enjoo ou vertigem. Nao e
    // preferencia estetica, e a lista de dependentes anima justamente quando ela muda de tamanho.
    const semMovimento = estilo.slice(estilo.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(semMovimento).toContain("transition: none");
    for (const classe of ["dep-lista-enter-active", "dep-lista-leave-active", "dep-lista-move"]) {
      expect(semMovimento, classe).toContain(classe);
    }
  });
});
