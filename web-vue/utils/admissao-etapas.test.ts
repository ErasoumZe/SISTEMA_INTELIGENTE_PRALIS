import { describe, expect, it } from "vitest";
import { etapasDoProcesso } from "~/utils/admissao-etapas";

const internos = (exameSituacao: "pendente" | "aso_apto") => ({ exameSituacao });

describe("etapasDoProcesso", () => {
  it("mostra o exame como etapa atual quando ainda não há ASO apto", () => {
    const etapas = etapasDoProcesso({
      efetivado: false,
      fichaSituacao: null,
      internos: internos("pendente"),
      podeRevisarFicha: true,
      efetivavel: false
    });

    expect(etapas.map((etapa) => etapa.estado)).toEqual(["concluida", "atual", "pendente", "pendente"]);
  });

  it("não marca a efetivação como pronta sem os fatos necessários", () => {
    const etapas = etapasDoProcesso({
      efetivado: false,
      fichaSituacao: "aprovada",
      internos: internos("aso_apto"),
      podeRevisarFicha: true,
      efetivavel: false
    });

    expect(etapas[2].estado).toBe("concluida");
    expect(etapas[3].estado).toBe("pendente");
  });

  it("representa um colaborador efetivado sem criar novo status", () => {
    const etapas = etapasDoProcesso({
      efetivado: true,
      fichaSituacao: "concluida_dp",
      internos: internos("aso_apto"),
      podeRevisarFicha: true,
      efetivavel: false
    });

    expect(etapas.every((etapa) => etapa.estado === "concluida")).toBe(true);
  });
});
