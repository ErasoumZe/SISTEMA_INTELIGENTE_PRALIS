import { describe, expect, it } from "vitest";
import {
  LAYOUT_ADMISSAO_QUESTOR,
  OPCOES_E5_QUESTOR,
  TABELAS_DE_PARA_QUESTOR,
  avaliarProntidaoQuestor,
  converterRotuloQuestor,
  dependenteE5ComunsSchema,
  dependenteE5SensiveisSchema,
  fichaE5ComunsSchema,
  fichaE5SensiveisSchema,
  montarContratoQuestor,
  type ParametrosQuestorSnapshot,
  type SnapshotAdmissaoPralis
} from "../../shared/src/conplus/index.js";

/** E5 — dados todos FICTÍCIOS. */
const dominio = (registro: "B" | "D", campo: string) =>
  LAYOUT_ADMISSAO_QUESTOR[registro].find((item) => item.campo === campo)!.dominio!;

function base(): SnapshotAdmissaoPralis {
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
    dependentes: [{ nomeCompleto: "Dependente Ficticio", nascimento: "2020-01-10", parentesco: "Filho(a)", cpf: null }]
  };
}

const parametros = (tipoAdmissao: number | null): ParametrosQuestorSnapshot => ({
  configuracao: {
    codigoEstabelecimento: 903,
    classificacaoOrganograma: "9.9",
    padroes: {
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
    }
  },
  contrato: {
    questorTipoSalario: 1,
    salarioCentavos: 151800,
    descricaoSalario: null,
    diasExperiencia: 45,
    diasProrrogacao: 45,
    questorTipoContrato: null,
    questorSindicato: null,
    questorTipoAdmissao: tipoAdmissao,
    pcdCotista: false,
    utilizaCtpsDigital: true,
    possuiAlvara: false,
    jaExpostoAgenteNocivo: false
  },
  funcao: { questorCodigoCargo: "904", questorAgenteNocivo: "00" },
  turno: { questorCodigoEscala: "905", questorTipoJornada: 3, questorTempoParcial: 0, questorRegimeJornada: 1 }
});

const e5Completo = (): NonNullable<SnapshotAdmissaoPralis["e5"]> => ({
  titular: {
    naturalidadeUf: "MG",
    naturalidadeMunicipioIbge: "3106200",
    municipioIbge: "3136702",
    primeiroEmprego: true,
    recebeSeguroDesemprego: false,
    possuiDeficiencia: false,
    deficiencias: [],
    reabilitado: false
  },
  dependentes: [
    {
      sexo: "Masculino",
      estadoCivil: "Solteiro(a)",
      grauInstrucao: "Analfabeto",
      nacionalidade: "Brasileiro",
      fumante: false,
      consomeAlcool: false
    }
  ]
});

describe("E5 — listas de opção", () => {
  it("toda opção converte para um código do domínio oficial (titular B e dependente D), ou é pendência declarada", () => {
    const casos = [
      ["SEXO", OPCOES_E5_QUESTOR.sexo],
      ["ESTADOCIVIL", OPCOES_E5_QUESTOR.estadoCivil],
      ["GRAUINSTR", OPCOES_E5_QUESTOR.grauInstrucao],
      ["NACIONALIDADE", OPCOES_E5_QUESTOR.nacionalidade]
    ] as const;
    const pendentes: string[] = [];
    for (const [campo, opcoes] of casos) {
      for (const opcao of opcoes) {
        const resultado = converterRotuloQuestor(TABELAS_DE_PARA_QUESTOR[campo], opcao);
        if (!resultado.ok) {
          expect(resultado.declarada, `${campo}:${opcao}`).toBe(true);
          pendentes.push(`${campo}:${opcao}`);
          continue;
        }
        expect(dominio("B", campo)).toContain(resultado.codigo);
        expect(dominio("D", campo)).toContain(resultado.codigo);
      }
    }
    expect(pendentes).toEqual(["ESTADOCIVIL:União estável"]);
    expect(OPCOES_E5_QUESTOR.nacionalidade).toHaveLength(37);
    expect(OPCOES_E5_QUESTOR.grauInstrucao).toHaveLength(13);
  });
});

describe("E5 — contratos de entrada", () => {
  it("campos comuns: tudo opcional, formatos de UF/IBGE e listas fechadas; campo desconhecido recusado", () => {
    expect(fichaE5ComunsSchema.parse({})).toMatchObject({ naturalidadeUf: null, primeiroEmprego: null });
    expect(fichaE5ComunsSchema.safeParse({ naturalidadeUf: "mg" }).data?.naturalidadeUf).toBe("MG");
    expect(fichaE5ComunsSchema.safeParse({ naturalidadeUf: "MGX" }).success).toBe(false);
    expect(fichaE5ComunsSchema.safeParse({ municipioIbge: "310620" }).success).toBe(false);
    expect(fichaE5ComunsSchema.safeParse({ grauInstrucao: "Superior" }).success).toBe(false);
    expect(fichaE5ComunsSchema.safeParse({ nacionalidadeEspecifica: "Haitiano" }).success).toBe(true);
    expect(fichaE5ComunsSchema.safeParse({ empresaId: "x" }).success).toBe(false);
    expect(dependenteE5ComunsSchema.safeParse({ sexo: "Outro" }).success).toBe(false);
    expect(dependenteE5ComunsSchema.safeParse({ estadoCivil: "Solteiro(a)", nacionalidade: "Português" }).success).toBe(
      true
    );
  });

  it("campos sensíveis: coerência entre 'possui deficiência' e os tipos", () => {
    expect(fichaE5SensiveisSchema.safeParse({ possuiDeficiencia: false, deficiencias: ["visual"] }).success).toBe(
      false
    );
    expect(fichaE5SensiveisSchema.safeParse({ possuiDeficiencia: true, deficiencias: [] }).success).toBe(false);
    expect(
      fichaE5SensiveisSchema.safeParse({ possuiDeficiencia: true, deficiencias: ["visual", "visual"] }).success
    ).toBe(false);
    expect(
      fichaE5SensiveisSchema.safeParse({ possuiDeficiencia: true, deficiencias: ["visual", "auditiva"] }).success
    ).toBe(true);
    expect(dependenteE5SensiveisSchema.parse({})).toEqual({ fumante: null, consomeAlcool: null });
  });
});

describe("E5 — mapeamento para o TXT", () => {
  it("preenche os 17 campos do candidato e dos dependentes", () => {
    const { contrato, pendencias } = montarContratoQuestor({ ...base(), questor: parametros(1), e5: e5Completo() });
    expect(pendencias).toEqual([]);
    expect(contrato.B).toMatchObject({
      SIGLAESTADONASC: "MG",
      INDICATPRIMEMP: "1",
      RECEBSEGURODESEMPREGO: "0",
      TIPOADMRAIS: "1",
      TIPOADMCAGED: "10",
      DEFFISICA: "0",
      DEFVISUAL: "0",
      DEFAUDITIVA: "0",
      DEFINTELECTUAL: "0",
      DEFMENTAL: "0",
      DEFREABILITADO: "0"
    });
    expect(contrato.dependentes?.[0]).toMatchObject({
      SEXO: "1",
      ESTADOCIVIL: "1",
      GRAUINSTR: "1",
      NACIONALIDADE: "10",
      FUMANTE: "0",
      CONSOMEALCOOL: "0"
    });
  });

  it("código IBGE é capturado, mas o município NÃO é convertido (Q5)", () => {
    const { contrato } = montarContratoQuestor({ ...base(), questor: parametros(1), e5: e5Completo() });
    expect(contrato.B["CODIGOMUNIC"]).toBeUndefined();
    expect(contrato.B["CODIGOMUNICNASC"]).toBeUndefined();
  });

  it("RAIS/CAGED só derivam com tipo de admissão 1; reemprego vira 2/20", () => {
    const e5 = e5Completo();
    e5.titular = { ...e5.titular, primeiroEmprego: false };
    expect(montarContratoQuestor({ ...base(), questor: parametros(1), e5 }).contrato.B).toMatchObject({
      TIPOADMRAIS: "2",
      TIPOADMCAGED: "20"
    });
    for (const tipo of [2, null]) {
      const { contrato } = montarContratoQuestor({ ...base(), questor: parametros(tipo), e5 });
      expect(contrato.B["TIPOADMRAIS"], `tipo ${tipo}`).toBeUndefined();
      expect(contrato.B["TIPOADMCAGED"], `tipo ${tipo}`).toBeUndefined();
      expect(contrato.B["INDICATPRIMEMP"]).toBe("0");
    }
  });

  it("deficiência marcada vira 1 só nos tipos informados", () => {
    const e5 = e5Completo();
    e5.titular = { ...e5.titular, possuiDeficiencia: true, deficiencias: ["visual", "mental"], reabilitado: true };
    const { contrato } = montarContratoQuestor({ ...base(), questor: parametros(1), e5 });
    expect(contrato.B).toMatchObject({
      DEFFISICA: "0",
      DEFVISUAL: "1",
      DEFAUDITIVA: "0",
      DEFINTELECTUAL: "0",
      DEFMENTAL: "1",
      DEFREABILITADO: "1"
    });
  });

  it("'Estrangeira' + nacionalidade específica da documentação resolve a pendência", () => {
    const snapshot = base();
    snapshot.ficha = { ...snapshot.ficha!, nacionalidade: "Estrangeira" };
    expect(montarContratoQuestor(snapshot).pendencias.map((item) => item.campo)).toEqual(["NACIONALIDADE"]);
    const e5 = e5Completo();
    e5.titular = { ...e5.titular, nacionalidadeEspecifica: "Haitiano" };
    const resolvido = montarContratoQuestor({ ...snapshot, e5 });
    expect(resolvido.contrato.B["NACIONALIDADE"]).toBe("40");
    expect(resolvido.pendencias).toEqual([]);
  });

  it("brasileira não é sobrescrita pela nacionalidade específica", () => {
    const e5 = e5Completo();
    e5.titular = { ...e5.titular, nacionalidadeEspecifica: "Haitiano" };
    expect(montarContratoQuestor({ ...base(), e5 }).contrato.B["NACIONALIDADE"]).toBe("10");
  });

  it("'União estável' no dependente continua pendente com a Conplus (Q13)", () => {
    const e5 = e5Completo();
    e5.dependentes = [{ ...e5.dependentes[0], estadoCivil: "União estável" }];
    const { contrato, pendencias } = montarContratoQuestor({ ...base(), e5 });
    expect(contrato.dependentes?.[0]?.["ESTADOCIVIL"]).toBeUndefined();
    expect(pendencias).toEqual([
      expect.objectContaining({ registro: "D", campo: "ESTADOCIVIL", dependente: 0, natureza: "equivalencia" })
    ]);
  });
});

describe("E5 — prévia de prontidão", () => {
  const avaliar = (snapshot: SnapshotAdmissaoPralis) =>
    avaliarProntidaoQuestor({ processoId: "11111111-1111-4111-8111-111111119f30", snapshot, geradoEm: new Date(0) });

  it("com E2–E5 completos, sobra só o que depende da Conplus (8 campos)", () => {
    const dto = avaliar({ ...base(), questor: parametros(1), e5: e5Completo() });
    expect(dto.resumo.porOrigem).toEqual({ candidato: 0, dp: 0, empresa: 0, codigo_questor: 1, externo: 7 });
    expect(dto.resumo.pendentes).toBe(8);
  });

  it("sem E5, os campos de saúde explicam o bloqueio jurídico (Q11)", () => {
    const dto = avaliar({ ...base(), questor: parametros(1) });
    const campo = (registro: string, nome: string) =>
      dto.registros.find((item) => item.registro === registro)?.campos.find((item) => item.campo === nome);
    expect(campo("B", "DEFFISICA")?.motivo).toContain("Q11");
    expect(campo("D", "FUMANTE")?.motivo).toContain("Q11");
    expect(campo("B", "TIPOADMRAIS")?.motivo).toContain("tipo de admissão é 1");
    expect(campo("B", "SIGLAESTADONASC")?.motivo).toBe("A ficha do candidato ainda não coleta este dado");
  });
});
