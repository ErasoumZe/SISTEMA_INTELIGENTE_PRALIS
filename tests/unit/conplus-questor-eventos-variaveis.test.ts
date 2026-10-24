import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formatarDecimalQuestor,
  LAYOUT_EVENTO_VARIAVEL,
  lerArquivoEventosVariaveis,
  lerCatalogoEventosConplus,
  montarLinhaEventoVariavel,
  normalizarRazaoSocialQuestor,
  questorEventosVariaveisTecnicoSchema,
  questorExportacaoAdmissaoTecnicoSchema,
  questorLancamentoCancelamentoSchema,
  prepararArquivoEventosVariaveis,
  questorCatalogoImportacaoSchema,
  questorEventosVariaveisCatalogoSchema,
  questorEventosVariaveisGeracaoSchema,
  questorEventosVariaveisLancamentoSchema,
  validarArquivoEventosVariaveis,
  type LancamentoParaArquivoQuestor,
  type ParametrosArquivoEventos
} from "../../shared/src/conplus/index.js";

/**
 * Layout OFICIAL de eventos variáveis enviado pela Conplus em 22/10/2026 (EventoVariavel.nli, manual e
 * exemplo). Os arquivos estão em `tests/fixtures/conplus-oficial/eventos/`, byte a byte como recebidos.
 * Códigos de empresa, período e contrato nos testes são fictícios.
 */
const oficial = (nome: string, codificacao: BufferEncoding = "utf8") =>
  readFileSync(fileURLToPath(new URL(`../fixtures/conplus-oficial/eventos/${nome}`, import.meta.url)), codificacao);

const EXEMPLO = "Eventos 510 - teste ficticio.csv";

const base: LancamentoParaArquivoQuestor = {
  id: "l1",
  competencia: "2025-05-01",
  colaboradorNome: "Pessoa Ficticia",
  matricula: "PAD-000001",
  questorCodigoContrato: "1",
  eventoCodigo: "318",
  eventoAtivo: true,
  eventoUnidades: ["H"],
  unidade: "H",
  valor: "8.0000"
};
const parametros: ParametrosArquivoEventos = {
  codigoEmpresa: "510",
  codigoPeriodoCalculo: "2505",
  sequenciaInicial: 99,
  sequenciasUsadas: new Map(),
  utilizaHoraCentesimal: true
};

describe("layout oficial (EventoVariavel.nli)", () => {
  it("o NLI tem exatamente as colunas, tamanhos e precisões do módulo", () => {
    const nli = oficial("EventoVariavel.nli");
    const campos = [
      ...nli.matchAll(
        /FieldName = '(\w+)'\s+PosicaoInicio = \d+\s+Tamanho = (\d+)\s+Precisao = (\d+)\s+Coluna = (\d+)/gu
      )
    ]
      .map((achado) => ({
        campo: achado[1],
        tamanho: Number(achado[2]),
        precisao: Number(achado[3]),
        coluna: Number(achado[4])
      }))
      .filter((campo) => campo.coluna > 0);
    expect(campos).toEqual(
      LAYOUT_EVENTO_VARIAVEL.slice(1).map(({ campo, tamanho, precisao, coluna }) => ({
        campo,
        tamanho,
        precisao,
        coluna
      }))
    );
    expect(nli).toContain("Separador = ';'");
    expect(nli).toContain("SeparadorDecimal = ','");
    expect(nli).toContain("IdentificadorRegistro = 'E'");
    expect(nli).toContain("Indice = 'codigoempresa;codigopercalculo;seq;codigofunccontr'");
  });

  it("ler e remontar o exemplo oficial reproduz o arquivo byte a byte (CR+LF incluído)", () => {
    const texto = oficial(EXEMPLO);
    expect(validarArquivoEventosVariaveis(texto)).toEqual([]);
    const remontado = lerArquivoEventosVariaveis(texto)
      .map((linha) => `${montarLinhaEventoVariavel(linha)}\r\n`)
      .join("");
    expect(remontado).toBe(texto);
  });

  it("o Pralís gera exatamente a linha do exemplo a partir de um lançamento equivalente", () => {
    const arquivo = prepararArquivoEventosVariaveis("2025-05-01", [base], parametros);
    expect(arquivo).toMatchObject({ valido: true, pendencias: [], diagnosticos: [] });
    expect(arquivo.conteudo).toBe(oficial(EXEMPLO));
    expect(arquivo.linhas).toEqual([{ lancamentoId: "l1", codigoContrato: "1", sequencia: 99 }]);
  });
});

describe("validação do arquivo", () => {
  const valida = "E;510;2505;99;1;318;8,00;0,00;;;;;0;\r\n";
  const erros = (texto: string) => validarArquivoEventosVariaveis(texto).map((item) => item.mensagem);

  it("arquivo vazio, sem CR+LF e com caractere não ASCII são recusados", () => {
    expect(erros("")).toEqual(["Arquivo vazio"]);
    expect(erros(valida.replace("\r\n", "\n"))).toContain("Linhas devem terminar com CR+LF");
    expect(erros(valida.replace("E;510", "E;5é0"))).toContain("Arquivo deve conter só caracteres ASCII");
  });

  it("campo ausente, código inválido, tamanho e decimal errados são apontados com a coluna", () => {
    expect(erros("E;;2505;99;1;318;8,00;0,00;;;;;0;\r\n")).toContain("Coluna 2 (codigoempresa) é obrigatória");
    expect(erros("E;510;2505;99;1;31A;8,00;0,00;;;;;0;\r\n")).toContain(
      "Coluna 6 (codigoevento) deve ser número inteiro"
    );
    expect(erros("E;5100000;2505;99;1;318;8,00;0,00;;;;;0;\r\n")).toContain(
      "Coluna 2 (codigoempresa) passa de 6 dígitos"
    );
    expect(erros("E;510;2505;99;1;318;8.00;0,00;;;;;0;\r\n")).toContain(
      "Coluna 7 (referevento) deve ter vírgula e 2 casas decimais, sem milhar"
    );
    expect(erros("E;510;2505;99;1;318;1.000,00;0,00;;;;;0;\r\n")).toHaveLength(1);
    expect(erros("E;510;2505;0;1;318;8,00;0,00;;;;;0;\r\n")).toContain("Sequência deve ser maior que zero");
    expect(erros("E;510;2505;99;1;318;8,00;0,00;;;;;2;\r\n")).toContain("Coluna 13 aceita 0 ou 1");
  });

  it("linha sem o ; final ou com coluna a menos é erro de estrutura", () => {
    expect(erros("E;510;2505;99;1;318;8,00;0,00;;;;;0\r\n")[0]).toMatch(/13 colunas/u);
    expect(erros("E;510;2505;99;1;318;8,00;;;;;0;\r\n")[0]).toMatch(/13 colunas/u);
  });

  it("empresa + período + sequência + contrato repetidos (chave do Questor) é duplicidade", () => {
    const repetida = valida + "E;510;2505;99;1;35;1,00;0,00;;;;;0;\r\n";
    expect(validarArquivoEventosVariaveis(repetida)).toEqual([
      {
        linha: 2,
        coluna: 4,
        codigo: "DUPLICIDADE",
        mensagem: "Empresa, período, sequência e contrato repetem a linha 1"
      }
    ]);
    // Mesma sequência em OUTRO contrato não repete a chave.
    expect(validarArquivoEventosVariaveis(valida + "E;510;2505;99;2;35;1,00;0,00;;;;;0;\r\n")).toEqual([]);
  });
});

describe("lançamentos do Pralís → arquivo", () => {
  it("H e R vão na coluna 7 (referência); V vai na 8 (valor); a coluna não usada leva 0,00", () => {
    const arquivo = prepararArquivoEventosVariaveis(
      "2025-05-01",
      [
        { ...base, id: "a", eventoCodigo: "35", valor: "1.5" },
        { ...base, id: "b", eventoCodigo: "1073", eventoUnidades: ["R"], unidade: "R", valor: "2" },
        { ...base, id: "c", eventoCodigo: "708", eventoUnidades: ["V"], unidade: "V", valor: "150.5" }
      ],
      parametros
    );
    expect(arquivo.conteudo.split("\r\n")).toEqual([
      "E;510;2505;99;1;35;1,50;0,00;;;;;0;",
      "E;510;2505;100;1;708;0,00;150,50;;;;;0;",
      "E;510;2505;101;1;1073;2,00;0,00;;;;;0;",
      ""
    ]);
  });

  it("sequência é por contrato e continua depois da maior já usada em arquivo oficial do período", () => {
    const arquivo = prepararArquivoEventosVariaveis(
      "2025-05-01",
      [
        { ...base, id: "a", questorCodigoContrato: "7", eventoCodigo: "35" },
        { ...base, id: "b", questorCodigoContrato: "7", eventoCodigo: "36" },
        { ...base, id: "c", questorCodigoContrato: "12", eventoCodigo: "35" }
      ],
      { ...parametros, sequenciaInicial: 1, sequenciasUsadas: new Map([["7", 4]]) }
    );
    expect(arquivo.linhas).toEqual([
      { lancamentoId: "a", codigoContrato: "7", sequencia: 5 },
      { lancamentoId: "b", codigoContrato: "7", sequencia: 6 },
      { lancamentoId: "c", codigoContrato: "12", sequencia: 1 }
    ]);
  });

  it("pendências do Pralís bloqueiam o arquivo e dizem quem resolve", () => {
    const arquivo = prepararArquivoEventosVariaveis(
      "2025-05-01",
      [
        { ...base, id: "a", questorCodigoContrato: null },
        { ...base, id: "b", competencia: "2025-04-01", matricula: "PAD-000002", questorCodigoContrato: "2" },
        { ...base, id: "c", eventoAtivo: false, matricula: "PAD-000003", questorCodigoContrato: "3" },
        { ...base, id: "d", eventoUnidades: ["V"], matricula: "PAD-000004", questorCodigoContrato: "4" },
        { ...base, id: "e", valor: "1.255", matricula: "PAD-000005", questorCodigoContrato: "5" }
      ],
      { ...parametros, codigoEmpresa: null, utilizaHoraCentesimal: null }
    );
    expect(arquivo).toMatchObject({ valido: false, conteudo: "", linhas: [] });
    expect(arquivo.pendencias).toEqual([
      "Informe o código da empresa no Questor em Configuração Questor",
      'Configure "Utiliza Hora Centesimal" da empresa em Configuração Questor',
      "Pessoa Ficticia (PAD-000001): sem código de contrato Questor (Configuração Questor → Contratos no Questor)",
      "Pessoa Ficticia (PAD-000002): lançamento de outra competência (2025-04-01)",
      "Pessoa Ficticia (PAD-000003): evento 318 está desativado",
      "Pessoa Ficticia (PAD-000004): evento 318 não aceita a letra H",
      "Pessoa Ficticia (PAD-000005): valor 1.255 tem mais de 2 casas decimais"
    ]);
  });

  it("hora com minutos ≥ 60 é recusada quando a empresa não usa hora centesimal", () => {
    const lancamento = { ...base, valor: "1.75" };
    expect(
      prepararArquivoEventosVariaveis("2025-05-01", [lancamento], { ...parametros, utilizaHoraCentesimal: false })
        .valido
    ).toBe(false);
    expect(prepararArquivoEventosVariaveis("2025-05-01", [lancamento], parametros).valido).toBe(true);
  });

  it("sem lançamento não há arquivo", () => {
    expect(prepararArquivoEventosVariaveis("2025-05-01", [], parametros)).toMatchObject({
      valido: false,
      pendencias: ["Selecione ao menos um lançamento"]
    });
  });

  it("decimal do banco vira 2 casas com vírgula; mais de 2 casas significativas é recusado", () => {
    expect(formatarDecimalQuestor("8.0000")).toBe("8,00");
    expect(formatarDecimalQuestor("150.5000")).toBe("150,50");
    expect(formatarDecimalQuestor("0007")).toBe("7,00");
    expect(formatarDecimalQuestor("1.2345")).toBeNull();
  });
});

describe("catálogo oficial por empresa", () => {
  const consolidado = oficial("eventos_variaveis_por_empresa.csv");

  it("lê o consolidado (UTF-8 com BOM): 3 empresas, 38 eventos, sem erro", () => {
    const { eventos, erros } = lerCatalogoEventosConplus(consolidado);
    expect(erros).toEqual([]);
    expect([...new Set(eventos.map((evento) => evento.empresa))]).toEqual([
      "BURPIZ LTDA",
      "COMERCIAL LISBOA ALIMENTOS LTDA",
      "COMERCIAL TUDONUPAO LTDA"
    ]);
    const contagem = (empresa: string) => eventos.filter((evento) => evento.empresa === empresa).length;
    expect([
      contagem("COMERCIAL TUDONUPAO LTDA"),
      contagem("COMERCIAL LISBOA ALIMENTOS LTDA"),
      contagem("BURPIZ LTDA")
    ]).toEqual([14, 15, 9]);
    expect(eventos.find((evento) => evento.empresa === "BURPIZ LTDA" && evento.codigo === "800")).toMatchObject({
      unidade: "V",
      natureza: "Desconto",
      sequencia: 2
    });
  });

  it("os arquivos por empresa (ISO-8859-1) batem com o consolidado em código, descrição e sequência", () => {
    const { eventos } = lerCatalogoEventosConplus(consolidado);
    for (const [arquivo, empresa] of [
      ["eventos_tnp.csv", "COMERCIAL TUDONUPAO LTDA"],
      ["eventos_lisboa.csv", "COMERCIAL LISBOA ALIMENTOS LTDA"],
      ["eventos_burpiz.csv", "BURPIZ LTDA"]
    ] as const) {
      const linhas = oficial(arquivo, "latin1").split("\r\n").slice(1).filter(Boolean);
      const individuais = linhas.map((linha) => {
        const [codigo, descricao, sequencia] = linha.split(";").map((parte) => parte.replaceAll('"', ""));
        return { codigo, descricao, sequencia: Number(sequencia) };
      });
      expect(individuais, arquivo).toEqual(
        eventos
          .filter((evento) => evento.empresa === empresa)
          .map(({ codigo, descricao, sequencia }) => ({ codigo, descricao, sequencia }))
      );
    }
  });

  it("cabeçalho diferente (ex.: arquivo por empresa, sem H/R/V) é recusado com mensagem clara", () => {
    const resultado = lerCatalogoEventosConplus(oficial("eventos_tnp.csv", "latin1"));
    expect(resultado.eventos).toEqual([]);
    expect(resultado.erros[0]).toMatch(/^Cabeçalho esperado/u);
  });
});

describe("contratos de entrada", () => {
  const id = "00000000-0000-4000-8000-000000000003";

  it("evento até 5 dígitos; valor até 2 casas; competência no dia 1", () => {
    expect(
      questorEventosVariaveisCatalogoSchema.safeParse({ codigo: "123456", descricao: "x", unidades: ["H"] }).success
    ).toBe(false);
    const lancamento = { competencia: "2026-10-01", vinculoId: id, eventoId: id, unidade: "V", valor: "10.5" };
    expect(questorEventosVariaveisLancamentoSchema.safeParse(lancamento).success).toBe(true);
    for (const errado of [{ valor: "1.234" }, { valor: "0" }, { valor: "10,5" }, { competencia: "2026-10-15" }]) {
      expect(
        questorEventosVariaveisLancamentoSchema.safeParse({ ...lancamento, ...errado }).success,
        JSON.stringify(errado)
      ).toBe(false);
    }
  });

  it("geração exige período do Questor (até 11 dígitos) e sequência inicial; recusa ids repetidos", () => {
    const pedido = {
      competencia: "2026-10-01",
      codigoPeriodoCalculo: "2610",
      sequenciaInicial: 99,
      lancamentoIds: [id]
    };
    expect(questorEventosVariaveisGeracaoSchema.safeParse(pedido).success).toBe(true);
    for (const errado of [
      { codigoPeriodoCalculo: "10/2026" },
      { codigoPeriodoCalculo: "123456789012" },
      { sequenciaInicial: 0 },
      { lancamentoIds: [id, id] },
      { motivoRegeracao: "x" }
    ]) {
      expect(
        questorEventosVariaveisGeracaoSchema.safeParse({ ...pedido, ...errado }).success,
        JSON.stringify(errado)
      ).toBe(false);
    }
  });

  it("importação do catálogo recusa campo desconhecido", () => {
    expect(questorCatalogoImportacaoSchema.safeParse({ conteudo: "x", empresaId: "y" }).success).toBe(false);
  });
});

describe("Tarefa 15 — identidade do catálogo e confirmação do técnico", () => {
  it("razão social: ignora acento, caixa e espaços; nomes diferentes continuam diferentes", () => {
    expect(normalizarRazaoSocialQuestor("Comercial  Tudonupão Ltda")).toBe("COMERCIAL TUDONUPAO LTDA");
    expect(normalizarRazaoSocialQuestor(" burpiz ltda ")).toBe("BURPIZ LTDA");
    expect(normalizarRazaoSocialQuestor("BURPIZ LTDA")).not.toBe(normalizarRazaoSocialQuestor("BURPIZ LTDA-Matriz"));
  });

  it("arquivo técnico só passa com confirmacaoArquivoTecnico = true", () => {
    const id = "00000000-0000-4000-8000-000000000003";
    const pedido = {
      competencia: "2026-10-01",
      codigoPeriodoCalculo: "2610",
      sequenciaInicial: 1,
      lancamentoIds: [id]
    };
    expect(questorEventosVariaveisTecnicoSchema.safeParse(pedido).success).toBe(false);
    expect(
      questorEventosVariaveisTecnicoSchema.safeParse({ ...pedido, confirmacaoArquivoTecnico: false }).success
    ).toBe(false);
    expect(questorEventosVariaveisTecnicoSchema.safeParse({ ...pedido, confirmacaoArquivoTecnico: true }).success).toBe(
      true
    );
    expect(questorExportacaoAdmissaoTecnicoSchema.safeParse({ processoIds: [id] }).success).toBe(false);
    expect(questorLancamentoCancelamentoSchema.safeParse({ motivo: "ok" }).success).toBe(false);
  });
});
