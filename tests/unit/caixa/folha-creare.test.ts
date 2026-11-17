import { describe, expect, it } from "vitest";
import {
  conferirEmissaoFolhaCreare,
  alinharPeriodoAFolhaCreare,
  conferirInicioFolhaCreare,
  instanteDaFolhaCreare,
  relatorioVendasCreareSchema
} from "@padaria/shared/caixa";

// R-225 · horario da folha do CREARE x caixa. A folha e sempre hora de Sao Paulo (UTC-3).
describe("horario da folha do CREARE", () => {
  it("le a data impressa como hora de Sao Paulo", () => {
    expect(instanteDaFolhaCreare("26/10/2026 06:14:58")?.toISOString()).toBe("2026-10-26T09:14:58.000Z");
    expect(instanteDaFolhaCreare("26/10/2026 - 13:58:46")?.toISOString()).toBe("2026-10-26T16:58:46.000Z");
    expect(instanteDaFolhaCreare("26/13/2026 06:14:58")).toBeNull();
    expect(instanteDaFolhaCreare("ontem de manha")).toBeNull();
  });

  const aberturaOficial = "2026-10-26T09:30:00.000Z"; // 06:30 em Sao Paulo

  it("confere o inicio da folha com o inicio das vendas, com 2 minutos de tolerancia", () => {
    const base = { inicioVendas: aberturaOficial };
    expect(conferirInicioFolhaCreare({ ...base, periodoInicio: "26/10/2026 06:31:02" })).toEqual({
      situacao: "ok",
      diferencaMinutos: 1
    });
    expect(conferirInicioFolhaCreare({ ...base, periodoInicio: "26/10/2026 06:14:58" })).toEqual({
      situacao: "divergente",
      diferencaMinutos: -15
    });
    expect(conferirInicioFolhaCreare({ ...base, periodoInicio: null }).situacao).toBe("pendente");
  });

  it("emissao x corte do fechamento e informativo", () => {
    const corte = "2026-10-26T17:00:00.000Z"; // 14:00
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 14:05:00", corte }).situacao).toBe("ok");
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 13:58:46", corte }).situacao).toBe("ok");
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 13:40:00", corte }).situacao).toBe("antes_do_corte");
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 14:30:00", corte }).situacao).toBe("depois_do_corte");
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 14:00:00", corte: null }).situacao).toBe("pendente");
  });
});

// R-244 · ao gerar o relatorio de vendas, o periodo do caixa passa a ser o da folha (Periodo de -> Data da emissao).
describe("alinhamento do periodo do caixa a folha do CREARE", () => {
  // Caixa da manha: aberto no sistema 06:30, corte 13:50 (Sao Paulo).
  const base = {
    periodoInicio: "11/11/2026 05:43:33",
    dataEmissao: "11/11/2026 13:53:27",
    aberturaOficial: "2026-11-11T09:30:00.000Z",
    inicioAtual: "2026-11-11T09:30:00.000Z",
    fimAtual: "2026-11-11T16:50:00.000Z",
    fimCaixaAnterior: null,
    inicioProximoCaixa: null,
    agora: new Date("2026-11-11T17:00:00.000Z")
  };

  it("usa o Periodo de e a Data da emissao, mesmo com o caixa aberto depois no sistema", () => {
    const alinhamento = alinharPeriodoAFolhaCreare(base);
    expect(alinhamento.inicio).toEqual({
      antes: "2026-11-11T09:30:00.000Z",
      depois: "2026-11-11T08:43:33.000Z",
      daFolha: true,
      motivo: null
    });
    expect(alinhamento.fim).toEqual({
      antes: "2026-11-11T16:50:00.000Z",
      depois: "2026-11-11T16:53:27.000Z",
      daFolha: true,
      motivo: null
    });
  });

  it("nao invade o caixa anterior nem o proximo do mesmo PDV", () => {
    const alinhamento = alinharPeriodoAFolhaCreare({
      ...base,
      fimCaixaAnterior: "2026-11-11T08:43:33.000Z",
      inicioProximoCaixa: "2026-11-11T16:52:00.000Z"
    });
    expect(alinhamento.inicio).toMatchObject({
      depois: base.inicioAtual,
      daFolha: false,
      motivo: "antes_do_caixa_anterior"
    });
    expect(alinhamento.fim).toMatchObject({ depois: base.fimAtual, daFolha: false, motivo: "depois_do_proximo_caixa" });
  });

  it("mantem o lado sem hora lida, de outro dia ou no futuro", () => {
    const semHora = alinharPeriodoAFolhaCreare({ ...base, periodoInicio: null, dataEmissao: "" });
    expect(semHora.inicio).toMatchObject({ depois: base.inicioAtual, motivo: "sem_horario" });
    expect(semHora.fim).toMatchObject({ depois: base.fimAtual, motivo: "sem_horario" });
    expect(alinharPeriodoAFolhaCreare({ ...base, periodoInicio: "10/11/2026 05:43:33" }).inicio.motivo).toBe(
      "outro_dia"
    );
    expect(alinharPeriodoAFolhaCreare({ ...base, dataEmissao: "11/11/2026 14:30:00" }).fim.motivo).toBe("no_futuro");
  });

  it("nunca inverte o periodo", () => {
    // Emissao antes do inicio da folha: o fim fica no corte do sistema.
    const fimAntes = alinharPeriodoAFolhaCreare({ ...base, dataEmissao: "11/11/2026 05:00:00" });
    expect(fimAntes.fim.motivo).toBe("fim_antes_do_inicio");
    // Inicio da folha depois do fim mantido: os dois ficam como estavam.
    const inicioDepois = alinharPeriodoAFolhaCreare({
      ...base,
      periodoInicio: "11/11/2026 13:55:00",
      inicioProximoCaixa: "2026-11-11T16:52:00.000Z"
    });
    expect(inicioDepois.fim.motivo).toBe("depois_do_proximo_caixa");
    expect(inicioDepois.inicio).toMatchObject({ depois: base.inicioAtual, motivo: "fim_antes_do_inicio" });
  });
});

describe("contrato da folha do CREARE", () => {
  it("guarda a sangria positiva, aceita saldo final negativo e deixa ausente como null", () => {
    const leitura = relatorioVendasCreareSchema.parse({
      documentoLegivel: true,
      sangria: -600,
      saldoFinalDinheiro: -12.5,
      dataEmissao: "26/10/2026 - 13:58:46",
      periodoInicio: "texto sem data"
    });
    expect(leitura).toMatchObject({
      sangria: 600,
      saldoFinalDinheiro: -12.5,
      dataEmissao: "26/10/2026 13:58:46",
      periodoInicio: null,
      credito: null,
      total: null
    });
  });

  it("correcao manual: guarda justificativa e campos; justificativa curta e recusada", () => {
    const comCorrecao = relatorioVendasCreareSchema.parse({
      documentoLegivel: true,
      correcaoManual: { justificativa: "Foto cortada no total", campos: ["Total"] }
    });
    expect(comCorrecao.correcaoManual).toEqual({ justificativa: "Foto cortada no total", campos: ["Total"] });
    expect(relatorioVendasCreareSchema.parse({ documentoLegivel: true }).correcaoManual).toBeNull();
    expect(
      relatorioVendasCreareSchema.safeParse({
        documentoLegivel: true,
        correcaoManual: { justificativa: "ok", campos: ["Total"] }
      }).success
    ).toBe(false);
  });

  it("recusa valor negativo onde o cupom nao imprime sinal", () => {
    expect(relatorioVendasCreareSchema.safeParse({ documentoLegivel: true, credito: -1 }).success).toBe(false);
  });
});
