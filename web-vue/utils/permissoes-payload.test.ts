import { describe, expect, it } from "vitest";
import { cadastroPayload } from "@padaria/shared";
import { formCadastroVazio, permissoesOcultasNaTela } from "./domain";
import {
  aplicarRegrasDoAlvoNasListas,
  regrasComOcultasPreservadas,
  type ListasPermissoesPersistidas
} from "./permissoes-payload";

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

// ------------------------------------------------------------------------------------------------
// Payload FINAL da tela — o que de fato sai no PUT/POST
// ------------------------------------------------------------------------------------------------
// Os testes acima provam a funcao de merge isolada. Este bloco fecha a lacuna apontada na revisao:
// monta o `formSnapshot` exatamente como `salvarCadastro` monta e passa por `cadastroPayload`, que e
// quem produz o corpo enviado. Sem isto, trocar a chamada em `AppWorkspace.vue` de volta para
// `{ ...form.regras }` deixaria a suite verde com o bug de volta.

const EMPRESA = "99999999-9999-4999-8999-999999999999";

/** Reproduz `salvarCadastro`: form -> preservacao -> snapshot -> `cadastroPayload`. */
function payloadDaTela(form: ReturnType<typeof formCadastroVazio>, listas: ListasPermissoesPersistidas) {
  const formSnapshot = {
    ...form,
    empresaIds: [...form.empresaIds],
    regras: regrasComOcultasPreservadas(form, listas)
  };
  return cadastroPayload("permissoes", formSnapshot, EMPRESA) as {
    tipoPermissao: string;
    cargoId?: string;
    setorId?: string;
    usuarioId?: string;
    regras: Record<string, boolean>;
  };
}

/** Form como a tela o entrega ao abrir a Gerencia para edicao: so as visiveis chegam ao formulario. */
function formDaGerenciaAberto(regrasNoBanco: Record<string, boolean>) {
  return {
    ...formCadastroVazio(),
    tipoPermissao: "cargo" as const,
    cargoId: CARGO_GERENCIA,
    regras: comoATelaFiltra(regrasNoBanco)
  };
}

describe("payload final da tela de Permissoes (S-06)", () => {
  const listas: ListasPermissoesPersistidas = {
    cargosPermissoes: [
      { id: CARGO_GERENCIA, cargoId: CARGO_GERENCIA, regras: regrasDaGerenciaNoBanco() },
      {
        id: CARGO_CAIXA,
        cargoId: CARGO_CAIXA,
        // oculta EXCLUSIVA do Caixa — nao pode aparecer no payload da Gerencia
        regras: { entradas_visualizar: true, menu_folha_ponto_mostrar: true, folha_ponto_visualizar: true }
      }
    ],
    setoresPermissoes: [],
    usuariosPermissoes: []
  };

  /** Edicao real: tira `entradas_criar`, nega `transferencias_visualizar`, liga uma nova. */
  function formEditadoPeloUsuario() {
    const form = formDaGerenciaAberto(regrasDaGerenciaNoBanco());
    delete form.regras["entradas_criar"]; // "herdar"
    form.regras["transferencias_visualizar"] = false; // "negar"
    form.regras["cadastro_contas_visualizar"] = true; // "permitir" novo
    return form;
  }

  it("identifica o alvo: tipo cargo e o cargoId correto, sem setor nem usuario", () => {
    const payload = payloadDaTela(formEditadoPeloUsuario(), listas);

    expect(payload.tipoPermissao).toBe("cargo");
    expect(payload.cargoId).toBe(CARGO_GERENCIA);
    expect(payload.setorId).toBeUndefined();
    expect(payload.usuarioId).toBeUndefined();
  });

  it("carrega as 12 ocultas da Gerencia e as alteracoes do formulario", () => {
    const payload = payloadDaTela(formEditadoPeloUsuario(), listas);

    for (const oculta of OCULTAS_DA_GERENCIA) {
      expect(payload.regras[oculta], oculta).toBe(true);
    }
    expect(payload.regras["cadastro_contas_visualizar"]).toBe(true); // adicionada
    expect(payload.regras["entradas_visualizar"]).toBe(true); // intocada
  });

  it("nao concede oculta que a Gerencia nao tinha, nem chave de outro cargo", () => {
    const payload = payloadDaTela(formEditadoPeloUsuario(), listas);

    expect(payload.regras).not.toHaveProperty(OCULTA_AUSENTE);
    // as do Caixa: `folha_ponto_visualizar` e `menu_folha_ponto_mostrar` existem na outra linha
    expect(payload.regras).not.toHaveProperty("menu_folha_ponto_mostrar");
  });

  it("respeita a remocao de visivel e preserva o false da negacao", () => {
    const payload = payloadDaTela(formEditadoPeloUsuario(), listas);

    expect(payload.regras).not.toHaveProperty("entradas_criar"); // removida no form
    expect(payload.regras["transferencias_visualizar"]).toBe(false); // negada no form
    expect(payload.regras["cadastro_clientes_visualizar"]).toBe(false); // ja era negada no banco
  });

  it("o conjunto de chaves e exatamente 12 ocultas + o que o form tem", () => {
    const form = formEditadoPeloUsuario();
    const payload = payloadDaTela(form, listas);

    expect(new Set(Object.keys(payload.regras))).toEqual(
      new Set([...OCULTAS_DA_GERENCIA, ...Object.keys(form.regras)])
    );
  });

  it("segundo salvamento com as opcoes AINDA NAO recarregadas produz o mesmo payload", () => {
    // Apos salvar, a tela nao necessariamente recarrega `opcoes` — o segundo save reusa a MESMA
    // lista. Se a preservacao dependesse de dado fresco, o segundo save perderia as ocultas.
    const primeiro = payloadDaTela(formEditadoPeloUsuario(), listas);
    const segundo = payloadDaTela(formEditadoPeloUsuario(), listas);

    expect(segundo.regras).toEqual(primeiro.regras);
    for (const oculta of OCULTAS_DA_GERENCIA) {
      expect(segundo.regras[oculta], oculta).toBe(true);
    }
  });

  it("reabrir a tela depois do save (banco ja completo) nao muda mais nada", () => {
    const primeiro = payloadDaTela(formEditadoPeloUsuario(), listas);

    // banco depois do save + tela reaberta a partir dele
    const listasDepois: ListasPermissoesPersistidas = {
      ...listas,
      cargosPermissoes: [{ id: CARGO_GERENCIA, cargoId: CARGO_GERENCIA, regras: primeiro.regras }]
    };
    const segundo = payloadDaTela(formDaGerenciaAberto(primeiro.regras), listasDepois);

    expect(segundo.regras).toEqual(primeiro.regras);
  });
});

// ------------------------------------------------------------------------------------------------
// Sincronizacao apos "Restaurar padrao" — S-06 (bloqueante da revisao)
// ------------------------------------------------------------------------------------------------
// `opcoes` e a fonte das ocultas no save e so e populado ao carregar a tela. O "Restaurar padrao"
// faz REPLACE incluindo as ocultas, entao sem sincronizar o proximo save reinjeta o retrato ANTIGO
// e desfaz a restauracao em silencio. O endpoint devolve `{ cargoId, regras }`, entao sincronizar
// nao custa chamada nenhuma.
//
// O cenario tem 12 ocultas ANTES e 12 DEPOIS, de proposito: contagem igual dos dois lados faz um
// teste que so conte chaves passar. So a igualdade de CONJUNTO denuncia a troca.

const OCULTAS_QUE_ENTRAM = ["relatorio_dre_visualizar", "menu_relatorio_dre_mostrar"] as const;
const OCULTAS_QUE_SAEM = [OCULTA_AUSENTE, "menu_folha_ponto_mostrar"] as const;

/** Estado do cargo ANTES: alguem desligou o DRE e concedeu folha de ponto a mao. */
function regrasDaGerenciaAntesDaRestauracao(): Record<string, boolean> {
  const regras = regrasDaGerenciaNoBanco();
  for (const saiu of OCULTAS_QUE_ENTRAM) delete regras[saiu];
  for (const entrou of OCULTAS_QUE_SAEM) regras[entrou] = true;
  return regras;
}

function soOcultas(regras: Record<string, boolean>): Set<string> {
  return new Set(Object.keys(regras).filter((permissao) => permissoesOcultasNaTela.has(permissao as never)));
}

/** Corpo real do POST /api/permissoes/cargo/:id/restaurar-padrao. */
const RESPOSTA_RESTAURACAO = { cargoId: CARGO_GERENCIA, regras: regrasDaGerenciaNoBanco() };

function alvoCargo(cargoId: string) {
  return { tipoPermissao: "cargo" as const, cargoId, setorId: "", usuarioId: "" };
}

describe("restaurar padrao do cargo sincroniza as opcoes (S-06)", () => {
  it("a fixture descreve mesmo uma troca nos dois sentidos, com a mesma contagem", () => {
    const antes = soOcultas(regrasDaGerenciaAntesDaRestauracao());
    const depois = soOcultas(regrasDaGerenciaNoBanco());

    expect(antes.size).toBe(depois.size); // 12 = 12 — a contagem nao denuncia
    expect([...depois].filter((p) => !antes.has(p)).sort()).toEqual([...OCULTAS_QUE_ENTRAM].sort());
    expect([...antes].filter((p) => !depois.has(p)).sort()).toEqual([...OCULTAS_QUE_SAEM].sort());
    for (const permissao of [...OCULTAS_QUE_ENTRAM, ...OCULTAS_QUE_SAEM]) {
      expect(permissoesOcultasNaTela.has(permissao as never), permissao).toBe(true);
    }
  });

  it("depois de restaurar o padrao, o save seguinte NAO desfaz a restauracao", () => {
    const listas = listasComCargo(CARGO_GERENCIA, regrasDaGerenciaAntesDaRestauracao());

    const sincronizadas = aplicarRegrasDoAlvoNasListas(
      listas,
      alvoCargo(RESPOSTA_RESTAURACAO.cargoId),
      RESPOSTA_RESTAURACAO.regras
    );
    const payload = payloadDaTela(formDaGerenciaAberto(regrasDaGerenciaNoBanco()), sincronizadas);

    // Ancora: igualdade EXATA. Chave a mais = antiga ressuscitou; a menos = nova foi apagada.
    expect(payload.regras).toEqual(regrasDaGerenciaNoBanco());
    for (const saiu of OCULTAS_QUE_SAEM) expect(payload.regras, saiu).not.toHaveProperty(saiu);
    for (const entrou of OCULTAS_QUE_ENTRAM) expect(payload.regras[entrou], entrou).toBe(true);
    expect(soOcultas(payload.regras)).toEqual(new Set(OCULTAS_DA_GERENCIA));
  });

  it("a sincronizacao SUBSTITUI as regras do alvo, nao mescla com as antigas", () => {
    const sincronizadas = aplicarRegrasDoAlvoNasListas(
      listasComCargo(CARGO_GERENCIA, regrasDaGerenciaAntesDaRestauracao()),
      alvoCargo(CARGO_GERENCIA),
      RESPOSTA_RESTAURACAO.regras
    );

    const linha = sincronizadas.cargosPermissoes.find((item) => item.cargoId === CARGO_GERENCIA);
    // um merge PROFUNDO de `regras` faria `folha_ponto_visualizar` sobreviver — este assert pega
    expect(linha?.regras).toEqual(regrasDaGerenciaNoBanco());
    expect(linha?.regras).not.toHaveProperty(OCULTA_AUSENTE);
  });

  it("sincroniza so o alvo restaurado, sem tocar nos outros", () => {
    const regrasDoCaixa = { entradas_visualizar: true, menu_folha_ponto_mostrar: true };
    const listas: ListasPermissoesPersistidas = {
      cargosPermissoes: [
        { id: CARGO_GERENCIA, cargoId: CARGO_GERENCIA, regras: regrasDaGerenciaAntesDaRestauracao() },
        { id: CARGO_CAIXA, cargoId: CARGO_CAIXA, regras: regrasDoCaixa }
      ],
      setoresPermissoes: [{ id: "s1", setorId: "s1", regras: { relatorio_dre_visualizar: true } }],
      usuariosPermissoes: [{ id: "u1", usuarioId: "u1", regras: { menu_promocoes_mostrar: true } }]
    };

    const depois = aplicarRegrasDoAlvoNasListas(listas, alvoCargo(CARGO_GERENCIA), RESPOSTA_RESTAURACAO.regras);

    expect(depois.cargosPermissoes.find((c) => c.cargoId === CARGO_CAIXA)?.regras).toEqual(regrasDoCaixa);
    expect(depois.setoresPermissoes).toEqual(listas.setoresPermissoes);
    expect(depois.usuariosPermissoes).toEqual(listas.usuariosPermissoes);
  });

  it("cargo que ainda nao tinha linha de regras passa a ter", () => {
    const depois = aplicarRegrasDoAlvoNasListas(listasVazias(), alvoCargo(CARGO_GERENCIA), RESPOSTA_RESTAURACAO.regras);
    const payload = payloadDaTela(formDaGerenciaAberto(regrasDaGerenciaNoBanco()), depois);

    expect(depois.cargosPermissoes).toHaveLength(1);
    for (const oculta of OCULTAS_DA_GERENCIA) expect(payload.regras[oculta], oculta).toBe(true);
  });

  it("sincroniza SETOR e USUARIO na lista correta", () => {
    const doSetor = aplicarRegrasDoAlvoNasListas(
      listasVazias(),
      { tipoPermissao: "setor", cargoId: "", setorId: "s9", usuarioId: "" },
      { relatorio_dre_visualizar: true }
    );
    const doUsuario = aplicarRegrasDoAlvoNasListas(
      listasVazias(),
      { tipoPermissao: "usuario", cargoId: "", setorId: "", usuarioId: "u9" },
      { menu_promocoes_mostrar: true }
    );

    expect(doSetor.setoresPermissoes[0]?.setorId).toBe("s9");
    expect(doSetor.cargosPermissoes).toHaveLength(0);
    expect(doUsuario.usuariosPermissoes[0]?.usuarioId).toBe("u9");
    expect(doUsuario.setoresPermissoes).toHaveLength(0);
  });

  it("alvo sem id devolve as listas inalteradas, sem criar entrada fantasma", () => {
    const listas = listasComCargo(CARGO_GERENCIA, regrasDaGerenciaAntesDaRestauracao());

    const depois = aplicarRegrasDoAlvoNasListas(listas, alvoCargo(""), RESPOSTA_RESTAURACAO.regras);

    expect(depois.cargosPermissoes).toHaveLength(1);
    expect(depois.cargosPermissoes[0]?.regras).toEqual(regrasDaGerenciaAntesDaRestauracao());
  });

  it("sem sincronizar, o save DESFARIA a restauracao — prova que a sincronizacao e load-bearing", () => {
    const obsoletas = listasComCargo(CARGO_GERENCIA, regrasDaGerenciaAntesDaRestauracao());

    const payload = payloadDaTela(formDaGerenciaAberto(regrasDaGerenciaNoBanco()), obsoletas);

    expect(payload.regras[OCULTA_AUSENTE]).toBe(true); // a apagada ressuscita
    expect(payload.regras).not.toHaveProperty("relatorio_dre_visualizar"); // a concedida some
  });
});

describe("sincronizacao nao depende de `id` (fidelidade ao payload real)", () => {
  // O servidor manda apenas `{ cargoId, regras }` — sem `id` (permissoes.repository.ts). Uma
  // sincronizacao que casasse por `id` sobrescreveria o primeiro item sem id da lista, ou seja,
  // as regras de um cargo QUALQUER. As demais fixtures deste arquivo tem `id` e nao pegariam isso.
  // Os dois itens tem o MESMO `id` de proposito: casamento por `id` (ou por posicao) sempre
  // acertaria o primeiro. So casar por `cargoId` passa neste bloco.
  const semId: ListasPermissoesPersistidas = {
    cargosPermissoes: [
      { id: "", cargoId: CARGO_GERENCIA, regras: { promocoes_visualizar: true } },
      { id: "", cargoId: CARGO_CAIXA, regras: { menu_promocoes_mostrar: true } }
    ],
    setoresPermissoes: [],
    usuariosPermissoes: []
  };

  it("casa pelo id do ALVO, nunca por posicao nem por `id` ausente", () => {
    const depois = aplicarRegrasDoAlvoNasListas(semId, alvoCargo(CARGO_CAIXA), { relatorio_dre_visualizar: true });

    expect(depois.cargosPermissoes.find((c) => c.cargoId === CARGO_CAIXA)?.regras).toEqual({
      relatorio_dre_visualizar: true
    });
    // o primeiro da lista (Gerencia) fica intacto — seria ele o atingido por casamento errado
    expect(depois.cargosPermissoes.find((c) => c.cargoId === CARGO_GERENCIA)?.regras).toEqual({
      promocoes_visualizar: true
    });
  });

  it("o merge le corretamente uma lista sem `id`", () => {
    const depois = aplicarRegrasDoAlvoNasListas(semId, alvoCargo(CARGO_GERENCIA), { relatorio_dre_visualizar: true });

    const payload = payloadDaTela(formDaGerenciaAberto({ entradas_visualizar: true }), depois);
    expect(payload.regras["relatorio_dre_visualizar"]).toBe(true);
  });
});
