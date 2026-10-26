import { describe, expect, it } from "vitest";
import {
  LAYOUT_ADMISSAO_QUESTOR,
  avaliarProntidaoQuestor,
  origemDoCampoQuestor,
  prontidaoQuestorDtoSchema,
  type SnapshotAdmissaoPralis,
  type TipoRegistroQuestor
} from "../../shared/src/conplus/index.js";

const PROCESSO_ID = "11111111-1111-4111-8111-111111119f00";
const GERADO_EM = new Date("2026-10-22T12:00:00Z");

/** Admissão fictícia: tudo que a ficha e o DP coletam hoje, preenchido e válido. */
function snapshotCompleto(): SnapshotAdmissaoPralis {
  return {
    empresa: { cnpj: "11222333000181" },
    processo: { nomeCompleto: "Pessoa Ficticia Prontidao", cpf: "12345678909" },
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

const avaliar = (snapshot: SnapshotAdmissaoPralis) =>
  avaliarProntidaoQuestor({ processoId: PROCESSO_ID, snapshot, geradoEm: GERADO_EM });

const campo = (
  dto: ReturnType<typeof avaliar>,
  registro: TipoRegistroQuestor,
  nome: string,
  dependente: number | null = null
) =>
  dto.registros
    .find((item) => item.registro === registro && item.dependente === dependente)
    ?.campos.find((item) => item.campo === nome);

describe("prévia de prontidão Questor", () => {
  it("todo campo obrigatório do layout tem origem declarada", () => {
    const semOrigem = (Object.keys(LAYOUT_ADMISSAO_QUESTOR) as TipoRegistroQuestor[]).flatMap((registro) =>
      LAYOUT_ADMISSAO_QUESTOR[registro]
        .filter((item) => item.requerido && !origemDoCampoQuestor(registro, item.campo))
        .map((item) => `${registro}.${item.campo}`)
    );
    expect(semOrigem).toEqual([]);
  });

  it("separa os 28 campos prontos dos 57 pendentes, por origem, e mantém a exportação bloqueada", () => {
    const dto = avaliar(snapshotCompleto());
    expect(prontidaoQuestorDtoSchema.parse(dto)).toEqual(dto);
    expect(dto.exportacaoDisponivel).toBe(false);
    expect(dto.aptoParaExportacao).toBe(false);
    expect(dto.motivoBloqueio).toContain("57 campo(s)");
    expect(dto.resumo).toEqual({
      requeridos: 85,
      requeridosProntos: 28,
      pendentes: 57,
      invalidos: 0,
      bloqueados: 3,
      // externo: A.TERMOCONSENTIMENTO/GERARPRELIMINAR/CATEGESOCIAL/CATEGORIA + B.CODIGOMUNIC/CODIGOMUNICNASC/TIPOVINCULO
      porOrigem: { candidato: 17, dp: 9, empresa: 18, codigo_questor: 6, externo: 7 }
    });
    expect(dto.registros.map((item) => `${item.registro}${item.dependente ?? ""}`)).toEqual(["A", "B", "C", "D0"]);
  });

  it("não devolve nenhum valor pessoal — só situação e origem", () => {
    const texto = JSON.stringify(avaliar(snapshotCompleto()));
    for (const valor of [
      "12345678909",
      "123.456.789-09",
      "Pessoa Ficticia",
      "Mae Ficticia",
      "36037467",
      "Rua Ficticia",
      "1234567"
    ]) {
      expect(texto).not.toContain(valor);
    }
    expect(Object.keys(campo(avaliar(snapshotCompleto()), "A", "CPFFUNC")!).sort()).toEqual(
      ["campo", "coluna", "motivo", "nomeCurto", "origem", "requerido", "situacao"].sort()
    );
  });

  it("aponta a origem de cada pendência: candidato, DP, empresa, código Questor ou externo", () => {
    const dto = avaliar(snapshotCompleto());
    expect(campo(dto, "B", "SIGLAESTADONASC")).toMatchObject({ situacao: "pendente", origem: "candidato" });
    expect(campo(dto, "A", "VALORSAL")).toMatchObject({ situacao: "pendente", origem: "dp" });
    expect(campo(dto, "B", "OPTANTEFGTS")).toMatchObject({ situacao: "pendente", origem: "empresa" });
    expect(campo(dto, "A", "CODIGOSIND")).toMatchObject({ situacao: "pendente", origem: "codigo_questor" });
    expect(campo(dto, "B", "CODIGOMUNIC")).toMatchObject({ situacao: "pendente", origem: "externo" });
    expect(campo(dto, "B", "CODIGOMUNIC")?.motivo).toContain("Q5");
    expect(campo(dto, "A", "DATAADM")).toMatchObject({ situacao: "pronto", origem: "dp", motivo: null });
  });

  it("mantém os três campos ambíguos como bloqueados", () => {
    const dto = avaliar(snapshotCompleto());
    for (const [registro, nome, dependente] of [
      ["C", "INDAPREND", null],
      ["C", "ORGAOEMISSORRNE", null],
      ["D", "ENTREGACERT", 0]
    ] as const) {
      expect(campo(dto, registro, nome, dependente)).toMatchObject({ situacao: "bloqueado", origem: "externo" });
    }
  });

  it("valor sem equivalência comprovada fica pendente com a Conplus; valor fora da lista volta para quem preencheu", () => {
    const base = snapshotCompleto();
    const dto = avaliar({
      ...base,
      ficha: { ...base.ficha!, estadoCivil: "União estável", racaCor: "Morena", numero: "S/N" },
      dependentes: [{ ...base.dependentes[0]!, parentesco: "Companheiro(a)" }]
    });
    expect(campo(dto, "B", "ESTADOCIVIL")).toMatchObject({ situacao: "pendente", origem: "externo" });
    expect(campo(dto, "B", "NUMEROENDER")).toMatchObject({ situacao: "pendente", origem: "externo" });
    expect(campo(dto, "B", "RACACOR")).toMatchObject({ situacao: "pendente", origem: "candidato" });
    expect(campo(dto, "D", "PARENTESCO", 0)).toMatchObject({ situacao: "pendente", origem: "externo" });
  });

  it("dado em formato errado e texto acima do layout aparecem como pendente/inválido, sem correção", () => {
    const base = snapshotCompleto();
    const dto = avaliar({
      ...base,
      processo: { nomeCompleto: "Nome Ficticio ".repeat(6).trim(), cpf: "123" }
    });
    expect(campo(dto, "A", "CPFFUNC")).toMatchObject({ situacao: "pendente", origem: "dp" });
    expect(campo(dto, "A", "NOMEFUNC")).toMatchObject({ situacao: "invalido", origem: "dp" });
    expect(dto.resumo.invalidos).toBe(1);
  });

  it("processo sem ficha nem bloco interno: tudo do candidato e do DP fica pendente", () => {
    const dto = avaliar({ ...snapshotCompleto(), internos: null, ficha: null, dependentes: [] });
    expect(campo(dto, "A", "DATANASC")).toMatchObject({ situacao: "pendente", origem: "candidato" });
    expect(campo(dto, "A", "DATANASC")?.motivo).toBe("Não preenchido no Pralís para este processo");
    expect(campo(dto, "B", "PISFUNC")).toMatchObject({ situacao: "pendente", origem: "dp" });
    expect(dto.registros.some((item) => item.registro === "D")).toBe(false);
  });
});
