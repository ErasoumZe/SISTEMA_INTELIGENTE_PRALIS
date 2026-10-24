import { describe, expect, it } from "vitest";
import { dependentePayloadSchema } from "../../shared/src/admissoes/dependentes.js";
import { fichaEnviarPayloadSchema, fichaRascunhoPayloadSchema } from "../../shared/src/admissoes/ficha.js";

/** E5 (Questor) nos contratos públicos da ficha e dos dependentes. Dados fictícios. */
describe("E5 — contratos da ficha e dos dependentes", () => {
  it("rascunho aceita os campos E5 e normaliza a UF", () => {
    const dados = fichaRascunhoPayloadSchema.parse({
      versao: 1,
      naturalidadeUf: "sp",
      grauInstrucao: "Especialização",
      municipioIbge: "3550308",
      nacionalidadeEspecifica: "Português",
      primeiroEmprego: true,
      recebeSeguroDesemprego: false
    });
    expect(dados).toMatchObject({ naturalidadeUf: "SP", primeiroEmprego: true, recebeSeguroDesemprego: false });
  });

  it("campos de saúde enviados ao rascunho são descartados — não há onde coletá-los (Q11)", () => {
    const dados = fichaRascunhoPayloadSchema.parse({
      versao: 1,
      possuiDeficiencia: true,
      deficiencias: ["visual"],
      reabilitado: true
    });
    expect(dados).not.toHaveProperty("possuiDeficiencia");
    expect(dados).not.toHaveProperty("deficiencias");
    expect(dados).not.toHaveProperty("reabilitado");
  });

  it("envio com nacionalidade 'Estrangeira' exige a nacionalidade específica", () => {
    const base = {
      versao: 1,
      semDependentes: true,
      avisoPrivacidadeVersao: "AVISO-TESTE-1",
      nascimento: "2000-05-05",
      sexo: "Feminino",
      estadoCivil: "Solteiro(a)",
      racaCor: "Parda",
      nacionalidade: "Estrangeira",
      naturalidade: "Cidade Ficticia",
      nomeMae: "Mae Ficticia",
      cep: "36037467",
      logradouro: "Rua Ficticia",
      numero: "54",
      bairro: "Bairro Ficticio",
      municipio: "Cidade Ficticia",
      uf: "MG",
      telefone: "32999990000"
    };
    const sem = fichaEnviarPayloadSchema.safeParse(base);
    expect(sem.success).toBe(false);
    expect(sem.error?.issues.map((issue) => issue.path.join("."))).toEqual(["nacionalidadeEspecifica"]);
    expect(fichaEnviarPayloadSchema.safeParse({ ...base, nacionalidadeEspecifica: "Haitiano" }).success).toBe(true);
    expect(fichaEnviarPayloadSchema.safeParse({ ...base, nacionalidade: "Brasileira" }).success).toBe(true);
  });

  it("dependente: campos E5 opcionais, nulos por padrão, listas fechadas", () => {
    const minimo = dependentePayloadSchema.parse({
      nomeCompleto: "Dependente Ficticio",
      nascimento: "2020-01-01",
      parentesco: "Filho(a)"
    });
    expect(minimo).toMatchObject({ sexo: null, estadoCivil: null, grauInstrucao: null, nacionalidade: null });
    expect(
      dependentePayloadSchema.safeParse({
        nomeCompleto: "D",
        nascimento: "2020-01-01",
        parentesco: "Filho(a)",
        grauInstrucao: "Faculdade"
      }).success
    ).toBe(false);
    expect(
      dependentePayloadSchema.parse({
        nomeCompleto: "D",
        nascimento: "2020-01-01",
        parentesco: "Filho(a)",
        fumante: true
      })
    ).not.toHaveProperty("fumante");
  });
});
