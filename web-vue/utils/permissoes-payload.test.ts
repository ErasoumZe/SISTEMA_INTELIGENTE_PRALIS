import { describe, expect, it } from "vitest";
import { permissoesOcultasNaTela } from "./domain";
import { regrasComOcultasPreservadas, type ListasPermissoesPersistidas } from "./permissoes-payload";

// S-06: a tela esconde 52 permissoes — as 13 telas de `telasOcultasNoDrawerEPermissoes` (uma
// `*_visualizar` cada) mais 39 flags de menu (13 x mostrar/desabilitado/somente_caixa_aberto). O
// salvamento faz REPLACE total no servidor, entao o que a tela nao manda o servidor apaga. Estes
// testes usam a LISTA REAL (`permissoesOcultasNaTela`), nao uma copia paralela.

/** Ocultas que o cargo Gerencia possui de verdade (`db/seed.ts` + `db/src/referencia-permissoes.ts`). */
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

/** Oculta que a Gerencia NAO possui — prova que nada e concedido de brinde. */
const OCULTA_AUSENTE = "folha_ponto_visualizar";

const CARGO_GERENCIA = "11111111-1111-4111-8111-111111111111";
const CARGO_CAIXA = "22222222-2222-4222-8222-222222222222";

const VISIVEIS_DA_GERENCIA = {
  entradas_visualizar: true,
  entradas_criar: true,
  transferencias_visualizar: true,
  cadastro_clientes_visualizar: false
} as const;

function regrasDaGerenciaNoBanco(): Record<string, boolean> {
  return {
    ...VISIVEIS_DA_GERENCIA,
    ...Object.fromEntries(OCULTAS_DA_GERENCIA.map((permissao) => [permissao, true]))
  };
}

function listasVazias(): ListasPermissoesPersistidas {
  return { cargosPermissoes: [], setoresPermissoes: [], usuariosPermissoes: [] };
}

function listasComCargo(cargoId: string, regras: Record<string, boolean>): ListasPermissoesPersistidas {
  return { ...listasVazias(), cargosPermissoes: [{ id: cargoId, cargoId, regras }] };
}

/** O que a tela entrega ao form: as mesmas regras, MENOS as ocultas (`useCadastroView`). */
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

describe("regrasComOcultasPreservadas — criterios da S-06", () => {
  const persistidas = listasComCargo(CARGO_GERENCIA, regrasDaGerenciaNoBanco());

  it("a fixture nao apodrece: as 12 da Gerencia sao mesmo ocultas hoje", () => {
    expect(OCULTAS_DA_GERENCIA).toHaveLength(12);
    for (const oculta of OCULTAS_DA_GERENCIA) {
      expect(permissoesOcultasNaTela.has(oculta as never), oculta).toBe(true);
    }
    expect(permissoesOcultasNaTela.has(OCULTA_AUSENTE as never)).toBe(true);
  });

  it("(a) editar e salvar a Gerencia mantem as 12 permissoes ocultas que ela tinha", () => {
    const resultado = regrasComOcultasPreservadas(
      formGerencia(comoATelaFiltra(regrasDaGerenciaNoBanco())),
      persistidas
    );

    for (const oculta of OCULTAS_DA_GERENCIA) {
      expect(resultado[oculta], oculta).toBe(true);
    }
  });

  it("(b) uma permissao VISIVEL pode ser retirada (o herdar continua funcionando)", () => {
    const regrasDoForm = comoATelaFiltra(regrasDaGerenciaNoBanco());
    delete regrasDoForm["entradas_criar"]; // estado "herdar" = ausencia de chave

    const resultado = regrasComOcultasPreservadas(formGerencia(regrasDoForm), persistidas);

    expect(resultado).not.toHaveProperty("entradas_criar");
    expect(resultado["promocoes_visualizar"]).toBe(true);
  });

  it("(b2) uma permissao VISIVEL pode ser NEGADA e o false sobrevive", () => {
    const regrasDoForm = comoATelaFiltra(regrasDaGerenciaNoBanco());
    regrasDoForm["entradas_criar"] = false;

    expect(regrasComOcultasPreservadas(formGerencia(regrasDoForm), persistidas)["entradas_criar"]).toBe(false);
  });

  it("(c) uma permissao VISIVEL pode ser adicionada", () => {
    const regrasDoForm = comoATelaFiltra(regrasDaGerenciaNoBanco());
    regrasDoForm["cadastro_contas_visualizar"] = true;

    const resultado = regrasComOcultasPreservadas(formGerencia(regrasDoForm), persistidas);

    expect(resultado["cadastro_contas_visualizar"]).toBe(true);
    expect(resultado["promocoes_visualizar"]).toBe(true);
  });

  it("(d) permissao OCULTA que o cargo NAO tinha nao e concedida de brinde", () => {
    const resultado = regrasComOcultasPreservadas(
      formGerencia(comoATelaFiltra(regrasDaGerenciaNoBanco())),
      persistidas
    );

    expect(resultado).not.toHaveProperty(OCULTA_AUSENTE);
    expect(resultado).not.toHaveProperty("menu_folha_ponto_mostrar");
  });

  it("(d2) preserva o valor gravado, inclusive quando a oculta estava NEGADA", () => {
    const noBanco = { ...regrasDaGerenciaNoBanco(), promocoes_visualizar: false };

    const resultado = regrasComOcultasPreservadas(
      formGerencia(comoATelaFiltra(noBanco)),
      listasComCargo(CARGO_GERENCIA, noBanco)
    );

    expect(resultado["promocoes_visualizar"]).toBe(false);
  });

  it("(e) o conjunto de chaves e exatamente ocultas-do-banco + form, e o form vence no conflito", () => {
    const regrasDoForm = comoATelaFiltra(regrasDaGerenciaNoBanco());
    regrasDoForm["transferencias_visualizar"] = false; // no banco estava true

    const resultado = regrasComOcultasPreservadas(formGerencia(regrasDoForm), persistidas);

    // Conjuntos, e nao `keys.length === new Set(keys).size` — esse assert e tautologico em JS.
    expect(new Set(Object.keys(resultado))).toEqual(new Set([...OCULTAS_DA_GERENCIA, ...Object.keys(regrasDoForm)]));
    expect(resultado["transferencias_visualizar"]).toBe(false);
  });

  it("(f) o primeiro save reproduz o estado do banco e o segundo nao muda mais nada", () => {
    const primeiro = regrasComOcultasPreservadas(formGerencia(comoATelaFiltra(regrasDaGerenciaNoBanco())), persistidas);

    // ANCORA no banco: sem isto o teste nao separa corrigido de bugado, porque o bug S-06 tambem e
    // idempotente — ele destroi no PRIMEIRO save e depois repete o conjunto ja mutilado.
    expect(primeiro).toEqual(regrasDaGerenciaNoBanco());

    const segundo = regrasComOcultasPreservadas(
      formGerencia(comoATelaFiltra(primeiro)),
      listasComCargo(CARGO_GERENCIA, primeiro)
    );

    expect(segundo).toEqual(primeiro);
  });
});

describe("regrasComOcultasPreservadas — guardas", () => {
  const persistidas: ListasPermissoesPersistidas = {
    cargosPermissoes: [
      { id: CARGO_GERENCIA, cargoId: CARGO_GERENCIA, regras: regrasDaGerenciaNoBanco() },
      { id: CARGO_CAIXA, cargoId: CARGO_CAIXA, regras: { entradas_visualizar: true, menu_promocoes_mostrar: true } }
    ],
    setoresPermissoes: [{ id: "s1", setorId: "s1", regras: { relatorio_dre_visualizar: true } }],
    usuariosPermissoes: [{ id: "u1", usuarioId: "u1", regras: { menu_estoque_produtos_mostrar: true } }]
  };

  it("trocar o alvo no modal NAO leva as ocultas do alvo anterior", () => {
    // abriu a Gerencia, trocou o select para Caixa e salvou
    const resultado = regrasComOcultasPreservadas(
      { ...formGerencia(comoATelaFiltra(regrasDaGerenciaNoBanco())), cargoId: CARGO_CAIXA },
      persistidas
    );

    expect(resultado["menu_promocoes_mostrar"]).toBe(true); // do Caixa
    expect(resultado).not.toHaveProperty("relatorio_dre_visualizar"); // da Gerencia
    expect(resultado).not.toHaveProperty("perdas_sobras_visualizar");
  });

  it('caminho "Novo" sobre alvo existente preserva as ocultas dele, mesmo sem busca na tela', () => {
    // Este e o motivo de a fonte ser `opcoes` e nao `permissoesPagina`: a pagina nasce vazia e so
    // e preenchida quando o usuario clica em Buscar, entao o "Novo" nao acharia o alvo.
    const resultado = regrasComOcultasPreservadas(formGerencia({ entradas_visualizar: true }), persistidas);

    for (const oculta of OCULTAS_DA_GERENCIA) {
      expect(resultado[oculta], oculta).toBe(true);
    }
    expect(resultado["entradas_visualizar"]).toBe(true);
  });

  it("preserva as ocultas quando o alvo e SETOR ou USUARIO, sem cruzar os tipos", () => {
    const doSetor = regrasComOcultasPreservadas(
      { tipoPermissao: "setor", cargoId: "", setorId: "s1", usuarioId: "", regras: { entradas_visualizar: true } },
      persistidas
    );
    const doUsuario = regrasComOcultasPreservadas(
      { tipoPermissao: "usuario", cargoId: "", setorId: "", usuarioId: "u1", regras: { entradas_visualizar: true } },
      persistidas
    );

    expect(doSetor["relatorio_dre_visualizar"]).toBe(true);
    expect(doUsuario["menu_estoque_produtos_mostrar"]).toBe(true);
    expect(doUsuario).not.toHaveProperty("relatorio_dre_visualizar");
  });

  it("preserva as flags de menu ocultas alem das *_visualizar", () => {
    const noBanco = {
      entradas_visualizar: true,
      menu_relatorio_dre_desabilitado: true,
      menu_perdas_sobras_desabilitado: false
    };

    const resultado = regrasComOcultasPreservadas(
      formGerencia(comoATelaFiltra(noBanco)),
      listasComCargo(CARGO_GERENCIA, noBanco)
    );

    expect(resultado["menu_relatorio_dre_desabilitado"]).toBe(true);
    expect(resultado["menu_perdas_sobras_desabilitado"]).toBe(false);
  });

  it("alvo sem regras gravadas devolve exatamente o que o form tem", () => {
    expect(regrasComOcultasPreservadas(formGerencia({ entradas_visualizar: true }), listasVazias())).toEqual({
      entradas_visualizar: true
    });
  });

  it("alvo ainda nao escolhido devolve o form intacto, sem estourar", () => {
    const form = { tipoPermissao: "cargo" as const, cargoId: "", setorId: "", usuarioId: "", regras: { a: true } };

    expect(regrasComOcultasPreservadas(form, persistidas)).toEqual({ a: true });
  });

  it("ignora valor nao-booleano vindo do servidor", () => {
    const suja: ListasPermissoesPersistidas = {
      ...listasVazias(),
      cargosPermissoes: [
        { id: CARGO_GERENCIA, cargoId: CARGO_GERENCIA, regras: { promocoes_visualizar: "sim" } as never }
      ]
    };

    expect(regrasComOcultasPreservadas(formGerencia({ entradas_visualizar: true }), suja)).toEqual({
      entradas_visualizar: true
    });
  });
});
