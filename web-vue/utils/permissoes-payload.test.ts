import { describe, expect, it } from "vitest";
import { permissoesOcultasNaTela } from "./domain";
import { chaveAlvoPermissao, regrasComOcultasPreservadas, type LinhaPermissaoPersistida } from "./permissoes-payload";

// S-06: a tela esconde 39 permissoes (13 telas ocultas x visualizar + os menu_*). O salvamento faz
// REPLACE total no servidor, entao o que a tela nao manda o servidor apaga. Estes testes usam a
// LISTA REAL (`permissoesOcultasNaTela`, derivada de `domain.ts`), nao uma copia paralela: se alguem
// revelar uma tela oculta, os testes acompanham em vez de mentir.

/** Ocultas que o cargo Gerencia possui de verdade (db/seed.ts:300-317 + referencia-permissoes.ts). */
const OCULTAS_DA_GERENCIA = [
  "promocoes_visualizar",
  "menu_promocoes_mostrar",
  "relatorio_faltas_visualizar",
  "menu_relatorio_faltas_mostrar",
  "relatorio_advertencias_visualizar",
  "menu_relatorio_advertencias_mostrar",
  "perdas_sobras_visualizar",
  "menu_perdas_sobras_mostrar",
  "estoque_produtos_visualizar",
  "menu_estoque_produtos_mostrar",
  "relatorio_dre_visualizar",
  "menu_relatorio_dre_mostrar"
] as const;

/** Oculta que a Gerencia NAO possui — serve para provar que nada e concedido de brinde. */
const OCULTA_AUSENTE = "folha_ponto_visualizar";

const CARGO_GERENCIA = "11111111-1111-4111-8111-111111111111";
const CARGO_CAIXA = "22222222-2222-4222-8222-222222222222";

function regrasDaGerenciaNoBanco(): Record<string, boolean> {
  return {
    // visiveis
    entradas_visualizar: true,
    entradas_criar: true,
    transferencias_visualizar: true,
    cadastro_clientes_visualizar: false,
    // ocultas — o que o bug apagava
    ...Object.fromEntries(OCULTAS_DA_GERENCIA.map((permissao) => [permissao, true]))
  };
}

function linhaPersistida(id: string, regras: Record<string, boolean>): LinhaPermissaoPersistida {
  return { id, regrasJson: JSON.stringify(regras) };
}

/** O que a tela entrega ao form: as mesmas regras, MENOS as ocultas (useCadastroView.ts:305-317). */
function comoATelaFiltra(regras: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(regras).filter(([permissao]) => !permissoesOcultasNaTela.has(permissao as never))
  );
}

const formGerencia = (regras: Record<string, boolean>) => ({
  tipoPermissao: "cargo" as const,
  cargoId: CARGO_GERENCIA,
  setorId: "",
  usuarioId: "",
  regras
});

describe("chaveAlvoPermissao", () => {
  it("monta a chave no mesmo formato que a API devolve (permissoes.service.ts:98,115,132)", () => {
    expect(chaveAlvoPermissao(formGerencia({}))).toBe(`cargo:${CARGO_GERENCIA}`);
    expect(chaveAlvoPermissao({ tipoPermissao: "setor", cargoId: "", setorId: "s1", usuarioId: "", regras: {} })).toBe(
      "setor:s1"
    );
    expect(
      chaveAlvoPermissao({ tipoPermissao: "usuario", cargoId: "", setorId: "", usuarioId: "u1", regras: {} })
    ).toBe("usuario:u1");
  });

  it("devolve string vazia quando o alvo ainda nao foi escolhido", () => {
    expect(chaveAlvoPermissao(formGerencia({}) && { ...formGerencia({}), cargoId: "" })).toBe("");
  });
});

describe("regrasComOcultasPreservadas — S-06", () => {
  const persistidas = [linhaPersistida(`cargo:${CARGO_GERENCIA}`, regrasDaGerenciaNoBanco())];

  it("(a) editar e salvar a Gerencia mantem as 12 permissoes ocultas que ela tinha", () => {
    const form = formGerencia(comoATelaFiltra(regrasDaGerenciaNoBanco()));

    const resultado = regrasComOcultasPreservadas(form, persistidas);

    for (const oculta of OCULTAS_DA_GERENCIA) {
      expect(resultado[oculta], oculta).toBe(true);
    }
  });

  it("(b) uma permissao VISIVEL pode ser retirada (o herdar continua funcionando)", () => {
    const regrasDoForm = comoATelaFiltra(regrasDaGerenciaNoBanco());
    delete regrasDoForm["entradas_criar"]; // estado "herdar" — useCadastroView.ts:350

    const resultado = regrasComOcultasPreservadas(formGerencia(regrasDoForm), persistidas);

    expect(resultado).not.toHaveProperty("entradas_criar");
    // e as ocultas seguem intactas
    expect(resultado["promocoes_visualizar"]).toBe(true);
  });

  it("(b2) uma permissao VISIVEL pode ser NEGADA e o false sobrevive", () => {
    const regrasDoForm = comoATelaFiltra(regrasDaGerenciaNoBanco());
    regrasDoForm["entradas_criar"] = false;

    const resultado = regrasComOcultasPreservadas(formGerencia(regrasDoForm), persistidas);

    expect(resultado["entradas_criar"]).toBe(false);
  });

  it("(c) uma permissao VISIVEL pode ser adicionada", () => {
    const regrasDoForm = comoATelaFiltra(regrasDaGerenciaNoBanco());
    regrasDoForm["cadastro_contas_visualizar"] = true;

    const resultado = regrasComOcultasPreservadas(formGerencia(regrasDoForm), persistidas);

    expect(resultado["cadastro_contas_visualizar"]).toBe(true);
    expect(resultado["promocoes_visualizar"]).toBe(true);
  });

  it("(d) permissao OCULTA que o cargo NAO tinha nao e concedida de brinde", () => {
    const form = formGerencia(comoATelaFiltra(regrasDaGerenciaNoBanco()));

    const resultado = regrasComOcultasPreservadas(form, persistidas);

    expect(resultado).not.toHaveProperty(OCULTA_AUSENTE);
    expect(resultado).not.toHaveProperty("menu_folha_ponto_mostrar");
  });

  it("(d2) preserva o valor gravado, inclusive quando a oculta estava NEGADA", () => {
    const noBanco = { ...regrasDaGerenciaNoBanco(), promocoes_visualizar: false };
    const form = formGerencia(comoATelaFiltra(noBanco));

    const resultado = regrasComOcultasPreservadas(form, [linhaPersistida(`cargo:${CARGO_GERENCIA}`, noBanco)]);

    expect(resultado["promocoes_visualizar"]).toBe(false);
  });

  it("(e) o payload nao tem duplicidade e o valor do FORM vence o do banco", () => {
    const regrasDoForm = comoATelaFiltra(regrasDaGerenciaNoBanco());
    regrasDoForm["transferencias_visualizar"] = false; // no banco estava true

    const resultado = regrasComOcultasPreservadas(formGerencia(regrasDoForm), persistidas);

    const chaves = Object.keys(resultado);
    expect(chaves.length).toBe(new Set(chaves).size);
    expect(resultado["transferencias_visualizar"]).toBe(false);
  });

  it("(f) salvar duas vezes seguidas produz exatamente o mesmo conjunto", () => {
    const form = formGerencia(comoATelaFiltra(regrasDaGerenciaNoBanco()));

    const primeiro = regrasComOcultasPreservadas(form, persistidas);
    // a segunda rodada parte do que ficou no banco depois do primeiro save
    const persistidasDepois = [linhaPersistida(`cargo:${CARGO_GERENCIA}`, primeiro)];
    const segundo = regrasComOcultasPreservadas(formGerencia(comoATelaFiltra(primeiro)), persistidasDepois);

    expect(segundo).toEqual(primeiro);
  });
});

describe("o bug S-06, documentado", () => {
  // Prova que a suite PEGA a regressao: se alguem voltar o save para `{ ...form.regras }`
  // (AppWorkspace.vue:1425 antes da correcao), o resultado e exatamente este — sem as ocultas.
  it("o payload ANTIGO (so o form) perdia as 12 ocultas da Gerencia", () => {
    const payloadAntigo = { ...comoATelaFiltra(regrasDaGerenciaNoBanco()) };

    for (const oculta of OCULTAS_DA_GERENCIA) {
      expect(payloadAntigo, oculta).not.toHaveProperty(oculta);
    }
    // e o servidor faz REPLACE total, entao o que nao vai no payload e apagado
    expect(Object.keys(payloadAntigo)).toHaveLength(4);
  });
});

describe("regrasComOcultasPreservadas — guardas de seguranca", () => {
  const persistidas = [
    linhaPersistida(`cargo:${CARGO_GERENCIA}`, regrasDaGerenciaNoBanco()),
    linhaPersistida(`cargo:${CARGO_CAIXA}`, { entradas_visualizar: true, menu_promocoes_mostrar: true })
  ];

  it("troca de alvo no modal NAO leva as ocultas do alvo anterior (WorkspaceDialogs.vue:779-810)", () => {
    // abriu a Gerencia, trocou o select para Caixa e salvou
    const form = {
      tipoPermissao: "cargo" as const,
      cargoId: CARGO_CAIXA,
      setorId: "",
      usuarioId: "",
      regras: comoATelaFiltra(regrasDaGerenciaNoBanco())
    };

    const resultado = regrasComOcultasPreservadas(form, persistidas);

    // as ocultas que sobrevivem sao as DO CAIXA, nunca as da Gerencia
    expect(resultado["menu_promocoes_mostrar"]).toBe(true);
    expect(resultado).not.toHaveProperty("relatorio_dre_visualizar");
    expect(resultado).not.toHaveProperty("perdas_sobras_visualizar");
  });

  it('caminho "Novo" sobre um alvo que ja tem regras preserva as ocultas dele (AppWorkspace.vue:1387-1392)', () => {
    // "Novo" nasce com regras vazias; o usuario escolhe a Gerencia e marca uma visivel
    const form = formGerencia({ entradas_visualizar: true });

    const resultado = regrasComOcultasPreservadas(form, persistidas);

    for (const oculta of OCULTAS_DA_GERENCIA) {
      expect(resultado[oculta], oculta).toBe(true);
    }
    expect(resultado["entradas_visualizar"]).toBe(true);
  });

  it("alvo sem linha persistida devolve exatamente o que o form tem", () => {
    const form = formGerencia({ entradas_visualizar: true });

    expect(regrasComOcultasPreservadas(form, [])).toEqual({ entradas_visualizar: true });
  });

  it("alvo ainda nao escolhido devolve o form intacto, sem estourar", () => {
    const form = { tipoPermissao: "cargo" as const, cargoId: "", setorId: "", usuarioId: "", regras: { a: true } };

    expect(regrasComOcultasPreservadas(form as never, persistidas)).toEqual({ a: true });
  });

  it("regrasJson corrompido nao derruba o salvamento", () => {
    const form = formGerencia({ entradas_visualizar: true });
    const quebrada = [{ id: `cargo:${CARGO_GERENCIA}`, regrasJson: "{isso nao e json" }];

    expect(regrasComOcultasPreservadas(form, quebrada)).toEqual({ entradas_visualizar: true });
  });

  it("ignora valor nao-booleano vindo do servidor", () => {
    const form = formGerencia({ entradas_visualizar: true });
    const suja = [{ id: `cargo:${CARGO_GERENCIA}`, regrasJson: '{"promocoes_visualizar":"sim"}' }];

    expect(regrasComOcultasPreservadas(form, suja)).toEqual({ entradas_visualizar: true });
  });
});
