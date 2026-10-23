import { describe, expect, it } from "vitest";
import {
  CAMPOS_BLOQUEADOS_QUESTOR,
  CAMPOS_PADRAO_EMPRESA_QUESTOR,
  LAYOUT_ADMISSAO_QUESTOR,
  avaliarProntidaoQuestor,
  codigoQuestorPayloadSchema,
  configuracaoQuestorPayloadSchema,
  contratoQuestorPayloadSchema,
  dominioDoCampoQuestor,
  formatarValorQuestor,
  funcaoQuestorPayloadSchema,
  montarContratoQuestor,
  prepararArquivoAdmissaoQuestor,
  referenciasDaConfiguracaoQuestor,
  referenciasDoContratoQuestor,
  turnoQuestorPayloadSchema,
  verificarCodigosNoCatalogoQuestor,
  type ParametrosQuestorSnapshot,
  type SnapshotAdmissaoPralis
} from "../../shared/src/conplus/index.js";

/**
 * E2/E3/E4 sem banco: contratos, regras e o efeito no TXT/prévia. Todos os códigos aqui são
 * FICTÍCIOS (9xx) — os reais vêm da Conplus, por empresa.
 */

const PADROES_FICTICIOS = {
  CODIGOTIPOCONTR: "901",
  CODIGOSIND: "902",
  OPTANTEFGTS: "1",
  SINDICALIZADO: "0",
  DESCMENSSIND: "0",
  DESCCUSTCONFED: "0",
  DESCTAXAASSIST: "0",
  DESCONTAREVSAL: "0",
  DESCANOADMISSAO: "0",
  CLAUSULAASSEGRESC: "0",
  RECEBEADTO: "1",
  RECEBE13SAL: "1",
  MODOPGTO: "3",
  PARTICPAT: "0",
  UTILIZAQCOLABORE: "0",
  FORMACONTROLEIR: "1"
};

function parametrosCompletos(): ParametrosQuestorSnapshot {
  return {
    configuracao: { codigoEstabelecimento: 903, classificacaoOrganograma: "9.9", padroes: PADROES_FICTICIOS },
    contrato: {
      questorTipoSalario: 1,
      salarioCentavos: 151800,
      descricaoSalario: null,
      diasExperiencia: 45,
      diasProrrogacao: 45,
      questorTipoContrato: null,
      questorSindicato: null,
      questorTipoAdmissao: 1,
      pcdCotista: false,
      utilizaCtpsDigital: true,
      possuiAlvara: false,
      jaExpostoAgenteNocivo: false
    },
    funcao: { questorCodigoCargo: "904", questorAgenteNocivo: "00" },
    turno: { questorCodigoEscala: "905", questorTipoJornada: 3, questorTempoParcial: 0, questorRegimeJornada: 1 }
  };
}

function snapshot(questor?: ParametrosQuestorSnapshot): SnapshotAdmissaoPralis {
  return {
    empresa: { cnpj: "11222333000181" },
    processo: { nomeCompleto: "Pessoa Ficticia", cpf: "12345678909" },
    internos: {
      dataAdmissao: "2026-09-27",
      ctpsNumero: "1234567",
      ctpsSerie: "0001",
      ctpsUf: "MG",
      pisPasepNit: "12345678901"
    },
    ficha: {
      nomeSocial: null,
      nascimento: "2000-05-05",
      sexo: "Feminino",
      estadoCivil: "Solteiro(a)",
      racaCor: "Parda",
      grauInstrucao: "Ensino médio completo",
      nacionalidade: "Brasileira",
      nomeMae: "Mae Ficticia",
      nomePai: null,
      cep: "36037467",
      logradouro: "Rua Ficticia",
      numero: "54",
      complemento: null,
      bairro: "Bairro Ficticio",
      uf: "MG",
      email: null,
      rgNumero: null,
      rgUf: null,
      rgEmissao: null,
      tituloEleitor: null,
      tituloZona: null,
      tituloSecao: null
    },
    dependentes: [
      { nomeCompleto: "Dependente Um", nascimento: "2020-01-10", parentesco: "Filho(a)", cpf: null },
      { nomeCompleto: "Dependente Dois", nascimento: "2018-03-02", parentesco: "Filho(a)", cpf: null }
    ],
    ...(questor ? { questor } : {})
  };
}

describe("E2 — catálogo de códigos Questor", () => {
  it("o tamanho do código vem do campo do layout que ele alimenta", () => {
    const valido = (tabela: string, codigo: string) =>
      codigoQuestorPayloadSchema.safeParse({ tabela, codigo, descricao: "Descricao ficticia" }).success;
    expect(valido("tipo_contrato", "999")).toBe(true);
    expect(valido("tipo_contrato", "1000")).toBe(false); // CODIGOTIPOCONTR: Inteiro 3
    expect(valido("sindicato", "99999")).toBe(true);
    expect(valido("sindicato", "100000")).toBe(false); // CODIGOSIND: Inteiro 5
    expect(valido("cargo", "9999999")).toBe(true);
    expect(valido("cargo", "10000000")).toBe(false); // CODIGOCARGO: Inteiro 7
    expect(valido("escala", "1000000")).toBe(false); // CODIGOESCALA: Inteiro 6
    expect(valido("cargo", "12A")).toBe(false);
    expect(valido("evento", "1")).toBe(false); // eventos ficam para a E7
    expect(codigoQuestorPayloadSchema.safeParse({ tabela: "cargo", codigo: "1", descricao: " " }).success).toBe(false);
  });

  it("referência a código fora do catálogo ou desativado é apontada; vazio não é erro", () => {
    const catalogo = [
      { tabela: "sindicato" as const, codigo: "902", ativo: true },
      { tabela: "tipo_contrato" as const, codigo: "901", ativo: false }
    ];
    expect(
      verificarCodigosNoCatalogoQuestor(catalogo, [
        ...referenciasDaConfiguracaoQuestor({ padroes: { CODIGOTIPOCONTR: "901", CODIGOSIND: "902" } }),
        ...referenciasDoContratoQuestor({ questorTipoContrato: null, questorSindicato: "777" })
      ])
    ).toEqual([
      { caminho: "padroes.CODIGOTIPOCONTR", mensagem: 'Código 901 do catálogo "tipo_contrato" está desativado' },
      { caminho: "questorSindicato", mensagem: 'Código 777 não está no catálogo "sindicato" da empresa' }
    ]);
    // O mesmo código, mas no catálogo de OUTRA tabela, não vale.
    expect(
      verificarCodigosNoCatalogoQuestor(
        [{ tabela: "cargo", codigo: "902", ativo: true }],
        referenciasDoContratoQuestor({ questorTipoContrato: null, questorSindicato: "902" })
      )
    ).toHaveLength(1);
  });
});

describe("E2 — configuração Questor da empresa", () => {
  const configurar = (dados: Record<string, unknown>) =>
    configuracaoQuestorPayloadSchema.safeParse({
      versao: 1,
      codigoEstabelecimento: null,
      classificacaoOrganograma: null,
      utilizaHoraCentesimal: null,
      padroes: {},
      ...dados
    });

  it("aceita configuração vazia: nada não confirmado precisa ser inventado", () => {
    const vazia = configurar({});
    expect(vazia.success).toBe(true);
    expect(vazia.data).toMatchObject({
      codigoEstabelecimento: null,
      classificacaoOrganograma: null,
      utilizaHoraCentesimal: null,
      padroes: {}
    });
  });

  it("aceita os padrões fictícios dentro do domínio oficial", () => {
    expect(
      configurar({ codigoEstabelecimento: 903, classificacaoOrganograma: "9.9", padroes: PADROES_FICTICIOS }).success
    ).toBe(true);
    // DESCANOADMISSAO tem a opção "=2" na documentação.
    expect(configurar({ padroes: { DESCANOADMISSAO: "2" } }).success).toBe(true);
  });

  it("recusa campo que não é da empresa, valor fora do domínio e limites do layout", () => {
    const erro = (dados: Record<string, unknown>) =>
      configurar(dados).error?.issues.map((issue) => issue.path.join("."));
    expect(erro({ padroes: { TERMOCONSENTIMENTO: "2" } })).toEqual(["padroes.TERMOCONSENTIMENTO"]);
    expect(erro({ padroes: { CATEGESOCIAL: "101" } })).toEqual(["padroes.CATEGESOCIAL"]);
    expect(erro({ padroes: { OPTANTEFGTS: "2" } })).toEqual(["padroes.OPTANTEFGTS"]);
    expect(erro({ padroes: { MODOPGTO: "4" } })).toEqual(["padroes.MODOPGTO"]);
    expect(erro({ padroes: { CODIGOSIND: "123456" } })).toEqual(["padroes.CODIGOSIND"]);
    expect(erro({ codigoEstabelecimento: 100000 })).toEqual(["codigoEstabelecimento"]);
    expect(erro({ classificacaoOrganograma: "x".repeat(21) })).toEqual(["classificacaoOrganograma"]);
  });

  it("todo campo com padrão da empresa existe no layout e nenhum é bloqueado", () => {
    for (const { registro, campo } of CAMPOS_PADRAO_EMPRESA_QUESTOR) {
      expect(
        LAYOUT_ADMISSAO_QUESTOR[registro].some((item) => item.campo === campo),
        campo
      ).toBe(true);
      expect(CAMPOS_BLOQUEADOS_QUESTOR[registro]).not.toContain(campo);
    }
  });
});

describe("E3 — função e turno", () => {
  it("usam os domínios oficiais de agente nocivo e jornada", () => {
    expect(dominioDoCampoQuestor("B", "AGENTENOCIVO")).toEqual(["00", "15", "20", "25"]);
    expect(funcaoQuestorPayloadSchema.safeParse({ questorCodigoCargo: "904", questorAgenteNocivo: "15" }).success).toBe(
      true
    );
    expect(funcaoQuestorPayloadSchema.safeParse({ questorAgenteNocivo: "10" }).success).toBe(false);
    expect(funcaoQuestorPayloadSchema.parse({})).toEqual({ questorCodigoCargo: null, questorAgenteNocivo: null });
    expect(
      turnoQuestorPayloadSchema.safeParse({ questorTipoJornada: 3, questorTempoParcial: 0, questorRegimeJornada: 1 })
        .success
    ).toBe(true);
    expect(turnoQuestorPayloadSchema.safeParse({ questorTipoJornada: 1 }).success).toBe(false); // 1 não existe na doc
    expect(turnoQuestorPayloadSchema.safeParse({ questorTempoParcial: 4 }).success).toBe(false);
    expect(turnoQuestorPayloadSchema.safeParse({ questorRegimeJornada: 5 }).success).toBe(false);
  });
});

describe("E4 — dados contratuais do DP", () => {
  const contratar = (dados: Record<string, unknown>) => contratoQuestorPayloadSchema.safeParse({ versao: 1, ...dados });

  it("aceita tudo nulo e os valores dentro do layout", () => {
    expect(contratar({}).success).toBe(true);
    expect(
      contratar({
        questorTipoSalario: 5,
        salarioCentavos: 151800,
        diasExperiencia: 45,
        diasProrrogacao: 45,
        questorTipoAdmissao: 1
      }).success
    ).toBe(true);
  });

  it("exige descrição do salário para Comissão/Variável (2) e Tarefa (6)", () => {
    expect(contratar({ questorTipoSalario: 2 }).error?.issues[0]?.path).toEqual(["descricaoSalario"]);
    expect(contratar({ questorTipoSalario: 6, descricaoSalario: "Por peca" }).success).toBe(true);
  });

  it("recusa domínio e tamanho fora do layout", () => {
    expect(contratar({ questorTipoSalario: 3 }).success).toBe(false);
    expect(contratar({ salarioCentavos: 0 }).success).toBe(false);
    expect(contratar({ salarioCentavos: 1_000_000_000_000_000 }).success).toBe(false);
    expect(contratar({ diasExperiencia: 100000 }).success).toBe(false); // Inteiro 5
    expect(contratar({ diasProrrogacao: 10000 }).success).toBe(false); // Inteiro 4
    expect(contratar({ questorTipoAdmissao: 8 }).success).toBe(false);
    expect(contratar({ questorTipoContrato: "1234" }).success).toBe(false);
  });
});

describe("parâmetros no TXT e na prévia", () => {
  it("formata valor com vírgula decimal e sem milhar", () => {
    expect(formatarValorQuestor(151800)).toBe("1518,00");
    expect(formatarValorQuestor(5)).toBe("0,05");
    expect(formatarValorQuestor(123456789)).toBe("1234567,89");
  });

  it("aplica padrões da empresa, cadastros e contrato; o contrato do DP prevalece", () => {
    const parametros = parametrosCompletos();
    parametros.contrato = { ...parametros.contrato!, questorSindicato: "907" };
    const { contrato } = montarContratoQuestor(snapshot(parametros));
    expect(contrato.A).toMatchObject({
      CODIGOTIPOCONTR: "901",
      CODIGOSIND: "907",
      CODIGOCARGO: "904",
      TIPOSALARIO: "1",
      VALORSAL: "1518,00",
      DIACONTREXP: "45"
    });
    expect(contrato.B).toMatchObject({
      CODIGOESTAB: "903",
      CLASSIFORGAN: "9.9",
      CODIGOESCALA: "905",
      TIPOJORNADA: "3",
      AGENTENOCIVO: "00",
      UTILIZACARTEIRADIGITAL: "1",
      DEFCOTA: "0",
      MODOPGTO: "3"
    });
    // Padrão do registro D vai para TODOS os dependentes.
    expect(contrato.dependentes?.map((dependente) => dependente["FORMACONTROLEIR"])).toEqual(["1", "1"]);
  });

  it("parâmetro nulo deixa o campo vazio — nunca inventa", () => {
    const vazios: ParametrosQuestorSnapshot = {
      configuracao: { codigoEstabelecimento: null, classificacaoOrganograma: null, padroes: {} },
      contrato: null,
      funcao: { questorCodigoCargo: null, questorAgenteNocivo: null },
      turno: null
    };
    const { contrato } = montarContratoQuestor(snapshot(vazios));
    for (const campo of ["CODIGOESTAB", "CLASSIFORGAN", "OPTANTEFGTS", "AGENTENOCIVO"])
      expect(contrato.B[campo]).toBeUndefined();
    const dto = avaliarProntidaoQuestor({
      processoId: "11111111-1111-4111-8111-111111119f10",
      snapshot: snapshot(vazios),
      geradoEm: new Date(0)
    });
    const b = dto.registros.find((item) => item.registro === "B")!;
    // A fonte existe (configuração cadastrada), só está vazia: a mensagem muda.
    expect(b.campos.find((item) => item.campo === "OPTANTEFGTS")?.motivo).toBe(
      "Não preenchido no Pralís para este processo"
    );
  });

  it("com E2–E4 completos, sobram 25 pendências — nenhuma do DP nem da empresa", () => {
    const dto = avaliarProntidaoQuestor({
      processoId: "11111111-1111-4111-8111-111111119f10",
      snapshot: snapshot(parametrosCompletos()),
      geradoEm: new Date(0)
    });
    expect(dto.resumo).toMatchObject({
      requeridos: 85 + 13,
      pendentes: 25 + 6,
      invalidos: 0,
      porOrigem: { candidato: 23, dp: 0, empresa: 0, codigo_questor: 1, externo: 7 }
    });
    const pendentes = dto.registros
      .filter((registro) => registro.dependente === null || registro.dependente === 0)
      .flatMap((registro) =>
        registro.campos
          .filter((campo) => campo.situacao === "pendente")
          .map((campo) => `${registro.registro}.${campo.campo}`)
      );
    expect(pendentes).toHaveLength(25);
    expect(pendentes.filter((item) => item.startsWith("A."))).toEqual([
      "A.TERMOCONSENTIMENTO",
      "A.GERARPRELIMINAR",
      "A.CATEGESOCIAL",
      "A.CATEGORIA"
    ]);
    expect(dto.aptoParaExportacao).toBe(false);
    expect(dto.exportacaoDisponivel).toBe(false);
  });

  it("o TXT continua inválido para uso real e os campos ambíguos continuam vazios", () => {
    const arquivo = prepararArquivoAdmissaoQuestor([snapshot(parametrosCompletos())]);
    expect(arquivo.valido).toBe(false);
    expect(arquivo.diagnosticos.every((item) => item.codigo === "OBRIGATORIO")).toBe(true);
    const c = arquivo.linhas[2]!.split(";");
    expect([c[63], c[66]]).toEqual(["", ""]); // ORGAOEMISSORRNE (64) e INDAPREND (67)
    for (const linha of arquivo.linhas.filter((item) => item.startsWith("D;"))) expect(linha.split(";")[31]).toBe(""); // ENTREGACERT (32)
  });
});
